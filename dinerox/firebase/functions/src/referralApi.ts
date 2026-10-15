/**
 * Parrainage — Cloud Functions (le client ne peut JAMAIS écrire un statut de
 * parrainage, une récompense ni un droit Plus : voir firestore.rules).
 *
 * Données (aucune donnée financière) :
 *  - `referralCodes/{code}`            → { uid, createdAt } (serveur seul, aucune lecture client) ;
 *  - `users/{uid}/referral/state`      → mon code, mes compteurs, mes avis (lecture : propriétaire) ;
 *  - `users/{uid}/referrals/{filleul}` → statut de chaque filleul, sans montant (lecture : parrain) ;
 *  - `users/{uid}.referredBy`, `.referralProgress`, `.grants` (écrits ici seulement) ;
 *  - `referralDevices/{empreinte}`     → comptes vus sur un appareil (serveur seul).
 * L'identifiant d'appareil n'est jamais stocké en clair : HMAC-SHA256 avec le
 * secret `REFERRAL_DEVICE_PEPPER`.
 */
import './options';
import { createHmac, randomInt } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type Firestore, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import QRCode from 'qrcode';
import {
  REFERRAL,
  checkApply,
  convertRewards,
  emptyCounters,
  evaluateWeek,
  extendPlusUntil,
  generateCode,
  hasPaidSubscription,
  monthlyCap,
  nextRewardProgress,
  normalizeCode,
  type ActivityGoal,
  type ActivityOp,
  type ParrainCounters,
  type WeekResult,
} from './referral';
import { pageLanguage, renderPage, routeLink } from './links';
import { nextCodeAttempt } from './plans';
import { sendExpoPush, type PushMessage } from './push';

export const REFERRAL_DEVICE_PEPPER = defineSecret('REFERRAL_DEVICE_PEPPER');

const DAY_MS = 24 * 3600 * 1000;
/** Sources qu'un CLIENT peut déclarer ; `tontine` n'est posée que par le serveur (étape 3). */
const SOURCES = ['install_referrer', 'link', 'manual'] as const;
type Source = (typeof SOURCES)[number] | 'tontine';
/** Derniers avis gardés pour le message « à la prochaine ouverture ». */
const MAX_NOTICES = 10;

const db = (): Firestore => getFirestore();

function requireUid(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'auth/required');
  return req.auth.uid;
}

function requireAdmin(req: CallableRequest): void {
  requireUid(req);
  if (req.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'admin/required');
}

/** Empreinte d'appareil : jamais l'identifiant en clair. */
export function deviceHash(deviceId: unknown, pepper: string): string | null {
  if (typeof deviceId !== 'string' || deviceId.length < 4 || deviceId.length > 200 || !pepper) return null;
  return createHmac('sha256', pepper).update(deviceId).digest('hex');
}

const stateRef = (uid: string) => db().doc(`users/${uid}/referral/state`);

interface StateDoc extends ParrainCounters {
  code?: string;
  firstName?: string;
  signups?: number;
  pending?: number;
  ambassador?: { enabled?: boolean; maxRewardsPerMonth?: number } | null;
  refusals?: Record<string, number>;
  refusalsTotal?: number;
  notices?: Notice[];
}

/** Avis au parrain (affiché à la prochaine ouverture) : compteurs seulement. */
export interface Notice {
  kind: 'validated' | 'month' | 'month_banked';
  /** `validated` : avancement « n/5 » ; `month*` : mois gagnés. */
  count: number;
  at: number;
}

function counters(s: StateDoc | undefined): ParrainCounters {
  const e = emptyCounters();
  return {
    validated: s?.validated ?? e.validated,
    converted: s?.converted ?? e.converted,
    monthsEarned: s?.monthsEarned ?? e.monthsEarned,
    monthsByPeriod: s?.monthsByPeriod ?? e.monthsByPeriod,
  };
}

export async function signupAtOf(uid: string): Promise<number> {
  const user = await getAuth().getUser(uid);
  const t = Date.parse(user.metadata.creationTime);
  return Number.isFinite(t) ? t : Date.now();
}

async function recordDevice(uid: string, hash: string | null): Promise<void> {
  if (!hash) return;
  await db().doc(`referralDevices/${hash}`).set({ uids: FieldValue.arrayUnion(uid), updatedAt: Date.now() }, { merge: true });
}

// ─── Mon code ─────────────────────────────────────────────────────────

/** Crée (une fois) ou renvoie le code personnel ; note l'appareil du parrain (anti auto-parrainage). */
export const myReferral = onCall({ secrets: [REFERRAL_DEVICE_PEPPER] }, async (req) => {
  const uid = requireUid(req);
  const data = (req.data ?? {}) as { deviceId?: unknown };
  await recordDevice(uid, deviceHash(data.deviceId, REFERRAL_DEVICE_PEPPER.value()));
  return { code: await ensureReferralCode(uid) };
});

/** Code personnel : créé une seule fois (aussi pour l'organisateur d'une tontine partagée). */
export async function ensureReferralCode(uid: string): Promise<string> {
  const existing = (await stateRef(uid).get()).get('code') as string | undefined;
  if (existing) return existing;
  const firstName = ((await db().doc(`users/${uid}`).get()).get('firstName') as string | undefined) ?? '';
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode(() => randomInt(0, 1_000_000) / 1_000_000);
    const created = await db().runTransaction(async (tx) => {
      const st = await tx.get(stateRef(uid));
      if (st.get('code')) return st.get('code') as string;
      const codeRef = db().doc(`referralCodes/${code}`);
      if ((await tx.get(codeRef)).exists) return null;
      tx.create(codeRef, { uid, createdAt: Date.now() });
      tx.set(stateRef(uid), { code, firstName: firstName.slice(0, 80), ...emptyCounters(), signups: 0, pending: 0, updatedAt: Date.now() }, { merge: true });
      return code;
    });
    if (created) return created;
  }
  throw new HttpsError('resource-exhausted', 'referral/code-unavailable');
}

// ─── Appliquer un code (filleul) ──────────────────────────────────────

/**
 * Audit 2026-10 (F5) : réserve un essai de code pour ce compte aujourd'hui (aperçu et demande d'une
 * tontine partagée, code de parrainage) ; au-delà de `CODE_DAILY_ATTEMPTS`, refus (`resource-exhausted`).
 */
export async function takeCodeAttempt(uid: string, refusal: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db().doc(`usage/${uid}`);
  await db().runTransaction(async (tx) => {
    const u = await tx.get(ref);
    const next = nextCodeAttempt({ day: u.get('codeTriesDay'), tries: u.get('codeTries') }, day);
    if (!next.allowed) throw new HttpsError('resource-exhausted', refusal);
    tx.set(ref, next.patch, { merge: true });
  });
}

export const applyReferral = onCall({ secrets: [REFERRAL_DEVICE_PEPPER] }, async (req) => {
  const uid = requireUid(req);
  await takeCodeAttempt(uid, 'referral/too-many-tries');
  const data = (req.data ?? {}) as { code?: unknown; source?: unknown; deviceId?: unknown };
  const source: Source = SOURCES.includes(data.source as (typeof SOURCES)[number]) ? (data.source as Source) : 'manual';
  const result = await applyReferralCore(uid, normalizeCode(data.code), source, deviceHash(data.deviceId, REFERRAL_DEVICE_PEPPER.value()));
  if (result.refusal) throw new HttpsError('failed-precondition', result.refusal);
  return { parrainFirstName: result.parrainFirstName };
});

/**
 * Applique un code (mêmes contrôles anti-triche quelle que soit la source).
 * Un compte qui a DÉJÀ un parrain n'est jamais modifié (`referral/already-referred`).
 */
export async function applyReferralCore(uid: string, code: string, source: Source, hash: string | null): Promise<{ refusal: string | null; parrainUid: string | null; parrainFirstName?: string }> {
  const now = Date.now();
  const signupAt = await signupAtOf(uid);
  const codeSnap = code ? await db().doc(`referralCodes/${code}`).get() : null;
  const parrainUid = (codeSnap?.exists ? (codeSnap.get('uid') as string) : null) ?? null;

  const result = await db().runTransaction(async (tx) => {
    const userRef = db().doc(`users/${uid}`);
    const user = await tx.get(userRef);
    const device = hash ? await tx.get(db().doc(`referralDevices/${hash}`)) : null;
    const refusal = checkApply({
      code,
      parrainUid,
      filleulUid: uid,
      signupAt,
      now,
      alreadyReferred: !!user.get('referredBy'),
      deviceHash: hash,
      deviceUids: (device?.get('uids') as string[] | undefined) ?? [],
      deviceFilleulUid: (device?.get('filleulUid') as string | undefined) ?? null,
    });
    if (refusal) return { refusal, parrainUid };
    const parrain = await tx.get(db().doc(`users/${parrainUid}`));
    const parrainFirstName = ((parrain.get('firstName') as string | undefined) ?? '').slice(0, 80);
    const filleulFirstName = ((user.get('firstName') as string | undefined) ?? '').slice(0, 80);
    tx.set(
      userRef,
      {
        referredBy: { uid: parrainUid, code, firstName: parrainFirstName, at: now, source, signupAt },
        referralProgress: { status: 'signed_up', day: 0, activeDays: 0, expenses: 0, incomes: 0, goals: 0, updatedAt: now },
      },
      { merge: true },
    );
    tx.set(db().doc(`users/${parrainUid}/referrals/${uid}`), {
      status: 'signed_up',
      firstName: filleulFirstName,
      source,
      signedUpAt: now,
      validatedAt: null,
      rewardedAt: null,
      progress: { day: 0, activeDays: 0, expenses: 0, incomes: 0, goals: 0 },
      updatedAt: now,
    });
    tx.set(stateRef(parrainUid as string), { signups: FieldValue.increment(1), updatedAt: now }, { merge: true });
    if (hash) tx.set(db().doc(`referralDevices/${hash}`), { uids: FieldValue.arrayUnion(uid), filleulUid: uid, updatedAt: now }, { merge: true });
    return { refusal: null, parrainUid, parrainFirstName };
  });

  if (result.refusal && result.parrainUid && result.refusal !== 'referral/already-referred') {
    // Comptage des refus par parrain (écran admin : suspicions de fraude). Jamais de détail personnel.
    await stateRef(result.parrainUid)
      .set({ refusals: { [result.refusal.replace('referral/', '')]: FieldValue.increment(1) }, refusalsTotal: FieldValue.increment(1) }, { merge: true })
      .catch(() => undefined);
  }
  return result;
}

// ─── Évaluation de la semaine du filleul ──────────────────────────────

async function loadActivity(uid: string, signupAt: number): Promise<{ ops: ActivityOp[]; goals: ActivityGoal[] }> {
  const until = signupAt + (REFERRAL.VALIDATION_DEADLINE_DAYS + 1) * DAY_MS;
  const space = db().doc(`spaces/${uid}`);
  // Audit 2026-10 (M2) : fenêtre sur l'heure d'arrivée sur le SERVEUR (`syncedAt`) ; le jour compté est choisi par `activityTime`.
  const [ops, goals] = await Promise.all([
    space.collection('transactions').where('syncedAt', '>=', Timestamp.fromMillis(signupAt)).where('syncedAt', '<=', Timestamp.fromMillis(until)).get(),
    space.collection('goals').where('syncedAt', '>=', Timestamp.fromMillis(signupAt)).where('syncedAt', '<=', Timestamp.fromMillis(until)).get(),
  ]);
  const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);
  return {
    ops: ops.docs.map((d) => {
      const x = d.data();
      return { id: d.id, type: x.type, amount: x.amount, categoryId: x.categoryId ?? null, subcategoryId: x.subcategoryId ?? null, tontineId: x.tontineId ?? null, createdAt: x.createdAt, updatedAt: x.updatedAt, createdBy: x.createdBy, deleted: x.deleted, recurringId: x.recurringId ?? null, syncedAt: ms(x.syncedAt) };
    }),
    goals: goals.docs.map((d) => {
      const x = d.data();
      return { id: d.id, createdAt: x.createdAt, updatedAt: x.updatedAt, createdBy: x.createdBy, deleted: x.deleted, syncedAt: ms(x.syncedAt) };
    }),
  };
}

const progressOf = (r: WeekResult) => ({ day: r.progress.day, activeDays: r.progress.activeDays, expenses: r.progress.expenses, incomes: r.progress.incomes, goals: r.progress.goals });

/**
 * Convertit les filleuls validés du parrain en mois offerts (dans une transaction).
 * Renvoie les mois accordés et l'avancement « n/5 » après conversion.
 */
async function convertInTx(
  tx: Transaction,
  parrainUid: string,
  now: number,
  extraValidated: number,
): Promise<{ granted: number; banked: boolean; progress: number; waiting: boolean; currentRewarded: boolean; writes: () => void }> {
  const sRef = stateRef(parrainUid);
  const pRef = db().doc(`users/${parrainUid}`);
  const [s, p] = await Promise.all([tx.get(sRef), tx.get(pRef)]);
  const state = s.data() as StateDoc | undefined;
  const before = counters(state);
  before.validated += extraValidated;
  const { counters: after, monthsGranted } = convertRewards(before, now, monthlyCap(state?.ambassador));
  const newlyConverted = after.converted - counters(state).converted;
  // Les plus anciens validés sont convertis d'abord ; le filleul qui vient d'être validé
  // (pas encore écrit dans cette transaction) complète la tranche s'il en fait partie.
  const toReward = newlyConverted > 0
    ? (await tx.get(db().collection(`users/${parrainUid}/referrals`).where('status', '==', 'validated').orderBy('validatedAt').limit(newlyConverted))).docs
    : [];
  const currentRewarded = extraValidated > 0 && toReward.length < newlyConverted;
  const banked = monthsGranted > 0 && hasPaidSubscription(p.get('subscription'), now);
  const next = nextRewardProgress(after);
  // « n/5 » montré au parrain : 5/5 quand ce filleul complète une tranche (le mois suit).
  const shown = monthsGranted > 0 ? REFERRAL.FILLEULS_PER_REWARD : next.count;
  return {
    granted: monthsGranted,
    banked,
    progress: shown,
    waiting: next.waiting,
    currentRewarded,
    writes: () => {
      const notices: Notice[] = [...((state?.notices as Notice[] | undefined) ?? [])];
      if (extraValidated > 0) notices.push({ kind: 'validated', count: shown, at: now });
      if (monthsGranted > 0) notices.push({ kind: banked ? 'month_banked' : 'month', count: monthsGranted, at: now });
      tx.set(sRef, { ...after, pending: after.validated - after.converted, notices: notices.slice(-MAX_NOTICES), updatedAt: now }, { merge: true });
      for (const d of toReward) tx.update(d.ref, { status: 'rewarded', rewardedAt: now, updatedAt: now });
      if (monthsGranted > 0) {
        if (banked) tx.set(pRef, { grants: { bankedMonths: FieldValue.increment(monthsGranted) } }, { merge: true });
        else tx.set(pRef, { grants: { plusUntil: extendPlusUntil(p.get('grants.plusUntil') as number | undefined, now, monthsGranted) } }, { merge: true });
      }
    },
  };
}

/** Réévalue un filleul (déclenché par ses écritures et chaque nuit). Idempotent. */
export async function evaluateFilleul(uid: string, now = Date.now()): Promise<void> {
  const user = await db().doc(`users/${uid}`).get();
  const by = user.get('referredBy') as { uid?: string; signupAt?: number } | undefined;
  if (!by?.uid || user.get('referralProgress.status') !== 'signed_up') return;
  const signupAt = by.signupAt ?? (await signupAtOf(uid));
  const activity = await loadActivity(uid, signupAt);
  const result = evaluateWeek({ ...activity, uid, signupAt, now, timeZone: (user.get('timezone') as string | undefined) || 'Africa/Abidjan' });
  const parrainUid = by.uid;
  const push = await db().runTransaction(async (tx) => {
    const fresh = await tx.get(db().doc(`users/${uid}`));
    if (fresh.get('referralProgress.status') !== 'signed_up') return null;
    const childRef = db().doc(`users/${parrainUid}/referrals/${uid}`);
    const child = await tx.get(childRef);
    const progress = progressOf(result);
    if (result.status === 'validated') {
      const conv = await convertInTx(tx, parrainUid, now, 1);
      tx.set(db().doc(`users/${uid}`), { referralProgress: { status: 'validated', ...progress, updatedAt: now } }, { merge: true });
      if (child.exists) {
        tx.update(childRef, conv.currentRewarded
          ? { status: 'rewarded', validatedAt: result.validatedAt, rewardedAt: now, progress, updatedAt: now }
          : { status: 'validated', validatedAt: result.validatedAt, progress, updatedAt: now });
      }
      conv.writes();
      return conv;
    }
    if (result.status === 'expired') {
      tx.set(db().doc(`users/${uid}`), { referralProgress: { status: 'expired', ...progress, updatedAt: now } }, { merge: true });
      if (child.exists) tx.update(childRef, { status: 'expired', progress, updatedAt: now });
      return null;
    }
    tx.set(db().doc(`users/${uid}`), { referralProgress: { status: 'signed_up', ...progress, updatedAt: now } }, { merge: true });
    if (child.exists) tx.update(childRef, { progress, updatedAt: now });
    return null;
  });
  if (push) await notifyParrain(parrainUid, push);
}

/** Notification push au SEUL parrain concerné : avancement « n/5 », puis mois gagné. */
async function notifyParrain(parrainUid: string, r: { granted: number; banked: boolean; progress: number; waiting: boolean }): Promise<void> {
  const user = await db().doc(`users/${parrainUid}`).get();
  const fr = user.get('language') !== 'en';
  const n = REFERRAL.FILLEULS_PER_REWARD;
  let title: string;
  let body: string;
  if (r.granted > 0 && !r.banked) {
    title = fr ? 'Parrainage' : 'Referrals';
    body = fr ? 'Bravo, vous gagnez 1 mois pour la formule Plus.' : 'Well done, you earn 1 month of the Plus plan.';
  } else if (r.granted > 0) {
    title = fr ? 'Parrainage' : 'Referrals';
    body = fr ? 'Bravo, vous gagnez 1 mois de Plus : il est mis de côté pendant votre abonnement.' : 'Well done, you earn 1 month of Plus: it is set aside during your subscription.';
  } else {
    title = fr ? 'Parrainage' : 'Referrals';
    const count = r.waiting ? n : r.progress;
    body = fr ? `Une personne invitée a utilisé DineroX toute une semaine : ${count}/${n} avant votre prochain mois offert.` : `Someone you invited used DineroX for a whole week: ${count}/${n} towards your next free month.`;
  }
  const devices = await db().collection(`users/${parrainUid}/devices`).get();
  const messages: PushMessage[] = devices.docs.map((d) => ({ to: d.get('token') as string, title, body, data: { url: '/invite' } }));
  if (messages.length) await sendExpoPush(messages);
}

async function maybeEvaluate(spaceId: string): Promise<void> {
  // Seul l'espace PERSONNEL (id = uid) compte ; une famille n'est jamais lue ici.
  if (spaceId.startsWith('fam_') || spaceId === 'local') return;
  const user = await db().doc(`users/${spaceId}`).get();
  if (!user.exists || user.get('referralProgress.status') !== 'signed_up') return;
  await evaluateFilleul(spaceId);
}

/** À chaque opération du filleul (création, modification, suppression). */
export const referralOnTransaction = onDocumentWritten('spaces/{spaceId}/transactions/{docId}', async (event) => {
  await maybeEvaluate(event.params.spaceId);
});

/** À chaque objectif créé ou modifié. */
export const referralOnGoal = onDocumentWritten('spaces/{spaceId}/goals/{docId}', async (event) => {
  await maybeEvaluate(event.params.spaceId);
});

/**
 * Chaque nuit : avance les semaines en cours (jour n/7, expiration après 30
 * jours) et convertit les filleuls mis en réserve par le plafond (report).
 */
export async function nightlyReferrals(now = Date.now()): Promise<{ evaluated: number; converted: number }> {
  const pending = await db().collection('users').where('referralProgress.status', '==', 'signed_up').select().get();
  for (const d of pending.docs) {
    await evaluateFilleul(d.id, now).catch((e) => logger.warn('referral evaluation failed', { message: (e as Error).message }));
  }
  const carry = await db().collectionGroup('referral').where('pending', '>=', REFERRAL.FILLEULS_PER_REWARD).get();
  let converted = 0;
  for (const s of carry.docs) {
    const parrainUid = s.ref.parent.parent?.id;
    if (!parrainUid) continue;
    const r = await db().runTransaction(async (tx) => {
      const conv = await convertInTx(tx, parrainUid, now, 0);
      if (conv.granted > 0) conv.writes();
      return conv;
    });
    if (r.granted > 0) {
      converted++;
      await notifyParrain(parrainUid, r);
    }
  }
  return { evaluated: pending.size, converted };
}

export const referralNightly = onSchedule({ schedule: '15 2 * * *', timeZone: 'Africa/Abidjan' }, async () => {
  const r = await nightlyReferrals();
  logger.info('referral nightly', r);
});

/** Suppression de compte : le filleul disparaît de la liste du parrain (prénom effacé), le code est libéré. */
export async function forgetReferralData(uid: string): Promise<void> {
  const user = await db().doc(`users/${uid}`).get();
  const by = user.get('referredBy') as { uid?: string } | undefined;
  if (by?.uid) {
    const child = db().doc(`users/${by.uid}/referrals/${uid}`);
    const snap = await child.get();
    if (snap.exists) {
      const status = snap.get('status') as string;
      await child.update({ firstName: '', status: status === 'validated' || status === 'rewarded' ? status : 'rejected', updatedAt: Date.now() });
    }
  }
  const code = (await stateRef(uid).get()).get('code') as string | undefined;
  if (code) await db().doc(`referralCodes/${code}`).delete().catch(() => undefined);
  // Appareils : l'uid est retiré, mais un appareil déjà filleul le reste (anti-triche).
  const devices = await db().collection('referralDevices').where('uids', 'array-contains', uid).get();
  for (const d of devices.docs) {
    await d.ref.update({ uids: FieldValue.arrayRemove(uid), ...(d.get('filleulUid') === uid ? { filleulUid: 'deleted' } : {}) });
  }
}

// ─── Administration ───────────────────────────────────────────────────

/** Active ou règle le mode ambassadeur d'un parrain (par son code). */
export const setAmbassador = onCall(async (req) => {
  requireAdmin(req);
  const data = (req.data ?? {}) as { code?: unknown; enabled?: unknown; maxRewardsPerMonth?: unknown };
  const code = normalizeCode(data.code);
  const snap = code ? await db().doc(`referralCodes/${code}`).get() : null;
  if (!snap?.exists) throw new HttpsError('not-found', 'referral/unknown-code');
  const enabled = data.enabled === true;
  const max = data.maxRewardsPerMonth;
  if (max !== undefined && max !== null && !(typeof max === 'number' && Number.isInteger(max) && max >= 0 && max <= REFERRAL.AMBASSADOR_MAX_SETTABLE)) {
    throw new HttpsError('invalid-argument', 'referral/invalid-cap');
  }
  const ambassador = { enabled, maxRewardsPerMonth: typeof max === 'number' ? max : REFERRAL.AMBASSADOR_MAX_REWARDS_PER_MONTH };
  await stateRef(snap.get('uid') as string).set({ ambassador, updatedAt: Date.now() }, { merge: true });
  return { ambassador };
});

/** Statistiques agrégées du parrainage (aucun montant ; prénoms et codes des 20 meilleurs parrains). */
export const adminReferralStats = onCall(async (req) => {
  requireAdmin(req);
  const referrals = db().collectionGroup('referrals');
  const [codes, signups, validated, rewarded, expired, shares, top, suspects] = await Promise.all([
    db().collection('referralCodes').count().get(),
    referrals.count().get(),
    referrals.where('status', '==', 'validated').count().get(),
    referrals.where('status', '==', 'rewarded').count().get(),
    referrals.where('status', '==', 'expired').count().get(),
    db().collection('analyticsEvents').where('event', '==', 'referral_shared').count().get(),
    db().collectionGroup('referral').orderBy('validated', 'desc').limit(20).get(),
    db().collectionGroup('referral').where('refusalsTotal', '>=', 3).orderBy('refusalsTotal', 'desc').limit(20).get(),
  ]);
  const totalValidated = validated.data().count + rewarded.data().count;
  const row = (d: QueryDocumentSnapshot) => {
    const s = d.data() as StateDoc;
    return {
      code: s.code ?? '',
      firstName: s.firstName ?? '',
      signups: s.signups ?? 0,
      validated: s.validated ?? 0,
      monthsEarned: s.monthsEarned ?? 0,
      ambassador: !!s.ambassador?.enabled,
      maxRewardsPerMonth: monthlyCap(s.ambassador),
      refusals: s.refusals ?? {},
    };
  };
  return {
    codes: codes.data().count,
    sharesWithConsent: shares.data().count,
    signups: signups.data().count,
    validated: totalValidated,
    expired: expired.data().count,
    validationRate: signups.data().count ? totalValidated / signups.data().count : 0,
    top: top.docs.filter((d) => (d.get('validated') ?? 0) > 0 || (d.get('signups') ?? 0) > 0).map(row),
    suspects: suspects.docs.map(row),
    generatedAt: Date.now(),
  };
});

// ─── Page de redirection des liens ────────────────────────────────────

/** `https://{domaine}/i/{code}` (Firebase Hosting → cette fonction). */
export const link = onRequest({ memory: '256MiB', timeoutSeconds: 10 }, async (req, res) => {
  const origin = `https://${req.get('x-forwarded-host') ?? req.hostname}`;
  const route = routeLink({ path: req.path, get: (k) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : null), userAgent: req.get('user-agent'), origin });
  const lang = pageLanguage(req.get('accept-language'));
  res.set('cache-control', 'private, no-store');
  if (route.kind === 'redirect') {
    res.redirect(302, route.url);
    return;
  }
  if (route.kind === 'not_found') {
    res.status(404).type('html').send(renderPage(route, lang));
    return;
  }
  const qr = route.page === 'desktop' ? await QRCode.toString(route.shareUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : '';
  res.status(200).type('html').send(renderPage(route, lang, qr));
});

