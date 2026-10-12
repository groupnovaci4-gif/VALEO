/**
 * Back-office — comptes utilisateurs de l'app : recherche, liste, fiche,
 * création, modification, formule, suspension, suppression définitive.
 *
 * Aucune donnée financière ici. Un compte du PERSONNEL ne se gère jamais par
 * ces fonctions (sinon un rôle « support » pourrait suspendre un Super Admin) :
 * il passe par la gestion de l'équipe (staff.ts) et ses règles.
 */
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import type { DocumentSnapshot, Query } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { deleteUserData } from '../accountDeletion';
import { actorOf, bad, COL, db, deny, mirrorToLogging, openAudit, requireStaff, str, writeAudit, type StaffCtx } from './context';
import { validateReason } from './auditCore';
import { serverDefaultProfile } from './profile';
import { cleanEmail, cleanName, COUNTRY_CODES, CURRENCY_CODES } from './registry';

const PAGE = 25;
const PLANS = ['free', 'plus', 'family'] as const;
const STORE_PROVIDERS = ['google_play', 'app_store', 'stripe', 'mobile_money'];
const MAX_PLAN_MS = 366 * 24 * 3600 * 1000;

const uidArg = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : bad('bo/uid'));

async function authUser(uid: string): Promise<UserRecord> {
  const u = await getAuth().getUser(uid).catch(() => null);
  if (!u) throw new HttpsError('not-found', 'bo/user-not-found');
  return u;
}

/** Refus (journalisé) si la cible est un collaborateur du back-office. */
async function assertNotStaff(c: StaffCtx, uid: string, action: string) {
  const s = await db().doc(`${COL.staff}/${uid}`).get();
  if (s.exists) await deny({ uid: c.uid, email: c.email, roleId: c.roleId }, action, 'bo/target-is-staff', { targetUid: uid, targetLabel: String(s.get('displayName') ?? '') });
}

/** Résumé non financier d'un compte. */
function summary(uid: string, profile: DocumentSnapshot | null, status: DocumentSnapshot | null, auth?: UserRecord) {
  const p = profile?.exists ? profile.data()! : {};
  const sub = (p.subscription ?? {}) as { plan?: string; status?: string; provider?: string; expiresAt?: number | null };
  return {
    uid,
    email: (auth?.email ?? p.email ?? null) as string | null,
    firstName: (p.firstName ?? '') as string,
    lastName: (p.lastName ?? '') as string,
    country: (p.country ?? null) as string | null,
    currency: (p.currency ?? null) as string | null,
    language: (p.language ?? null) as string | null,
    plan: sub.plan ?? 'free',
    planStatus: sub.status ?? 'active',
    planProvider: sub.provider ?? 'none',
    planEndsAt: sub.expiresAt ?? null,
    createdAt: (p.createdAt ?? null) as number | null,
    lastActiveAt: (p.updatedAt ?? null) as number | null,
    status: status?.get('status') === 'suspended' || auth?.disabled ? 'suspended' : 'active',
    hasProfile: !!profile?.exists,
  };
}

export async function searchUsers(req: CallableRequest) {
  await requireStaff(req, 'users.view', 'user.search');
  const q = typeof req.data?.q === 'string' ? req.data.q.trim() : '';
  if (!q || q.length > 254) bad('bo/query');
  // Recherche EXACTE uniquement : e-mail complet ou identifiant complet.
  const auth = q.includes('@') ? await getAuth().getUserByEmail(q.toLowerCase()).catch(() => null) : /^[A-Za-z0-9_-]{6,128}$/.test(q) ? await getAuth().getUser(q).catch(() => null) : null;
  if (!auth) return { users: [] };
  const [profile, status] = await Promise.all([db().doc(`users/${auth.uid}`).get(), db().doc(`${COL.accountStatus}/${auth.uid}`).get()]);
  return { users: [summary(auth.uid, profile, status, auth)] };
}

export async function listUsers(req: CallableRequest) {
  await requireStaff(req, 'users.view', 'user.list');
  const { cursor, plan, country, status } = req.data ?? {};
  if (status === 'suspended') {
    // Comptes suspendus : liste tirée de accountStatus (jamais de lecture de tous les profils).
    let q: Query = db().collection(COL.accountStatus).where('status', '==', 'suspended').orderBy('since', 'desc');
    if (typeof cursor === 'string') {
      const c = await db().doc(`${COL.accountStatus}/${uidArg(cursor)}`).get();
      if (c.exists) q = q.startAfter(c);
    }
    const snap = await q.limit(PAGE + 1).get();
    const docs = snap.docs.slice(0, PAGE);
    const profiles = docs.length ? await db().getAll(...docs.map((d) => db().doc(`users/${d.id}`))) : [];
    return { users: docs.map((d, i) => summary(d.id, profiles[i], d)), next: snap.docs.length > PAGE ? docs[docs.length - 1].id : null };
  }
  let q: Query = db().collection('users');
  if (typeof plan === 'string' && (PLANS as readonly string[]).includes(plan)) q = q.where('subscription.plan', '==', plan);
  if (typeof country === 'string' && COUNTRY_CODES.includes(country)) q = q.where('country', '==', country);
  q = q.orderBy('createdAt', 'desc');
  if (typeof cursor === 'string') {
    const c = await db().doc(`users/${uidArg(cursor)}`).get();
    if (c.exists) q = q.startAfter(c);
  }
  const snap = await q.limit(PAGE + 1).get();
  const docs = snap.docs.slice(0, PAGE);
  const statuses = docs.length ? await db().getAll(...docs.map((d) => db().doc(`${COL.accountStatus}/${d.id}`))) : [];
  return { users: docs.map((d, i) => summary(d.id, d, statuses[i])), next: snap.docs.length > PAGE ? docs[docs.length - 1].id : null };
}

export async function getUser(req: CallableRequest) {
  const c = await requireStaff(req, 'users.view', 'user.view');
  const uid = uidArg(req.data?.uid);
  const auth = await authUser(uid);
  const [profile, status, staff, spaces, devices] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    db().doc(`${COL.accountStatus}/${uid}`).get(),
    db().doc(`${COL.staff}/${uid}`).get(),
    db().collection('spaces').where('memberIds', 'array-contains', uid).limit(20).get(),
    db().collection(`users/${uid}/devices`).count().get(),
  ]);
  let history: unknown[] | null = null;
  if (c.permissions.includes('audit.view')) {
    const h = await db().collection(COL.audit).where('targetUid', '==', uid).orderBy('seq', 'desc').limit(10).get();
    history = h.docs.map((d) => {
      const e = d.data();
      return { seq: e.seq, atMs: e.atMs, action: e.action, result: e.result, actorEmail: e.actorEmail, actorRole: e.actorRole, reasonCode: e.reasonCode };
    });
  }
  return {
    user: summary(uid, profile, status, auth),
    auth: { disabled: auth.disabled, emailVerified: auth.emailVerified, createdAt: auth.metadata.creationTime ?? null, lastSignInAt: auth.metadata.lastSignInTime ?? null, providers: auth.providerData.map((p) => p.providerId) },
    suspension: status.exists ? { status: status.get('status'), since: status.get('since') ?? null, reasonCode: status.get('reasonCode') ?? null } : null,
    isStaff: staff.exists,
    devices: devices.data().count,
    spaces: spaces.docs.map((s) => ({
      id: s.id,
      kind: s.get('kind'),
      name: s.get('name'),
      role: (s.get('members') ?? {})[uid] ?? null,
      memberCount: ((s.get('memberIds') as string[] | undefined) ?? []).length,
    })),
    history,
  };
}

export async function createUser(req: CallableRequest) {
  const c = await requireStaff(req, 'users.create', 'user.create');
  const d = req.data ?? {};
  const email = cleanEmail(d.email);
  const firstName = cleanName(d.firstName);
  const lastName = cleanName(d.lastName, true);
  if (!email) bad('bo/email');
  if (!firstName) bad('bo/firstName');
  if (lastName === null || lastName === undefined) bad('bo/lastName');
  if (!COUNTRY_CODES.includes(d.country)) bad('bo/country');
  if (!CURRENCY_CODES.includes(d.currency)) bad('bo/currency');
  if (d.language !== 'fr' && d.language !== 'en') bad('bo/language');
  const timezone = typeof d.timezone === 'string' && d.timezone.length <= 64 && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(d.timezone) ? d.timezone : 'Africa/Abidjan';
  if (await getAuth().getUserByEmail(email).catch(() => null)) throw new HttpsError('already-exists', 'bo/email-exists');
  // Compte SANS mot de passe : la personne le choisit elle-même via le lien reçu par e-mail.
  const user = await getAuth().createUser({ email, emailVerified: false, displayName: `${firstName} ${lastName}`.trim() });
  const now = Date.now();
  const profile = serverDefaultProfile({ uid: user.uid, email, firstName, lastName, country: d.country, currency: d.currency, language: d.language, timezone }, now);
  const entry = await db().runTransaction(async (tx) => {
    const audit = await openAudit(tx);
    tx.create(db().doc(`users/${user.uid}`), profile);
    return audit.write({ ...actorOf(c), action: 'user.create', result: 'ok', targetUid: user.uid, targetEmail: email, after: { firstName, lastName, country: d.country, currency: d.currency, language: d.language, plan: 'free' } });
  });
  mirrorToLogging([entry]);
  return { uid: user.uid };
}

export async function updateUser(req: CallableRequest) {
  const c = await requireStaff(req, 'users.edit', 'user.edit');
  const uid = uidArg(req.data?.uid);
  const changes = (req.data?.changes ?? {}) as Record<string, unknown>;
  await assertNotStaff(c, uid, 'user.edit');
  const auth = await authUser(uid);
  const patch: Record<string, unknown> = {};
  if ('firstName' in changes) patch.firstName = cleanName(changes.firstName) ?? bad('bo/firstName');
  if ('lastName' in changes) {
    const v = cleanName(changes.lastName, true);
    patch.lastName = v === null || v === undefined ? bad('bo/lastName') : v;
  }
  if ('country' in changes) patch.country = COUNTRY_CODES.includes(changes.country as string) ? changes.country : bad('bo/country');
  if ('currency' in changes) patch.currency = CURRENCY_CODES.includes(changes.currency as string) ? changes.currency : bad('bo/currency');
  if ('language' in changes) patch.language = changes.language === 'fr' || changes.language === 'en' ? changes.language : bad('bo/language');
  let newEmail: string | null = null;
  if ('email' in changes) {
    newEmail = cleanEmail(changes.email) ?? bad('bo/email');
    if (newEmail === auth.email) newEmail = null;
    else if (await getAuth().getUserByEmail(newEmail).catch(() => null)) throw new HttpsError('already-exists', 'bo/email-exists');
    if (newEmail) patch.email = newEmail;
  }
  if (!Object.keys(patch).length) bad('bo/no-change');
  const ref = db().doc(`users/${uid}`);
  const before = (await ref.get()).data() ?? {};
  if (newEmail) await getAuth().updateUser(uid, { email: newEmail, emailVerified: false });
  // `updatedAt` du profil n'est PAS touché : il sert à mesurer l'activité de l'utilisateur.
  const entry = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const audit = await openAudit(tx);
    if (snap.exists) tx.update(ref, patch);
    const b: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) b[k] = k === 'email' ? auth.email : before[k];
    return audit.write({ ...actorOf(c), action: 'user.edit', result: 'ok', targetUid: uid, targetEmail: newEmail ?? auth.email, before: b, after: patch });
  });
  mirrorToLogging([entry]);
  return { ok: true };
}

/** Formule attribuée à la main (D8) : Super Admin seulement, date de fin obligatoire, motif. */
export async function setPlan(req: CallableRequest) {
  const c = await requireStaff(req, 'users.changePlan', 'user.plan');
  const uid = uidArg(req.data?.uid);
  const { plan, endsAt } = req.data ?? {};
  if (!(PLANS as readonly string[]).includes(plan)) bad('bo/plan');
  const reason = validateReason(req.data?.reasonCode, req.data?.reasonNote);
  if (!reason.ok) bad('bo/reason');
  const now = Date.now();
  if (plan !== 'free' && (typeof endsAt !== 'number' || endsAt <= now || endsAt > now + MAX_PLAN_MS)) bad('bo/endsAt');
  await assertNotStaff(c, uid, 'user.plan');
  const auth = await authUser(uid);
  const ref = db().doc(`users/${uid}`);
  const entry = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const audit = await openAudit(tx);
    if (!snap.exists) throw new HttpsError('failed-precondition', 'bo/no-profile');
    const cur = (snap.get('subscription') ?? {}) as { plan?: string; provider?: string; expiresAt?: number | null };
    // Un abonnement payé via une boutique n'est jamais écrasé à la main.
    if (cur.provider && STORE_PROVIDERS.includes(cur.provider)) throw new HttpsError('failed-precondition', 'bo/plan-store-managed');
    const next = plan === 'free' ? { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: now } : { plan, status: 'active', provider: 'manual', expiresAt: endsAt, updatedAt: now };
    tx.update(ref, { subscription: next });
    return audit.write({
      ...actorOf(c),
      action: 'user.plan',
      result: 'ok',
      targetUid: uid,
      targetEmail: auth.email,
      reasonCode: reason.reasonCode,
      reasonNote: reason.reasonNote ?? undefined,
      before: { plan: cur.plan ?? 'free', planEndsAt: cur.expiresAt ?? null, provider: cur.provider ?? 'none' },
      after: { plan: next.plan, planEndsAt: next.expiresAt, provider: next.provider },
    });
  });
  mirrorToLogging([entry]);
  return { ok: true };
}

/** Suspension : compte Auth désactivé + jetons révoqués + appareils retirés (D6). Aucune donnée touchée. */
export async function setSuspended(req: CallableRequest) {
  const c = await requireStaff(req, 'users.suspend', 'user.suspend');
  const uid = uidArg(req.data?.uid);
  const suspend = req.data?.suspended === true;
  const action = suspend ? 'user.suspend' : 'user.reactivate';
  const reason = validateReason(req.data?.reasonCode, req.data?.reasonNote);
  if (!reason.ok) bad('bo/reason');
  await assertNotStaff(c, uid, action);
  const auth = await authUser(uid);
  const statusRef = db().doc(`${COL.accountStatus}/${uid}`);
  const current = (await statusRef.get()).get('status') === 'suspended' || auth.disabled;
  if (current === suspend) throw new HttpsError('failed-precondition', 'bo/no-change');
  const now = Date.now();
  if (suspend) {
    await getAuth().updateUser(uid, { disabled: true });
    await getAuth().revokeRefreshTokens(uid);
    // Jetons push : plus de notifications ; l'app les réenregistre à la reconnexion.
    await db().recursiveDelete(db().collection(`users/${uid}/devices`));
  } else {
    await getAuth().updateUser(uid, { disabled: false });
  }
  const entry = await db().runTransaction(async (tx) => {
    const audit = await openAudit(tx);
    tx.set(statusRef, { status: suspend ? 'suspended' : 'active', since: now, by: c.uid, reasonCode: reason.reasonCode });
    return audit.write({
      ...actorOf(c),
      action,
      result: 'ok',
      targetUid: uid,
      targetEmail: auth.email,
      reasonCode: reason.reasonCode,
      reasonNote: reason.reasonNote ?? undefined,
      before: { status: suspend ? 'active' : 'suspended' },
      after: { status: suspend ? 'suspended' : 'active' },
    });
  });
  mirrorToLogging([entry]);
  return { ok: true };
}

/** Suppression définitive : même logique que « Supprimer mon compte » (deleteUserData). */
export async function deleteUser(req: CallableRequest) {
  const c = await requireStaff(req, 'users.delete', 'user.delete');
  const uid = uidArg(req.data?.uid);
  const reason = validateReason(req.data?.reasonCode, req.data?.reasonNote);
  if (!reason.ok) bad('bo/reason');
  await assertNotStaff(c, uid, 'user.delete');
  const auth = await authUser(uid);
  // Deuxième confirmation, vérifiée ici aussi : l'adresse retapée doit être exacte.
  if (!auth.email || str(req.data?.confirmEmail, 254)?.toLowerCase() !== auth.email.toLowerCase()) bad('bo/confirm');
  const email = auth.email.toLowerCase();
  try {
    await deleteUserData(uid, email);
    await db().doc(`${COL.accountStatus}/${uid}`).delete().catch(() => undefined);
  } catch (e) {
    await writeAudit({ ...actorOf(c), action: 'user.delete', result: 'error', targetUid: uid, targetEmail: email, reasonCode: reason.reasonCode, code: 'bo/delete-failed' });
    throw e instanceof HttpsError ? e : new HttpsError('internal', 'bo/delete-failed');
  }
  // D11 : le journal garde l'identifiant, le domaine et une empreinte de l'adresse, jamais l'adresse.
  await writeAudit({ ...actorOf(c), action: 'user.delete', result: 'ok', targetUid: uid, targetEmail: email, reasonCode: reason.reasonCode, reasonNote: reason.reasonNote ?? undefined });
  return { ok: true };
}

