/**
 * Connexion par téléphone — Cloud Functions (docs/connexion-telephone, DECISIONS.md §5bis).
 *
 *  - `phoneStart`     : envoie un code à 6 chiffres (WhatsApp, SMS en secours) ; limites :
 *                       1 envoi par minute et 5 par jour et par numéro, 20 par jour et par appareil,
 *                       plafond global par jour (alerte au back-office) ; SMS seulement vers les
 *                       pays proposés par l'application (liste blanche).
 *  - `phoneVerify`    : vérifie le code (10 minutes, usage unique, 5 essais) → ticket (10 minutes).
 *  - `phoneSetSecret` : inscription, code oublié ou « Ajouter mon numéro » : code secret à 6 chiffres
 *                       (empreinte scrypt, jamais en clair) → session (jeton personnalisé) ; alerte
 *                       aux appareils et à l'e-mail quand un code secret existant est changé.
 *  - `phoneSignIn`    : numéro + code secret ; 5 erreurs → blocage 15 min, 1 h, 24 h par numéro tenté ;
 *                       numéro inconnu = même temps de calcul ; nouveau téléphone → code reçu exigé.
 * App Check obligatoire. Toutes les données dans des collections fermées au client.
 */
import './options';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { defineInt, defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as P from './phone';
import { phoneProviders, type Channel, type Lang } from './phoneProviders';
import { writeAudit } from './backoffice/context';

/** Poivre des empreintes (codes, numéros, appareils, codes secrets). Valeur tapée par le fondateur. */
export const PHONE_CODE_PEPPER = defineSecret('PHONE_CODE_PEPPER');
/** Plafond global d'envois de codes par jour (dépense bornée). */
export const PHONE_DAILY_CAP = defineInt('PHONE_DAILY_CAP', { default: 2000 });

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

// ─── phoneStart ──────────────────────────────────────────────────────

export const phoneStart = onCall(OPTS, async (req: CallableRequest) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const purpose = PURPOSES.includes(data.purpose as Purpose) ? (data.purpose as Purpose) : fail('invalid-argument', 'phone/purpose');
  const e164 = phoneOf(data);
  const channel: Channel = data.channel === 'sms' ? 'sms' : 'whatsapp';
  // 5bis.5 : SMS seulement vers les pays proposés par l'application — refus AVANT tout envoi.
  if (channel === 'sms' && !P.smsAllowed(e164)) fail('failed-precondition', 'phone/sms-country');
  if (purpose === 'link' && !req.auth) fail('unauthenticated', 'phone/auth');
  const deviceId = deviceOf(data.deviceId);
  const providers = phoneProviders();
  if (!providers.available) fail('unavailable', 'phone/unavailable');

  const pepper = PHONE_CODE_PEPPER.value();
  const now = Date.now();
  const day = P.dayOf(now);
  const pk = P.phoneKey(pepper, e164);
  const dk = P.deviceKey(pepper, deviceId);
  const cap = PHONE_DAILY_CAP.value();

  const outcome = await db().runTransaction(async (tx) => {
    const [g, dg, gl] = await Promise.all([tx.get(guardRef(pk)), tx.get(guardRef(`dev-${dk}`)), tx.get(guardRef(`global-${day}`))]);
    const globalSends = gl.get('sends') ?? 0;
    if (globalSends >= cap) {
      const first = gl.get('alerted') !== true;
      if (first) tx.set(gl.ref, { alerted: true }, { merge: true });
      return { refused: 'cap' as const, alert: first };
    }
    const guard = guardOf(g, day);
    const decision = P.sendDecision(guard, now, day);
    if (!decision.ok) return { refused: decision.reason, retryAt: decision.retryAt };
    const deviceSends = dg.get('day') === day ? Number(dg.get('sends') ?? 0) : 0;
    if (deviceSends >= P.PHONE_RULES.deviceSendsPerDay) return { refused: 'daily-limit' as const, retryAt: null };
    const sends = guard.day === day ? guard.sends : 0;
    tx.set(g.ref, { ...guard, day, sends: sends + 1, lastSendAt: now });
    tx.set(dg.ref, { day, sends: deviceSends + 1 });
    tx.set(gl.ref, { sends: globalSends + 1 }, { merge: true });
    return { refused: null };
  });

  if (outcome.refused === 'cap') {
    if (outcome.alert) {
      logger.error('phone: daily cap reached', { day, cap });
      await writeAudit({ actorUid: null, actorEmail: null, actorRole: null, action: 'phone.dailyCap', result: 'denied', code: 'phone/daily-cap', after: { cap, day } }).catch(() => undefined);
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
    uid: purpose === 'link' ? req.auth?.uid ?? null : null,
    deviceKey: dk,
    createdAt: now,
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
      tx.update(ref, { attempts: next, used: cancelled });
      return cancelled ? ({ error: 'phone/too-many' } as const) : ({ error: 'phone/wrong-code', attemptsLeft: P.PHONE_RULES.codeMaxAttempts - next } as const);
    }
    const index = await tx.get(db().doc(`phoneIndex/${a.get('phoneKey')}`));
    tx.update(ref, { used: true, verifiedAt: now, ticketHash: P.ticketHash(pepper, ticket), ticketExp: now + P.PHONE_RULES.ticketTtlMs, ticketUsed: false });
    return { ok: true, existing: index.exists } as const;
  });

  if ('error' in out) {
    if (out.error === 'phone/wrong-code') fail('invalid-argument', out.error, { attemptsLeft: out.attemptsLeft });
    fail(out.error === 'phone/too-many' ? 'resource-exhausted' : 'failed-precondition', String(out.error));
  }
  return { ticket, existing: (out as { existing: boolean }).existing };
});

// ─── Tickets ─────────────────────────────────────────────────────────

/** Demande vérifiée correspondant à un ticket encore valable (10 min, usage unique). */
async function ticketRequest(pepper: string, ticket: unknown, purposes: Purpose[]): Promise<{ ref: DocumentReference; data: FirebaseFirestore.DocumentData }> {
  const t = str(ticket, 64) ?? fail('failed-precondition', 'phone/expired');
  const snap = await db().collection('phoneAuth').where('ticketHash', '==', P.ticketHash(pepper, t as string)).limit(1).get();
  const d = snap.docs[0];
  if (!d || d.get('ticketUsed') === true || Number(d.get('ticketExp')) <= Date.now() || !purposes.includes(d.get('purpose'))) fail('failed-precondition', 'phone/expired');
  return { ref: d.ref, data: d.data() };
}

// ─── Alerte « code secret changé » (5bis.5) ──────────────────────────

async function alertSecretChanged(uid: string, l: Lang): Promise<void> {
  const providers = phoneProviders();
  const [devices, user] = await Promise.all([db().collection(`users/${uid}/devices`).get(), getAuth().getUser(uid).catch(() => null)]);
  const tokens = devices.docs.map((d) => d.get('token')).filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (tokens.length) await providers.alerts.push(uid, tokens, l).catch((e) => logger.warn('phone alert push failed', { e: String(e) }));
  if (user?.email) await providers.alerts.email(uid, user.email, l).catch((e) => logger.warn('phone alert email failed', { e: String(e) }));
}

// ─── phoneSetSecret ──────────────────────────────────────────────────

export const phoneSetSecret = onCall(OPTS, async (req: CallableRequest) => {
  const data = (req.data ?? {}) as Record<string, unknown>;
  const pepper = PHONE_CODE_PEPPER.value();
  const { ref, data: a } = await ticketRequest(pepper, data.ticket, ['signup', 'reset', 'link']);
  const secret = typeof data.secret === 'string' ? data.secret : '';
  const problem = P.secretProblem(secret);
  if (problem) fail('invalid-argument', problem === 'weak' ? 'phone/weak-secret' : 'phone/invalid-secret');
  const deviceId = deviceOf(data.deviceId);
  const e164 = String(a.e164);
  const pk = String(a.phoneKey);
  const purpose = a.purpose as Purpose;
  const indexRef = db().doc(`phoneIndex/${pk}`);
  const index = await indexRef.get();

  let uid: string;
  if (purpose === 'link') {
    uid = String(a.uid ?? '');
    if (!req.auth || req.auth.uid !== uid) fail('unauthenticated', 'phone/auth');
    if (index.exists && index.get('uid') !== uid) fail('already-exists', 'phone/taken');
  } else if (index.exists) {
    uid = String(index.get('uid'));
  } else {
    const existing = await getAuth().getUserByPhoneNumber(e164).catch(() => null);
    uid = existing ? existing.uid : (await getAuth().createUser({ phoneNumber: e164 })).uid;
  }

  const secretsRef = db().doc(`phoneSecrets/${uid}`);
  const previous = await secretsRef.get();
  const hashed = await P.hashSecret(secret, P.newSalt(), pepper);
  if (purpose === 'link') {
    // Un autre numéro était relié à ce compte : son index est retiré (le compte garde un seul numéro).
    const oldKey = previous.get('phoneKey');
    if (typeof oldKey === 'string' && oldKey !== pk) await db().doc(`phoneIndex/${oldKey}`).delete();
    await getAuth().updateUser(uid, { phoneNumber: e164 });
  }
  const now = Date.now();
  const batch = db().batch();
  batch.set(indexRef, { uid, updatedAt: now });
  batch.set(secretsRef, { ...hashed, phoneKey: pk, updatedAt: now });
  batch.set(db().doc(`phoneDevices/${uid}`), { keys: FieldValue.arrayUnion(P.deviceKey(pepper, deviceId)), updatedAt: now }, { merge: true });
  batch.update(ref, { ticketUsed: true });
  batch.set(guardRef(pk), { fails: 0, lockLevel: 0, lockedUntil: 0 }, { merge: true });
  await batch.commit();

  // Un code secret EXISTANT vient d'être changé : alerte aux appareils et à l'e-mail (sans aucun code).
  if (previous.exists) await alertSecretChanged(uid, lang(data.lang));
  if (purpose === 'link') return { linked: true };
  return { token: await getAuth().createCustomToken(uid), existing: index.exists };
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

  const guard = guardOf(await guardRef(pk).get(), day);
  if (P.isLocked(guard, now)) fail('resource-exhausted', 'phone/locked', { retryAt: guard.lockedUntil });

  // Numéro inconnu : le calcul est fait QUAND MÊME (même temps qu'un mauvais code).
  const index = await db().doc(`phoneIndex/${pk}`).get();
  const uid = index.exists ? String(index.get('uid')) : null;
  const stored = uid ? ((await db().doc(`phoneSecrets/${uid}`).get()).data() as P.SecretHash | undefined) : undefined;
  const matches = await P.checkSecret(secret, stored ?? P.DUMMY_SECRET, pepper);

  if (!uid || !stored || !matches) {
    const after = await db().runTransaction(async (tx) => {
      const g = guardOf(await tx.get(guardRef(pk)), day);
      const next = P.failureAfter(g, now);
      tx.set(guardRef(pk), next, { merge: true });
      return next;
    });
    if (P.isLocked(after, now)) fail('resource-exhausted', 'phone/locked', { retryAt: after.lockedUntil });
    fail('permission-denied', 'phone/wrong-secret');
  }
  await guardRef(pk).set({ fails: 0, lockLevel: 0, lockedUntil: 0 }, { merge: true });

  const dk = P.deviceKey(pepper, deviceId);
  const devices = await db().doc(`phoneDevices/${uid}`).get();
  const known = ((devices.get('keys') as string[] | undefined) ?? []).includes(dk);
  if (!known) {
    // Nouveau téléphone : le code secret seul ne suffit pas, un code reçu est exigé (DECISIONS.md §2).
    if (!data.ticket) return { needsDevice: true };
    const { ref, data: a } = await ticketRequest(pepper, data.ticket, ['device']);
    if (a.phoneKey !== pk) fail('failed-precondition', 'phone/expired');
    const batch = db().batch();
    batch.update(ref, { ticketUsed: true });
    batch.set(db().doc(`phoneDevices/${uid}`), { keys: FieldValue.arrayUnion(dk), updatedAt: now }, { merge: true });
    await batch.commit();
  }
  return { token: await getAuth().createCustomToken(uid as string) };
});
