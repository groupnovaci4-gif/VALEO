/**
 * Back-office — invitation des collaborateurs.
 *
 * 1. `boInviteStaff` (Super Admin) : compte Auth SANS mot de passe, collaborateur
 *    au statut `invited` (aucune permission), invitation `boInvites` avec un
 *    jeton aléatoire valable 7 jours. Le portail envoie l'e-mail avec le modèle
 *    Firebase gratuit (D7), le lien d'invitation en lien de suite.
 * 2. L'invité ouvre le lien : `boViewInvite` lui montre qui l'invite et pour quel
 *    rôle ; `boAcceptInvite` vérifie le jeton ET l'adresse tapée, enregistre le
 *    mot de passe QU'IL a choisi, passe le collaborateur à `active`. Il n'a encore
 *    aucune permission : la double vérification est exigée à sa première connexion.
 * 3. `boResendInvite` (nouveau jeton, 7 jours de plus ; l'ancien lien ne marche
 *    plus), `boRevokeInvite`, `boGetInviteLink` (copier le lien pour WhatsApp).
 *
 * Le jeton est stocké HACHÉ (vérification) et CHIFFRÉ avec BO_MFA_KEY (pour pouvoir
 * recopier le lien) ; il n'apparaît jamais au journal. Usage unique : effacé à
 * l'acceptation. Tout refus est journalisé.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { actorOf, bad, COL, db, deny, mfaKey, mirrorToLogging, openAudit, requireStaff, writeAudit, type StaffDoc } from './context';
import { BUILTIN_ROLES, canInviteRole, isBuiltinRole } from './permissions';
import { maskEmail } from './auditCore';
import { cleanEmail, cleanName, passwordError } from './registry';
import { decryptSecret, encryptSecret } from './totp';

export const INVITE_MS = 7 * 24 * 3600 * 1000;
export const MAX_ACCEPT_FAILS = 5;

export type InviteStatus = 'sent' | 'accepted' | 'revoked';
export interface InviteDoc {
  email: string;
  displayName: string;
  roleId: string;
  uid: string;
  /** Compte Auth créé pour l'invitation (supprimé si elle est annulée avant acceptation). */
  createdAuthUser: boolean;
  invitedBy: string;
  invitedByName: string;
  status: InviteStatus;
  tokenHash: string | null;
  tokenEnc: string | null;
  createdAt: number;
  sentAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
  revokedBy: string | null;
  failedAttempts: number;
}

/** Statut affiché : « envoyée », « acceptée », « expirée », « annulée ». PUR. */
export function displayStatus(i: Pick<InviteDoc, 'status' | 'expiresAt'>, now = Date.now()): 'sent' | 'accepted' | 'expired' | 'revoked' {
  if (i.status === 'sent' && i.expiresAt <= now) return 'expired';
  return i.status;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const idArg = (v: unknown, code: string): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : bad(code));
const newToken = () => randomBytes(32).toString('base64url');

async function roleName(roleId: string): Promise<string | null> {
  if (isBuiltinRole(roleId)) return BUILTIN_ROLES[roleId].name;
  const r = await db().doc(`${COL.roles}/${roleId}`).get();
  return r.exists ? String(r.get('name')) : null;
}

function summary(id: string, i: InviteDoc, now = Date.now()) {
  return { id, email: i.email, displayName: i.displayName, roleId: i.roleId, invitedByName: i.invitedByName, status: displayStatus(i, now), sentAt: i.sentAt, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt, revokedAt: i.revokedAt };
}

// ─── Côté Super Admin ─────────────────────────────────────────────────

export async function inviteStaff(req: CallableRequest) {
  const c = await requireStaff(req, 'staff.manage', 'staff.invite');
  const email = cleanEmail(req.data?.email) ?? bad('bo/email');
  const displayName = cleanName(req.data?.displayName) ?? bad('bo/displayName');
  const roleId = typeof req.data?.roleId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(req.data.roleId) ? req.data.roleId : bad('bo/role');
  const rName = (await roleName(roleId)) ?? bad('bo/role');
  const actor = { uid: c.uid, email: c.email, roleId: c.roleId };
  if (!canInviteRole(c.roleId, roleId)) return deny(actor, 'staff.invite', 'staff/super-admin-only', { targetLabel: displayName, after: { role: roleId } });
  let user = await getAuth().getUserByEmail(email).catch(() => null);
  // D15 : adresse DÉDIÉE au travail, distincte d'un compte personnel de l'app.
  if (user && (await db().doc(`users/${user.uid}`).get()).exists) return deny(actor, 'staff.invite', 'bo/staff-has-app-account', { targetLabel: displayName }, 'failed-precondition');
  if (user && (await db().doc(`${COL.staff}/${user.uid}`).get()).exists) throw new HttpsError('already-exists', 'bo/already-staff');
  const createdAuthUser = !user;
  if (!user) user = await getAuth().createUser({ email, emailVerified: false, displayName });
  const uid = user.uid;
  const token = newToken();
  const now = Date.now();
  const ref = db().collection(COL.invites).doc();
  const invite: InviteDoc = {
    email,
    displayName,
    roleId,
    uid,
    createdAuthUser,
    invitedBy: c.uid,
    invitedByName: c.displayName,
    status: 'sent',
    tokenHash: sha(token),
    tokenEnc: encryptSecret(token, mfaKey()),
    createdAt: now,
    sentAt: now,
    expiresAt: now + INVITE_MS,
    acceptedAt: null,
    revokedAt: null,
    revokedBy: null,
    failedAttempts: 0,
  };
  const entry = await db().runTransaction(async (tx) => {
    const audit = await openAudit(tx);
    tx.create(ref, invite);
    tx.create(db().doc(`${COL.staff}/${uid}`), { email, displayName, roleId, status: 'invited', mfa: { enrolled: false, secretEnc: null, pendingSecretEnc: null, recoveryHashes: [], lastStep: null }, createdAt: now, createdBy: c.uid, lastLoginAt: null } satisfies StaffDoc);
    return audit.write({ ...actorOf(c), action: 'staff.invite', result: 'ok', targetUid: uid, targetLabel: displayName, refs: [ref.id], after: { role: roleId, roleName: rName, status: 'invited' } });
  });
  mirrorToLogging([entry]);
  // Le portail compose le lien (son adresse + identifiant + jeton) et envoie l'e-mail.
  return { inviteId: ref.id, token, email, expiresAt: invite.expiresAt };
}

export async function listInvites(req: CallableRequest) {
  await requireStaff(req, 'staff.manage', 'staff.invite-list');
  const snap = await db().collection(COL.invites).orderBy('sentAt', 'desc').limit(100).get();
  const now = Date.now();
  return { invites: snap.docs.map((d) => summary(d.id, d.data() as InviteDoc, now)) };
}

/** Charge une invitation pour une action du Super Admin, avec les refus journalisés. */
async function inviteForAdmin(req: CallableRequest, action: string, allow: ('sent' | 'expired')[]) {
  const c = await requireStaff(req, 'staff.manage', action);
  const id = idArg(req.data?.inviteId, 'bo/invite');
  const ref = db().doc(`${COL.invites}/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'invite/not-found');
  const i = snap.data() as InviteDoc;
  const actor = { uid: c.uid, email: c.email, roleId: c.roleId };
  const st = displayStatus(i);
  if (!(allow as string[]).includes(st)) return deny(actor, action, st === 'accepted' ? 'invite/used' : st === 'revoked' ? 'invite/revoked' : 'invite/expired', { targetUid: i.uid, targetLabel: i.displayName, refs: [id] }, 'failed-precondition');
  if (!canInviteRole(c.roleId, i.roleId)) return deny(actor, action, 'staff/super-admin-only', { targetUid: i.uid, targetLabel: i.displayName, refs: [id] });
  return { c, id, ref, i };
}

/** Renvoyer : nouveau jeton (l'ancien lien ne marche plus) et 7 jours à partir de maintenant. */
export async function resendInvite(req: CallableRequest) {
  const { c, id, ref, i } = await inviteForAdmin(req, 'staff.invite-resend', ['sent', 'expired']);
  const token = newToken();
  const now = Date.now();
  const entry = await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const audit = await openAudit(tx);
    if (cur.get('status') !== 'sent') throw new HttpsError('failed-precondition', 'invite/changed');
    tx.update(ref, { tokenHash: sha(token), tokenEnc: encryptSecret(token, mfaKey()), sentAt: now, expiresAt: now + INVITE_MS, failedAttempts: 0 });
    return audit.write({ ...actorOf(c), action: 'staff.invite-resend', result: 'ok', targetUid: i.uid, targetLabel: i.displayName, refs: [id] });
  });
  mirrorToLogging([entry]);
  return { inviteId: id, token, email: i.email, expiresAt: now + INVITE_MS };
}

/** Copier le lien (WhatsApp) : le jeton en cours, déchiffré ; l'action est journalisée. */
export async function getInviteLink(req: CallableRequest) {
  const { c, id, i } = await inviteForAdmin(req, 'staff.invite-link', ['sent']);
  if (!i.tokenEnc) throw new HttpsError('failed-precondition', 'invite/used');
  await writeAudit({ ...actorOf(c), action: 'staff.invite-link', result: 'ok', targetUid: i.uid, targetLabel: i.displayName, refs: [id] });
  return { inviteId: id, token: decryptSecret(i.tokenEnc, mfaKey()), expiresAt: i.expiresAt };
}

/** Annuler : le lien ne marche plus ; le collaborateur invité est retiré (et son compte Auth s'il a été créé pour l'invitation). */
export async function revokeInvite(req: CallableRequest) {
  const { c, id, ref, i } = await inviteForAdmin(req, 'staff.invite-revoke', ['sent', 'expired']);
  const now = Date.now();
  const entry = await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const staff = await tx.get(db().doc(`${COL.staff}/${i.uid}`));
    const audit = await openAudit(tx);
    if (cur.get('status') !== 'sent') throw new HttpsError('failed-precondition', 'invite/changed');
    tx.update(ref, { status: 'revoked', tokenHash: null, tokenEnc: null, revokedAt: now, revokedBy: c.uid });
    if (staff.exists && staff.get('status') === 'invited') tx.delete(staff.ref);
    return audit.write({ ...actorOf(c), action: 'staff.invite-revoke', result: 'ok', targetUid: i.uid, targetLabel: i.displayName, refs: [id], before: { status: 'invited' }, after: { status: 'revoked' } });
  });
  // Compte créé pour l'invitation et jamais activé (pas de mot de passe) : supprimé, l'adresse redevient libre.
  if (i.createdAuthUser && !(await db().doc(`${COL.staff}/${i.uid}`).get()).exists) await getAuth().deleteUser(i.uid).catch(() => undefined);
  mirrorToLogging([entry]);
  return { ok: true };
}

// ─── Côté invité (sans session) ───────────────────────────────────────

/** Vérifie identifiant + jeton ; refus journalisé (lien expiré, annulé, déjà utilisé, inconnu). */
async function inviteForGuest(data: unknown, action: string) {
  const d = (data ?? {}) as Record<string, unknown>;
  const id = idArg(d.inviteId, 'invite/invalid');
  const token = typeof d.token === 'string' && d.token.length <= 100 ? d.token : bad('invite/invalid');
  const ref = db().doc(`${COL.invites}/${id}`);
  const snap = await ref.get();
  const guest = { uid: null, email: null, roleId: null };
  if (!snap.exists) return deny(guest, action, 'invite/not-found', { refs: [id] }, 'not-found');
  const i = snap.data() as InviteDoc;
  const target = { targetUid: i.uid, targetLabel: i.displayName, refs: [id] };
  const st = displayStatus(i);
  if (st === 'accepted') return deny(guest, action, 'invite/used', target, 'failed-precondition');
  if (st === 'revoked') return deny(guest, action, 'invite/revoked', target, 'failed-precondition');
  const ok = !!i.tokenHash && timingSafeEqual(Buffer.from(i.tokenHash), Buffer.from(sha(token)));
  // Un ancien lien (remplacé par « Renvoyer ») est refusé comme un lien invalide.
  if (!ok) return deny(guest, action, 'invite/invalid-token', target, 'permission-denied');
  if (st === 'expired') return deny(guest, action, 'invite/expired', target, 'failed-precondition');
  return { id, ref, i, target };
}

/** Ce que l'invité voit avant d'accepter : qui l'invite, pour quel rôle, jusqu'à quand. */
export async function viewInvite(req: CallableRequest) {
  const { i } = await inviteForGuest(req.data, 'staff.invite-view');
  return { invitedByName: i.invitedByName, displayName: i.displayName, roleName: (await roleName(i.roleId)) ?? '', email: maskEmail(i.email), expiresAt: i.expiresAt };
}

/** Accepter : adresse invitée retapée, mot de passe choisi par l'invité. Le lien ne sert qu'une fois. */
export async function acceptInvite(req: CallableRequest) {
  const { id, ref, i, target } = await inviteForGuest(req.data, 'staff.invite-accept');
  const guest = { uid: null, email: null, roleId: null };
  const typed = cleanEmail(req.data?.email);
  if (typed !== i.email) {
    // Autre adresse que celle invitée : refus journalisé ; au 5e essai, l'invitation est annulée.
    const fails = (i.failedAttempts ?? 0) + 1;
    const revoke = fails >= MAX_ACCEPT_FAILS;
    await ref.update(revoke ? { failedAttempts: fails, status: 'revoked', tokenHash: null, tokenEnc: null, revokedAt: Date.now(), revokedBy: 'system' } : { failedAttempts: fails });
    if (revoke) await db().doc(`${COL.staff}/${i.uid}`).delete();
    return deny(guest, 'staff.invite-accept', revoke ? 'invite/wrong-email+revoked' : 'invite/wrong-email', { ...target, targetEmail: typed ?? undefined }, 'permission-denied');
  }
  const pErr = passwordError(req.data?.password);
  if (pErr) bad(`invite/password-${pErr}`);
  const now = Date.now();
  // Le jeton est consommé d'abord (transaction) : deux acceptations simultanées ne passent pas toutes les deux.
  const entry = await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const staffRef = db().doc(`${COL.staff}/${i.uid}`);
    const staff = await tx.get(staffRef);
    const audit = await openAudit(tx);
    if (cur.get('status') !== 'sent' || cur.get('tokenHash') !== i.tokenHash) throw new HttpsError('failed-precondition', 'invite/used');
    if (!staff.exists || staff.get('status') !== 'invited') throw new HttpsError('failed-precondition', 'invite/revoked');
    tx.update(ref, { status: 'accepted', tokenHash: null, tokenEnc: null, acceptedAt: now });
    tx.update(staffRef, { status: 'active' });
    return audit.write({ actorUid: i.uid, actorEmail: i.email, actorRole: i.roleId, action: 'staff.invite-accept', result: 'ok', targetUid: i.uid, targetLabel: i.displayName, refs: [id], before: { status: 'invited' }, after: { status: 'active', mfa: 'none' } });
  });
  // Mot de passe tapé par l'invité lui-même (jamais par un collaborateur), envoyé directement au serveur.
  try {
    await getAuth().updateUser(i.uid, { password: req.data.password as string });
  } catch {
    // Échec technique : l'invitation redevient utilisable telle quelle (rien n'est perdu).
    await ref.update({ status: 'sent', tokenHash: i.tokenHash, tokenEnc: i.tokenEnc, acceptedAt: null });
    await db().doc(`${COL.staff}/${i.uid}`).update({ status: 'invited' });
    await writeAudit({ actorUid: i.uid, actorEmail: i.email, actorRole: i.roleId, action: 'staff.invite-accept', result: 'error', code: 'invite/password-failed', ...target });
    throw new HttpsError('unavailable', 'invite/password-failed');
  }
  mirrorToLogging([entry]);
  return { ok: true, email: i.email };
}
