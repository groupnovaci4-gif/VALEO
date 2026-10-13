/**
 * Parrainage — accès serveur et code en attente.
 *
 * Le client ne fait que DEMANDER : créer mon code (`myReferral`), appliquer un
 * code (`applyReferral`). Les statuts, compteurs et récompenses sont écrits par
 * les Cloud Functions et seulement LUS ici (`users/{uid}/referral/state`,
 * `users/{uid}/referrals`). Aucune donnée financière.
 *
 * Code en attente (`pendingReferral`, propre à l'appareil) : posé par le
 * referrer Google Play au premier lancement, par un lien `/i/{code}` ou par la
 * saisie à l'inscription ; appliqué dès qu'une session en ligne existe.
 */
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import * as Application from 'expo-application';
import { firebase } from './firebase';
import { readJSON, writeJSON } from './storage';
import { deviceId } from './deviceId';
import { parseInstallReferrer, refusalCode, type PendingReferral } from '@/core/referral';
import type { ReferralSource, ReferralStatus } from '@/core/types';

export type { PendingReferral };

const PENDING_KEY = 'dinerox:v1:device:pendingReferral';
const REFERRER_READ_KEY = 'dinerox:v1:device:installReferrerRead';

export interface ReferralNotice {
  kind: 'validated' | 'month' | 'month_banked';
  count: number;
  at: number;
}

export interface ReferralState {
  code?: string;
  validated?: number;
  converted?: number;
  pending?: number;
  monthsEarned?: number;
  signups?: number;
  notices?: ReferralNotice[];
}

export interface ReferralChild {
  id: string;
  status: ReferralStatus;
  firstName: string;
  signedUpAt: number;
  validatedAt: number | null;
  progress: { day: number; activeDays: number; expenses: number; incomes: number; goals: number };
}

const call = <I, O>(name: string) => (data: I) => httpsCallable<I, O>(firebase().functions, name)(data).then((r) => r.data);

/** Mon code (créé une seule fois par le serveur). */
export async function fetchMyCode(): Promise<string> {
  const r = await call<{ deviceId: string | null }, { code: string }>('myReferral')({ deviceId: await deviceId() });
  return r.code;
}

/** Applique un code ; renvoie le prénom du parrain. Erreur : `message` = code de refus du serveur. */
export async function applyReferralCode(code: string, source: ReferralSource): Promise<{ parrainFirstName: string }> {
  return call<{ code: string; source: ReferralSource; deviceId: string | null }, { parrainFirstName: string }>('applyReferral')({ code, source, deviceId: await deviceId() });
}

/** Code de refus d'une erreur de Cloud Function (`referral/self`…), null si réseau ou autre. */
export function refusalOf(e: unknown): string | null {
  const err = e as { code?: string; message?: string };
  return err?.code === 'functions/failed-precondition' ? refusalCode(err.message) : null;
}

export function listenReferralState(uid: string, cb: (s: ReferralState | null) => void): () => void {
  return onSnapshot(
    doc(firebase().db, 'users', uid, 'referral', 'state'),
    (snap) => cb(snap.exists() ? (snap.data() as ReferralState) : null),
    () => cb(null),
  );
}

export function listenReferrals(uid: string, cb: (rows: ReferralChild[]) => void): () => void {
  return onSnapshot(
    query(collection(firebase().db, 'users', uid, 'referrals'), orderBy('signedUpAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReferralChild, 'id'>) }))),
    () => cb([]),
  );
}

export async function readPending(): Promise<PendingReferral | null> {
  return readJSON<PendingReferral>(PENDING_KEY);
}

export async function writePending(p: PendingReferral | null): Promise<void> {
  await writeJSON(PENDING_KEY, p);
}

/**
 * Premier lancement sur Android : lit UNE fois le referrer Google Play. Un code
 * déjà en attente (lien, saisie) n'est jamais remplacé.
 */
export async function readInstallReferrerOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (await readJSON<boolean>(REFERRER_READ_KEY)) return;
  try {
    const raw = await Application.getInstallReferrerAsync();
    const p = parseInstallReferrer(raw);
    if (p.code && !(await readPending())) await writePending({ ...p, code: p.code, source: 'install_referrer', at: Date.now() });
    await writeJSON(REFERRER_READ_KEY, true);
  } catch {
    // Service Play indisponible (pas installé depuis Play, réseau) : nouvel essai au prochain lancement.
  }
}
