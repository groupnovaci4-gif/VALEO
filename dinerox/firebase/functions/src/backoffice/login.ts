/**
 * Back-office — connexion au portail : mot de passe PUIS code, vérifiés par le
 * serveur, avec un nombre d'essais limité PAR COMPTE et chaque refus journalisé.
 *
 * 1. `boLoginStart(email, mot de passe)` : le serveur vérifie le mot de passe
 *    auprès de Firebase Auth (API REST), puis que le compte est un collaborateur
 *    actif. Réponse : un « défi » valable 5 min (et, au premier passage, le
 *    secret à scanner dans l'appli d'authentification).
 * 2. `boLoginVerify(email, défi, code)` : code à 6 chiffres (ou code de secours).
 *    Succès → session de 12 h (`boSessions`) et jeton personnalisé portant
 *    `boSid` ; le portail s'y connecte avec signInWithCustomToken.
 *
 * Essais : 5 échecs (mot de passe, défi ou code) → compte verrouillé 15 min.
 * Le verrou porte sur l'ADRESSE tentée (empreinte), pas sur l'IP, et réagit de
 * la même façon pour une adresse inconnue (rien ne révèle quels comptes existent).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { COL, db, deny, mfaKey, mirrorToLogging, openAudit, requireStaff, resolveRole, SESSION_MS, writeAudit, type StaffDoc } from './context';
import { emailHash } from './auditCore';
import { decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, newTotpSecret, normalizeRecovery, verifyTotp } from './totp';
import { passwordError } from './registry';

/** Clé d'API WEB du projet (publique, celle de la config Firebase du portail) : sert à vérifier un mot de passe. */
export const BO_WEB_API_KEY = defineString('BO_WEB_API_KEY', { default: '' });

export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

const normEmail = (v: unknown): string | null => (typeof v === 'string' && /^\S+@\S+\.\S+$/.test(v.trim()) && v.length <= 200 ? v.trim().toLowerCase() : null);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const guardRef = (email: string) => db().doc(`${COL.loginGuard}/${emailHash(email)}`);

/** Vérifie un mot de passe auprès de Firebase Auth. Renvoie l'uid, ou null. */
async function checkPassword(email: string, password: string): Promise<string | null> {
  const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emu ? `http://${emu}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const key = BO_WEB_API_KEY.value() || (emu ? 'emulator' : '');
  if (!key) throw new HttpsError('failed-precondition', 'bo/misconfigured');
  const res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) throw new HttpsError('unavailable', 'bo/unavailable');
  if (!res.ok) return null;
  const body = (await res.json()) as { localId?: string };
  return typeof body.localId === 'string' ? body.localId : null;
}

/** Échec : compteur + verrou éventuel (transaction : deux essais simultanés comptent tous les deux). */
async function registerFailure(email: string, keepChallenge: boolean): Promise<boolean> {
  return db().runTransaction(async (tx) => {
    const ref = guardRef(email);
    const g = await tx.get(ref);
    const fails = Number(g.get('fails') ?? 0) + 1;
    const lock = fails >= MAX_FAILS;
    // Un code faux garde le défi (on peut retaper le code) ; verrou ou autre échec : défi annulé.
    const clear = lock || !keepChallenge ? { challengeHash: null, challengeUid: null, challengeExp: 0 } : {};
    tx.set(ref, { fails: lock ? 0 : fails, lockedUntil: lock ? Date.now() + LOCK_MS : Number(g.get('lockedUntil') ?? 0), ...clear }, { merge: true });
    return lock;
  });
}

async function isLocked(email: string): Promise<boolean> {
  const g = await guardRef(email).get();
  return Number(g.get('lockedUntil') ?? 0) > Date.now();
}

async function staffActorFor(email: string): Promise<{ uid: string | null; email: string | null; roleId: string | null; targetEmail?: string }> {
  const user = await getAuth().getUserByEmail(email).catch(() => null);
  const staff = user ? await db().doc(`${COL.staff}/${user.uid}`).get() : null;
  if (user && staff?.exists) return { uid: user.uid, email: String(staff.get('email')), roleId: String(staff.get('roleId')) };
  // Adresse qui n'est pas celle d'un collaborateur : domaine + empreinte seulement.
  return { uid: null, email: null, roleId: null, targetEmail: email };
}

async function refuse(email: string, action: string, code: string, publicCode = 'bo/login-failed'): Promise<never> {
  const locked = await registerFailure(email, code === 'bo/bad-code');
  const a = await staffActorFor(email);
  await writeAudit({ actorUid: a.uid, actorEmail: a.email, actorRole: a.roleId, action, result: 'denied', code: locked ? `${code}+locked` : code, targetEmail: a.targetEmail });
  throw new HttpsError(locked ? 'resource-exhausted' : 'unauthenticated', locked ? 'bo/locked' : publicCode);
}

export async function loginStart(req: CallableRequest) {
  const email = normEmail(req.data?.email);
  const password = typeof req.data?.password === 'string' ? req.data.password : '';
  if (!email || !password || password.length > 200) throw new HttpsError('invalid-argument', 'bo/invalid');
  if (await isLocked(email)) {
    const a = await staffActorFor(email);
    return deny(a, 'auth.login', 'bo/locked', { targetEmail: a.targetEmail }, 'resource-exhausted');
  }
  const uid = await checkPassword(email, password);
  if (!uid) return refuse(email, 'auth.login', 'bo/bad-password');
  const snap = await db().doc(`${COL.staff}/${uid}`).get();
  const staff = snap.exists ? (snap.data() as StaffDoc) : undefined;
  if (!staff || staff.status !== 'active') return refuse(email, 'auth.login', staff ? `bo/staff-${staff.status}` : 'bo/not-staff');
  // Mot de passe correct mais trop court pour le back-office (12 caractères, ex. choisi via
  // « mot de passe oublié ») : refus journalisé, la personne en choisit un nouveau.
  if (passwordError(password)) return deny({ uid, email: staff.email, roleId: staff.roleId }, 'auth.login', 'bo/password-too-short', {}, 'failed-precondition');
  const challenge = randomBytes(32).toString('base64url');
  const enrolled = staff.mfa?.enrolled === true && !!staff.mfa.secretEnc;
  let secret: string | null = null;
  if (!enrolled) {
    // Premier passage (ou double vérification réinitialisée) : nouveau secret à scanner.
    secret = newTotpSecret();
    await snap.ref.update({ 'mfa.pendingSecretEnc': encryptSecret(secret, mfaKey()) });
  }
  await guardRef(email).set({ challengeHash: sha(challenge), challengeUid: uid, challengeExp: Date.now() + CHALLENGE_MS }, { merge: true });
  return { challenge, enroll: secret ? { secret, account: email } : null };
}

export async function loginVerify(req: CallableRequest) {
  const email = normEmail(req.data?.email);
  const challenge = typeof req.data?.challenge === 'string' ? req.data.challenge : '';
  const code = req.data?.code;
  if (!email || !challenge || challenge.length > 100) throw new HttpsError('invalid-argument', 'bo/invalid');
  if (await isLocked(email)) {
    const a = await staffActorFor(email);
    return deny(a, 'auth.login', 'bo/locked', { targetEmail: a.targetEmail }, 'resource-exhausted');
  }
  const g = await guardRef(email).get();
  const expected = String(g.get('challengeHash') ?? '');
  const okChallenge = expected.length === 64 && Number(g.get('challengeExp') ?? 0) > Date.now() && timingSafeEqual(Buffer.from(expected), Buffer.from(sha(challenge)));
  if (!okChallenge) return refuse(email, 'auth.login', 'bo/challenge');
  const uid = String(g.get('challengeUid'));
  const key = mfaKey();
  const now = Date.now();
  const sid = randomBytes(24).toString('base64url');

  const outcome = await db().runTransaction(async (tx) => {
    const staffRef = db().doc(`${COL.staff}/${uid}`);
    const snap = await tx.get(staffRef);
    const audit = await openAudit(tx);
    const staff = snap.exists ? (snap.data() as StaffDoc) : undefined;
    if (!staff || staff.status !== 'active') return { ok: false as const, code: 'bo/not-staff' };
    const mfa = staff.mfa ?? {};
    const enrolled = mfa.enrolled === true && !!mfa.secretEnc;
    let step: number | null = null;
    let usedRecovery = false;
    let recoveryCodes: string[] | null = null;
    let hashes = mfa.recoveryHashes ?? [];
    if (enrolled) {
      step = verifyTotp(decryptSecret(mfa.secretEnc!, key), code, now, mfa.lastStep);
      if (step === null) {
        const rc = normalizeRecovery(code);
        const h = rc ? hashRecovery(rc, key) : null;
        if (h && hashes.includes(h)) {
          usedRecovery = true;
          hashes = hashes.filter((x) => x !== h); // usage unique
        }
      }
    } else if (mfa.pendingSecretEnc) {
      step = verifyTotp(decryptSecret(mfa.pendingSecretEnc, key), code, now, null);
      if (step !== null) {
        recoveryCodes = newRecoveryCodes();
        hashes = recoveryCodes.map((c) => hashRecovery(c.replace('-', ''), key));
      }
    }
    if (step === null && !usedRecovery) return { ok: false as const, code: 'bo/bad-code', staff };
    const { roleName } = await resolveRole(staff, tx);
    tx.update(staffRef, {
      ...(enrolled ? {} : { 'mfa.enrolled': true, 'mfa.secretEnc': mfa.pendingSecretEnc, 'mfa.pendingSecretEnc': null }),
      'mfa.recoveryHashes': hashes,
      'mfa.lastStep': step ?? mfa.lastStep ?? null,
      lastLoginAt: now,
    });
    tx.set(db().doc(`${COL.sessions}/${uid}`), { sid, createdAt: now, expiresAt: now + SESSION_MS });
    tx.set(guardRef(email), { fails: 0, lockedUntil: 0, challengeHash: null, challengeUid: null, challengeExp: 0 }, { merge: true });
    const entry = audit.write({
      actorUid: uid,
      actorEmail: staff.email,
      actorRole: staff.roleId,
      action: recoveryCodes ? 'auth.mfa-enrolled' : usedRecovery ? 'auth.login-recovery' : 'auth.login',
      result: 'ok',
      targetLabel: roleName,
    });
    return { ok: true as const, recoveryCodes, entry, recoveryLeft: hashes.length };
  });
  if (!outcome.ok) return refuse(email, 'auth.login', outcome.code, outcome.code === 'bo/bad-code' ? 'bo/bad-code' : 'bo/login-failed');
  mirrorToLogging([outcome.entry]);
  const token = await getAuth().createCustomToken(uid, { boSid: sid });
  return { token, recoveryCodes: outcome.recoveryCodes, recoveryLeft: outcome.recoveryLeft, sessionExpiresAt: now + SESSION_MS };
}

/** Déconnexion : la session de double vérification est fermée côté serveur. */
export async function logout(req: CallableRequest) {
  if (!req.auth) return {};
  const ref = db().doc(`${COL.sessions}/${req.auth.uid}`);
  const entry = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const audit = await openAudit(tx);
    if (!s.exists || s.get('sid') !== req.auth?.token.boSid) return undefined;
    const staff = await tx.get(db().doc(`${COL.staff}/${req.auth!.uid}`));
    tx.delete(ref);
    return audit.write({ actorUid: req.auth!.uid, actorEmail: staff.get('email') ?? null, actorRole: staff.get('roleId') ?? null, action: 'auth.logout', result: 'ok' });
  });
  mirrorToLogging([entry]);
  return {};
}

/** Profil du collaborateur connecté : rôle, permissions, échéance de session. */
export async function me(req: CallableRequest) {
  const c = await requireStaff(req, null, 'auth.me');
  const staff = await db().doc(`${COL.staff}/${c.uid}`).get();
  return {
    uid: c.uid,
    email: c.email,
    displayName: c.displayName,
    roleId: c.roleId,
    roleName: c.roleName,
    permissions: c.permissions,
    sessionExpiresAt: c.sessionExpiresAt,
    recoveryLeft: ((staff.get('mfa.recoveryHashes') as string[] | undefined) ?? []).length,
  };
}

/** Nouveaux codes de secours (les anciens deviennent inutilisables) : exige un code valide. */
export async function newRecovery(req: CallableRequest) {
  const c = await requireStaff(req, null, 'auth.recovery-renew');
  const key = mfaKey();
  const now = Date.now();
  const res = await db().runTransaction(async (tx) => {
    const ref = db().doc(`${COL.staff}/${c.uid}`);
    const snap = await tx.get(ref);
    const audit = await openAudit(tx);
    const mfa = (snap.get('mfa') ?? {}) as NonNullable<StaffDoc['mfa']>;
    const step = mfa.secretEnc ? verifyTotp(decryptSecret(mfa.secretEnc, key), req.data?.code, now, mfa.lastStep) : null;
    if (step === null) return null;
    const codes = newRecoveryCodes();
    tx.update(ref, { 'mfa.recoveryHashes': codes.map((x) => hashRecovery(x.replace('-', ''), key)), 'mfa.lastStep': step });
    const entry = audit.write({ actorUid: c.uid, actorEmail: c.email, actorRole: c.roleId, action: 'auth.recovery-renew', result: 'ok' });
    return { codes, entry };
  });
  if (!res) return deny({ uid: c.uid, email: c.email, roleId: c.roleId }, 'auth.recovery-renew', 'bo/bad-code', {}, 'invalid-argument');
  mirrorToLogging([res.entry]);
  return { recoveryCodes: res.codes };
}

/** Changer son mot de passe depuis le portail : session valide + code du moment, 12 caractères au moins. */
export async function changePassword(req: CallableRequest) {
  const c = await requireStaff(req, null, 'auth.password-change');
  const actor = { uid: c.uid, email: c.email, roleId: c.roleId };
  const pErr = passwordError(req.data?.password);
  if (pErr) throw new HttpsError('invalid-argument', `bo/password-${pErr}`);
  const key = mfaKey();
  const now = Date.now();
  const res = await db().runTransaction(async (tx) => {
    const ref = db().doc(`${COL.staff}/${c.uid}`);
    const snap = await tx.get(ref);
    const audit = await openAudit(tx);
    const mfa = (snap.get('mfa') ?? {}) as NonNullable<StaffDoc['mfa']>;
    const step = mfa.secretEnc ? verifyTotp(decryptSecret(mfa.secretEnc, key), req.data?.code, now, mfa.lastStep) : null;
    if (step === null) return null;
    tx.update(ref, { 'mfa.lastStep': step });
    return audit.write({ actorUid: c.uid, actorEmail: c.email, actorRole: c.roleId, action: 'auth.password-change', result: 'ok' });
  });
  if (!res) return deny(actor, 'auth.password-change', 'bo/bad-code', {}, 'invalid-argument');
  await getAuth().updateUser(c.uid, { password: req.data.password as string });
  // Les autres sessions de ce compte sont fermées ; la personne se reconnecte avec le nouveau mot de passe.
  await getAuth().revokeRefreshTokens(c.uid);
  await db().doc(`${COL.sessions}/${c.uid}`).delete();
  mirrorToLogging([res]);
  return { ok: true };
}
