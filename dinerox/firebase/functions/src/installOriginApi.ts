/**
 * Croissance, étape 5 — origine des inscriptions (Cloud Functions).
 *
 *  - `recordSignupOrigin` : à l'inscription, UNE fois par compte (marqueur
 *    oui/non `users/{uid}.originCounted`, jamais la source), incrémente les
 *    compteurs anonymes `originStats/{jour}`. Compte de plus de 7 jours : rien.
 *  - `adminOriginStats` : droit `admin` ; renvoie des chiffres déjà regroupés
 *    (groupes de moins de 5 réunis, sans leur nom).
 * Aucune donnée personnelle ni financière, aucun identifiant d'appareil.
 */
import './options';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { aggregateOrigins, cleanOrigin, originDay, originIncrements, ORIGIN_WINDOW_DAYS, type DayCounters } from './installOrigin';

const DAY_MS = 24 * 3600 * 1000;
const db = (): Firestore => getFirestore();

function requireUid(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'auth/required');
  return req.auth.uid;
}

/** `increment(1)` pour chaque compteur, cartes comprises (fusion profonde). */
function asIncrements(o: ReturnType<typeof originIncrements>): Record<string, unknown> {
  const inc = (m: Record<string, 1> | undefined) => (m ? Object.fromEntries(Object.keys(m).map((k) => [k, FieldValue.increment(1)])) : undefined);
  const out: Record<string, unknown> = { total: FieldValue.increment(1) };
  if (o.invited) out.invited = FieldValue.increment(1);
  if (o.unknown) out.unknown = FieldValue.increment(1);
  if (o.src) out.src = inc(o.src);
  if (o.cmp) out.cmp = inc(o.cmp);
  if (o.cnt) out.cnt = inc(o.cnt);
  return out;
}

export type RecordResult = { counted: true } | { counted: false; reason: 'already' | 'too-old' };

/** Cœur testable : compte une inscription une seule fois. `createdAt` = date d'inscription (Authentication). */
export async function recordSignupOriginCore(uid: string, raw: unknown, createdAt: number, now: number): Promise<RecordResult> {
  if (!Number.isFinite(createdAt) || now - createdAt > ORIGIN_WINDOW_DAYS * DAY_MS) return { counted: false, reason: 'too-old' };
  const origin = cleanOrigin(raw as Record<string, unknown> | null);
  const userRef = db().doc(`users/${uid}`);
  const dayRef = db().doc(`originStats/${originDay(now)}`);
  return db().runTransaction(async (tx) => {
    const [user, day] = await Promise.all([tx.get(userRef), tx.get(dayRef)]);
    // Profil pas encore créé : l'application réessaiera (rien n'est compté).
    if (!user.exists) throw new HttpsError('failed-precondition', 'origin/no-profile');
    if (user.get('originCounted') === true) return { counted: false, reason: 'already' } as const;
    tx.update(userRef, { originCounted: true });
    tx.set(dayRef, asIncrements(originIncrements(origin, (day.data() ?? {}) as DayCounters)), { merge: true });
    return { counted: true } as const;
  });
}

export const recordSignupOrigin = onCall(async (req): Promise<RecordResult> => {
  const uid = requireUid(req);
  const created = Date.parse((await getAuth().getUser(uid)).metadata.creationTime);
  return recordSignupOriginCore(uid, req.data, created, Date.now());
});

export const adminOriginStats = onCall(async (req) => {
  requireUid(req);
  if (req.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'admin/required');
  const snap = await db().collection('originStats').get();
  return aggregateOrigins(
    snap.docs.map((d) => ({ id: d.id, data: d.data() as DayCounters })),
    originDay(Date.now()),
  );
});
