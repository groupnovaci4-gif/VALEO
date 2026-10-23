/**
 * Connexion par téléphone — Cloud Functions (docs/connexion-telephone, DECISIONS.md §5bis ;
 * correctifs de l'audit du 23/10, docs/audits/CORRECTIFS-2026-10-23.md, partie 2).
 *
 *  - `phoneStart`     : envoie un code à 6 chiffres (WhatsApp, SMS en secours) ; limites :
 *                       1 envoi par minute et 5 par jour et par numéro (compteur à part pour un
 *                       appareil déjà connu du compte, S3), 20 par jour et par appareil, plafonds du
 *                       jour global, par canal et par préfixe (alerte au back-office, S4) ; WhatsApp
 *                       ET SMS seulement vers les pays proposés par l'application (S4) ; jeton App
 *                       Check à usage unique (S4).
 *  - `phoneVerify`    : vérifie le code (10 minutes, usage unique, 5 essais) → ticket (10 minutes).
 *  - `phoneSetSecret` : inscription, code oublié ou « Ajouter mon numéro » : code secret à 6 chiffres
 *                       (empreinte scrypt, jamais en clair) → session (jeton personnalisé). Tous les
 *                       contrôles AVANT toute écriture (S11) ; une inscription ne remplace jamais le
 *                       code secret d'un compte existant (S9) ; numéro déjà dans Firebase Auth
 *                       autrement : refusé (S6) ; compte suspendu : refusé (S8).
 *  - `phoneSignIn`    : numéro + code secret ; 5 erreurs → blocage 15 min, 1 h, 24 h par numéro tenté
 *                       (compteur à part pour un appareil connu, S3) ; numéro inconnu ou compte
 *                       disparu = même lecture et même temps de calcul (S2, S11) ; nouveau téléphone →
 *                       code reçu exigé ; compte suspendu : refusé (S8).
 *  « Ajouter mon numéro » (S1, S10) : connexion de moins de 5 minutes, jamais pour un administrateur,
 *  code secret actuel exigé si le compte a déjà un numéro, alerte à chaque ajout.
 * App Check obligatoire. Toutes les données dans des collections fermées au client.
 */
import './options';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { defineInt, defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as P from './phone';
import { phoneProviders, type AlertReason, type Channel, type Lang } from './phoneProviders';
import { forgetPhoneData } from './phoneData';
import { writeAudit } from './backoffice/context';

/** Poivre des empreintes (codes, numéros, appareils, codes secrets). Valeur tapée par le fondateur. */
export const PHONE_CODE_PEPPER = defineSecret('PHONE_CODE_PEPPER');
/** Plafond global d'envois de codes par jour (dépense bornée). */
export const PHONE_DAILY_CAP = defineInt('PHONE_DAILY_CAP', { default: 2000 });
/** S4 : plafonds du jour par canal (SMS, le plus cher) et par préfixe de numéro. */
export const PHONE_SMS_DAILY_CAP = defineInt('PHONE_SMS_DAILY_CAP', { default: P.PHONE_LIMITS.smsDailyCap });
export const PHONE_PREFIX_DAILY_CAP = defineInt('PHONE_PREFIX_DAILY_CAP', { default: P.PHONE_LIMITS.prefixDailyCap });

const OPTS = { secrets: [PHONE_CODE_PEPPER], enforceAppCheck: true, timeoutSeconds: 30, memory: '256MiB' as const };
const PURPOSES = ['signup', 'reset', 'device', 'link'] as const;
type Purpose = (typeof PURPOSES)[number];

const db = (): Firestore => getFirestore();
const fail = (code: FunctionsErrorCode, message: string, details?: Record<string, unknown>): never => {
  throw new HttpsError(code, message, details);
};

const guardRef = (id: string) => db().doc(`phoneGuard/${id}`);
const lang = (v: unknown): Lang => (v === 'en' ? 'en' : 'fr');
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const dialOf = (v: unknown): string => (typeof v === 'string' && /^\d{1,4}$/.test(v) ? v : P.DEFAULT_DIAL);
const deviceOf = (v: unknown): string => {
  const d = str(v, 128);
  if (!d || d.length < 8) fail('invalid-argument', 'phone/device');
  return d as string;
};
const phoneOf = (data: Record<string, unknown>): string => {
  const e164 = P.normalizePhone(String(data.phone ?? ''), dialOf(data.dial));
  if (!e164) fail('invalid-argument', 'phone/invalid-number');
  return e164 as string;
};
const guardOf = (d: FirebaseFirestore.DocumentSnapshot, day: string): P.PhoneGuard => ({ ...P.emptyGuard(day), ...(d.data() as Partial<P.PhoneGuard> | undefined) });
const userOf = (uid: string | null): Promise<UserRecord | null> => (uid ? getAuth().getUser(uid).catch(() => null) : Promise.resolve(null));
const deviceKeys = (d: FirebaseFirestore.DocumentSnapshot): string[] => (d.get('keys') as string[] | undefined) ?? [];

/**
 * Compte relié à un numéro, s'il EXISTE encore (S2) : un index qui désigne un compte supprimé est
 * effacé avec ses données, et le numéro est traité comme inconnu.
 */
async function ownerOf(pk: string): Promise<{ uid: string; user: UserRecord } | null> {
  const index = await db().doc(`phoneIndex/${pk}`).get();
  if (!index.exists) return null;
  const uid = String(index.get('uid'));
  const user = await userOf(uid);
  if (user) return { uid, user };
  await forgetPhoneData(uid);
  await index.ref.delete().catch(() => undefined);
  return null;
}

/** S10 : un administrateur (droit `admin`) ou un collaborateur du back-office n'est jamais relié à un numéro. */
async function isStaffAccount(uid: string, user: UserRecord | null): Promise<boolean> {
  if (user?.customClaims?.admin === true) return true;
  return (await db().doc(`boStaff/${uid}`).get()).exists;
}

/**
 * Code secret ACTUEL d'un compte (S1) : essai réservé avant la vérification (même blocage que la
 * connexion : 5 erreurs → 15 min, 1 h, 24 h), remis à zéro quand il est bon.
 */
async function checkCurrentSecret(uid: string, secret: unknown, pepper: string): Promise<void> {
  const stored = (await db().doc(`phoneSecrets/${uid}`).get()).data() as P.SecretHash | undefined;
  if (!stored) return;
  if (typeof secret !== 'string' || !secret) fail('failed-precondition', 'phone/current-secret');
  const now = Date.now();
  const id = `acct-${uid}`;
  const reserved = await db().runTransaction(async (tx) => {
    const g = guardOf(await tx.get(guardRef(id)), P.dayOf(now));
    if (P.isLocked(g, now)) return { locked: true as const, retryAt: g.lockedUntil };
    const next = P.failureAfter(g, now);
    tx.set(guardRef(id), next, { merge: true });
    return { locked: false as const, next };
  });
  if (reserved.locked) fail('resource-exhausted', 'phone/locked', { retryAt: reserved.retryAt });
  if (!(await P.checkSecret(String(secret), stored, pepper))) {
    const after = reserved.locked ? null : reserved.next;
    if (after && P.isLocked(after, now)) fail('resource-exhausted', 'phone/locked', { retryAt: after.lockedUntil });
    fail('permission-denied', 'phone/wrong-secret');
  }
  await guardRef(id).set({ fails: 0, lockLevel: 0, lockedUntil: 0 }, { merge: true });
}

/** « Ajouter mon numéro » : contrôles communs à l'envoi du code et au choix du code secret (S1, S10). */
async function assertCanLink(req: CallableRequest, currentSecret: unknown, pepper: string): Promise<string> {
  if (!req.auth) fail('unauthenticated', 'phone/auth');
  const uid = req.auth!.uid;
  if (!P.recentLogin(req.auth!.token.auth_time, Date.now())) fail('failed-precondition', 'phone/recent-login');
  if (await isStaffAccount(uid, await userOf(uid))) fail('permission-denied', 'phone/admin');
  await checkCurrentSecret(uid, currentSecret, pepper);
  return uid;
}

// ─── phoneStart ──────────────────────────────────────────────────────

/** Plafond du jour atteint : refus ; alerte au back-office la première fois (une par plafond et par jour). */
const CAP_AUDIT = { global: 'phone.dailyCap', channel: 'phone.channelCap', prefix: 'phone.prefixCap' } as const;

export const phoneStart = onCall({ ...OPTS, consumeAppCheckToken: true }, async (req: CallableRequest) => {
  // S4 : jeton App Check à usage unique — un jeton rejoué ne fait rien envoyer.
  if (P.appCheckReplayed(req.app)) fail('unauthenticated', 'phone/app-check');
  const data = (req.data ?? {}) as Record<string, unknown>;
  const purpose = PURPOSES.includes(data.purpose as Purpose) ? (data.purpose as Purpose) : fail('invalid-argument', 'phone/purpose');
  const e164 = phoneOf(data);
  const channel: Channel = data.channel === 'sms' ? 'sms' : 'whatsapp';
  // 5bis.5 + S4 : SMS ET WhatsApp seulement vers les pays proposés par l'application — refus AVANT tout envoi.
  if (!P.codeCountryAllowed(e164)) fail('failed-precondition', channel === 'sms' ? 'phone/sms-country' : 'phone/country');
  const deviceId = deviceOf(data.deviceId);
  const pepper = PHONE_CODE_PEPPER.value();
  const linkUid = purpose === 'link' ? await assertCanLink(req, data.currentSecret, pepper) : null;
  const providers = phoneProviders();
  if (!providers.available) fail('unavailable', 'phone/unavailable');

  const now = Date.now();
  const day = P.dayOf(now);
  const pk = P.phoneKey(pepper, e164);
  const dk = P.deviceKey(pepper, deviceId);
  // S3 : un appareil déjà connu du compte a son PROPRE compteur d'envois (un inconnu ne l'épuise pas).
  const owner = await ownerOf(pk);
  const known = owner ? deviceKeys(await db().doc(`phoneDevices/${owner.uid}`).get()).includes(dk) : false;
  const sendGuardId = known ? `known-${pk}` : pk;
  const caps = { global: PHONE_DAILY_CAP.value(), channel: channel === 'sms' ? PHONE_SMS_DAILY_CAP.value() : PHONE_DAILY_CAP.value(), prefix: PHONE_PREFIX_DAILY_CAP.value() };
  const capRefs = { global: guardRef(`global-${day}`), channel: guardRef(`global-${day}-${channel}`), prefix: guardRef(`prefix-${day}-${P.prefixOf(e164)}`) };

  const outcome = await db().runTransaction(async (tx) => {
    const [g, dg, gl, ch, pf] = await Promise.all([tx.get(guardRef(sendGuardId)), tx.get(guardRef(`dev-${dk}`)), tx.get(capRefs.global), tx.get(capRefs.channel), tx.get(capRefs.prefix)]);
    const counts = { global: Number(gl.get('sends') ?? 0), channel: Number(ch.get('sends') ?? 0), prefix: Number(pf.get('sends') ?? 0) };
    const snaps = { global: gl, channel: ch, prefix: pf };
    for (const scope of ['global', 'channel', 'prefix'] as const) {
      if (counts[scope] < caps[scope]) continue;
      const first = snaps[scope].get('alerted') !== true;
      if (first) tx.set(capRefs[scope], { alerted: true }, { merge: true });
      return { refused: 'cap' as const, scope, alert: first };
    }
    const guard = guardOf(g, day);
    const decision = P.sendDecision(guard, now, day);
    if (!decision.ok) return { refused: decision.reason, retryAt: decision.retryAt };
    const deviceSends = dg.get('day') === day ? Number(dg.get('sends') ?? 0) : 0;
    if (deviceSends >= P.PHONE_RULES.deviceSendsPerDay) return { refused: 'daily-limit' as const, retryAt: null };
    const sends = guard.day === day ? guard.sends : 0;
    tx.set(g.ref, { ...guard, day, sends: sends + 1, lastSendAt: now });
    tx.set(dg.ref, { day, sends: deviceSends + 1 });
    tx.set(capRefs.global, { sends: counts.global + 1 }, { merge: true });
    tx.set(capRefs.channel, { sends: counts.channel + 1 }, { merge: true });
    tx.set(capRefs.prefix, { sends: counts.prefix + 1 }, { merge: true });
    return { refused: null };
  });

  if (outcome.refused === 'cap') {
    if (outcome.alert) {
      logger.error('phone: daily cap reached', { day, scope: outcome.scope, cap: caps[outcome.scope] });
      await writeAudit({ actorUid: null, actorEmail: null, actorRole: null, action: CAP_AUDIT[outcome.scope], result: 'denied', code: 'phone/daily-cap', after: { cap: caps[outcome.scope], day, scope: outcome.scope } }).catch(() => undefined);
    }
    fail('unavailable', 'phone/unavailable');
  }
  if (outcome.refused === 'too-soon') fail('resource-exhausted', 'phone/too-soon', { retryAt: outcome.retryAt });
  if (outcome.refused === 'daily-limit') fail('resource-exhausted', 'phone/daily-limit');

  const requestId = P.newToken();
  const code = P.newCode();
  await db().doc(`phoneAuth/${requestId}`).set({
    phoneKey: pk,
    e164,
    purpose,
    channel,
    codeHash: P.codeHash(pepper, requestId, code),
    expiresAt: now + P.PHONE_RULES.codeTtlMs,
    attempts: 0,
    used: false,
    uid: linkUid,
    deviceKey: dk,
    createdAt: now,
    // S5 : date de suppression automatique (règle TTL de Firestore, à activer au déploiement).
    deleteAt: Timestamp.fromMillis(now + P.PHONE_LIMITS.requestTtlMs),
  });
  await providers.codes[channel].send(e164, code, lang(data.lang));
  return { requestId, channel, expiresAt: now + P.PHONE_RULES.codeTtlMs, resendAt: now + P.PHONE_RULES.sendIntervalMs };
});

// ─── phoneVerify ─────────────────────────────────────────────────────

export const phoneVerify = onCall(OPTS, async (req: CallableRequest) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const requestId = str(data.requestId, 64) ?? fail('invalid-argument', 'phone/expired');
  const code = typeof data.code === 'string' && /^\d{6}$/.test(data.code) ? data.code : null;
  const pepper = PHONE_CODE_PEPPER.value();
  const now = Date.now();
  const ref = db().doc(`phoneAuth/${requestId}`);
  const ticket = P.newToken();

  const out = await db().runTransaction(async (tx) => {
    const a = await tx.get(ref);
    if (!a.exists) return { error: 'phone/expired' } as const;
    if (a.get('used') === true) return { error: Number(a.get('attempts') ?? 0) >= P.PHONE_RULES.codeMaxAttempts ? 'phone/too-many' : 'phone/used' } as const;
    if (Number(a.get('expiresAt')) <= now) return { error: 'phone/expired' } as const;
    const attempts = Number(a.get('attempts') ?? 0);
    if (!code || !P.sameHash(a.get('codeHash'), P.codeHash(pepper, requestId, code))) {
      const next = attempts + 1;
      const cancelled = next >= P.PHONE_RULES.codeMaxAttempts;
      // S5 : demande annulée → le numéro en clair n'a plus de raison d'être gardé.
      tx.update(ref, cancelled ? { attempts: next, used: true, e164: FieldValue.delete() } : { attempts: next, used: false });
      return cancelled ? ({ error: 'phone/too-many' } as const) : ({ error: 'phone/wrong-code', attemptsLeft: P.PHONE_RULES.codeMaxAttempts - next } as const);
    }
    tx.update(ref, { used: true, verifiedAt: now, ticketHash: P.ticketHash(pepper, ticket), ticketExp: now + P.PHONE_RULES.ticketTtlMs, ticketUsed: false });
    return { ok: true, phoneKey: String(a.get('phoneKey')) } as const;
  });

  if ('error' in out) {
    if (out.error === 'phone/wrong-code') fail('invalid-argument', out.error, { attemptsLeft: out.attemptsLeft });
    fail(out.error === 'phone/too-many' ? 'resource-exhausted' : 'failed-precondition', String(out.error));
  }
  // S2 : un numéro dont le compte n'existe plus est un numéro inconnu.
  const existing = !!(await ownerOf((out as { phoneKey: string }).phoneKey));
  return { ticket, existing };
});

// ─── Tickets ─────────────────────────────────────────────────────────

const ticketQuery = (pepper: string, ticket: string) => db().collection('phoneAuth').where('ticketHash', '==', P.ticketHash(pepper, ticket)).limit(1);
const ticketValid = (d: FirebaseFirestore.DocumentSnapshot | undefined, purposes: Purpose[]): boolean =>
  !!d && d.get('ticketUsed') !== true && Number(d.get('ticketExp')) > Date.now() && purposes.includes(d.get('purpose'));

/** Lecture SANS réserver (S11 : tous les contrôles avant de consommer le ticket et d'écrire quoi que ce soit). */
async function peekTicket(pepper: string, ticket: unknown, purposes: Purpose[]): Promise<FirebaseFirestore.DocumentData> {
  const t = str(ticket, 64) ?? fail('failed-precondition', 'phone/expired');
  const d = (await ticketQuery(pepper, t as string).get()).docs[0];
  return ticketValid(d, purposes) ? (d.data() ?? fail('failed-precondition', 'phone/expired')) : fail('failed-precondition', 'phone/expired');
}

/**
 * Ticket encore valable (10 min, bon usage, bon numéro) RÉSERVÉ : marqué « utilisé » dans la même
 * transaction que sa lecture. Deux appels simultanés avec le même ticket : un seul passe, l'autre
 * reçoit « expiré ». Un ticket réservé n'est jamais rendu (en cas de refus ensuite, nouveau code).
 * S5 : le numéro en clair de la demande est effacé à ce moment-là (il n'est rendu qu'à l'appelant).
 */
async function claimTicket(pepper: string, ticket: unknown, purposes: Purpose[], phoneKey?: string): Promise<FirebaseFirestore.DocumentData> {
  const t = str(ticket, 64) ?? fail('failed-precondition', 'phone/expired');
  const query = ticketQuery(pepper, t as string);
  const claimed = await db().runTransaction(async (tx) => {
    const d = (await tx.get(query)).docs[0];
    if (!ticketValid(d, purposes)) return null;
    if (phoneKey !== undefined && d.get('phoneKey') !== phoneKey) return null;
    tx.update(d.ref, { ticketUsed: true, e164: FieldValue.delete() });
    return d.data() ?? null;
  });
  return claimed ?? fail('failed-precondition', 'phone/expired');
}

// ─── Alertes (5bis.5 ; S1) ───────────────────────────────────────────

async function alertAccount(uid: string, l: Lang, reason: AlertReason): Promise<void> {
  const providers = phoneProviders();
  const [devices, user] = await Promise.all([db().collection(`users/${uid}/devices`).get(), getAuth().getUser(uid).catch(() => null)]);
  const tokens = devices.docs.map((d) => d.get('token')).filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (tokens.length) await providers.alerts.push(uid, tokens, l, reason).catch((e) => logger.warn('phone alert push failed', { e: String(e) }));
  if (user?.email) await providers.alerts.email(uid, user.email, l, reason).catch((e) => logger.warn('phone alert email failed', { e: String(e) }));
}

// ─── phoneSetSecret ──────────────────────────────────────────────────

export const phoneSetSecret = onCall(OPTS, async (req: CallableRequest) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const pepper = PHONE_CODE_PEPPER.value();
  // Code secret contrôlé AVANT de réserver le ticket : un code trop simple ne le consomme pas.
  const secret = typeof data.secret === 'string' ? data.secret : '';
  const problem = P.secretProblem(secret);
  if (problem) fail('invalid-argument', problem === 'weak' ? 'phone/weak-secret' : 'phone/invalid-secret');
  const deviceId = deviceOf(data.deviceId);

  // 1. Tous les contrôles, AVANT de consommer le ticket et d'écrire (S11).
  const peek = await peekTicket(pepper, data.ticket, ['signup', 'reset', 'link']);
  const purpose = peek.purpose as Purpose;
  const pk = String(peek.phoneKey);
  const e164 = String(peek.e164 ?? '');
  const owner = await ownerOf(pk);
  // Le numéro est-il déjà posé dans Firebase Auth, hors connexion par téléphone (console, ajout interrompu) ? (S6)
  const authHolder = e164 ? await getAuth().getUserByPhoneNumber(e164).catch(() => null) : null;

  let uid: string | null;
  if (purpose === 'link') {
    uid = String(peek.uid ?? '');
    if (!req.auth || req.auth.uid !== uid) fail('unauthenticated', 'phone/auth');
    await assertCanLink(req, data.currentSecret, pepper);
    if ((owner && owner.uid !== uid) || (authHolder && authHolder.uid !== uid)) fail('already-exists', 'phone/taken');
  } else if (owner) {
    // S9 : une INSCRIPTION ne remplace jamais le code secret d'un compte existant (« code oublié » seulement).
    if (purpose === 'signup') fail('already-exists', 'phone/exists');
    // S8 : compte suspendu → rien ne change, message « Ce compte est suspendu… ».
    if (owner.user.disabled) fail('permission-denied', 'phone/disabled');
    uid = owner.uid;
  } else {
    // S6 : numéro déjà relié à un compte Auth par un autre moyen → refus, jamais d'ouverture silencieuse.
    if (authHolder) fail('already-exists', 'phone/taken');
    uid = null;
  }

  // 2. Le ticket est réservé (une seule fois), pour CE numéro.
  const a = await claimTicket(pepper, data.ticket, [purpose], pk);
  const number = String(a.e164 ?? e164);

  // 3. Écritures : le compte d'abord (Auth), puis les données en un seul lot.
  const secretsRef = db().doc(`phoneSecrets/${uid ?? '-'}`);
  const previous = uid ? await secretsRef.get() : null;
  if (purpose === 'link') await getAuth().updateUser(uid as string, { phoneNumber: number });
  if (!uid) uid = (await getAuth().createUser({ phoneNumber: number })).uid;
  const hashed = await P.hashSecret(secret, P.newSalt(), pepper);
  const now = Date.now();
  const batch = db().batch();
  // Un autre numéro était relié à ce compte : son index est retiré (le compte garde un seul numéro).
  const oldKey = previous?.get('phoneKey');
  if (purpose === 'link' && typeof oldKey === 'string' && oldKey !== pk) batch.delete(db().doc(`phoneIndex/${oldKey}`));
  batch.set(db().doc(`phoneIndex/${pk}`), { uid, updatedAt: now });
  batch.set(db().doc(`phoneSecrets/${uid}`), { ...hashed, phoneKey: pk, updatedAt: now });
  batch.set(db().doc(`phoneDevices/${uid}`), { keys: FieldValue.arrayUnion(P.deviceKey(pepper, deviceId)), updatedAt: now }, { merge: true });
  batch.set(guardRef(pk), { fails: 0, lockLevel: 0, lockedUntil: 0 }, { merge: true });
  await batch.commit();

  // Alertes (sans aucun code) : numéro ajouté (S1, toujours) ; code secret existant changé (5bis.5).
  if (purpose === 'link') await alertAccount(uid, lang(data.lang), 'linked');
  else if (previous?.exists) await alertAccount(uid, lang(data.lang), 'secret');
  if (purpose === 'link') return { linked: true };
  return { token: await getAuth().createCustomToken(uid), existing: !!owner };
});

// ─── phoneSignIn ─────────────────────────────────────────────────────

export const phoneSignIn = onCall(OPTS, async (req: CallableRequest) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const e164 = phoneOf(data);
  const deviceId = deviceOf(data.deviceId);
  const secret = typeof data.secret === 'string' ? data.secret : '';
  const pepper = PHONE_CODE_PEPPER.value();
  const now = Date.now();
  const day = P.dayOf(now);
  const pk = P.phoneKey(pepper, e164);
  const dk = P.deviceKey(pepper, deviceId);

  // S11 : MÊME lecture dans tous les cas (numéro inconnu compris) : index, appareils, code secret, compte.
  const index = await db().doc(`phoneIndex/${pk}`).get();
  const uid = index.exists ? String(index.get('uid')) : null;
  const probe = uid ?? `inconnu-${pk.slice(0, 20)}`;
  const [devices, secrets, user] = await Promise.all([db().doc(`phoneDevices/${probe}`).get(), db().doc(`phoneSecrets/${probe}`).get(), userOf(probe)]);
  // S3 : erreurs depuis un appareil connu du compte comptées à part (un inconnu ne bloque pas le propriétaire).
  const known = deviceKeys(devices).includes(dk);
  const lockId = known ? `known-${pk}` : pk;

  // L'essai est RÉSERVÉ (compté comme un échec) dans une transaction AVANT toute vérification :
  // des essais envoyés en parallèle ne peuvent pas tous passer le contrôle du blocage.
  const reserved = await db().runTransaction(async (tx) => {
    const g = guardOf(await tx.get(guardRef(lockId)), day);
    if (P.isLocked(g, now)) return { locked: true as const, retryAt: g.lockedUntil };
    const next = P.failureAfter(g, now);
    tx.set(guardRef(lockId), next, { merge: true });
    return { locked: false as const, next };
  });
  if (reserved.locked) fail('resource-exhausted', 'phone/locked', { retryAt: reserved.retryAt });

  // Numéro inconnu ou compte disparu (S2) : le calcul est fait QUAND MÊME (même temps qu'un mauvais code).
  const stored = uid && user ? (secrets.data() as P.SecretHash | undefined) : undefined;
  const matches = await P.checkSecret(secret, stored ?? P.DUMMY_SECRET, pepper);

  if (!uid || !user || !stored || !matches) {
    // L'échec est déjà compté ; s'il a posé le blocage, on le dit.
    const after = reserved.locked ? null : reserved.next;
    if (after && P.isLocked(after, now)) fail('resource-exhausted', 'phone/locked', { retryAt: after.lockedUntil });
    fail('permission-denied', 'phone/wrong-secret');
  }
  // Bon code secret : l'essai réservé est annulé, les compteurs repartent de zéro.
  await guardRef(lockId).set({ fails: 0, lockLevel: 0, lockedUntil: 0 }, { merge: true });
  // S8 : compte suspendu (back-office) → refus côté serveur, avec le message « Ce compte est suspendu… ».
  if (user!.disabled) fail('permission-denied', 'phone/disabled');
  // S10 : un administrateur ne se connecte jamais par numéro.
  if (await isStaffAccount(uid as string, user)) fail('permission-denied', 'phone/admin');

  if (!known) {
    // Nouveau téléphone : le code secret seul ne suffit pas, un code reçu est exigé (DECISIONS.md §2).
    if (!data.ticket) return { needsDevice: true };
    // Ticket du MÊME numéro, réservé en transaction : il n'enregistre qu'un seul appareil.
    await claimTicket(pepper, data.ticket, ['device'], pk);
    await db().doc(`phoneDevices/${uid}`).set({ keys: FieldValue.arrayUnion(dk), updatedAt: now }, { merge: true });
  }
  return { token: await getAuth().createCustomToken(uid as string) };
});
