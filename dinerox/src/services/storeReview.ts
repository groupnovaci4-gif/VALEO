/**
 * Étape 4 — demande d'avis sur le store : état de la session, mémoire locale
 * par compte, fenêtre native et page du store. Les DÉCISIONS sont dans
 * `core/storeReview.ts` (pur, testé) ; ce module ne fait qu'exécuter.
 *
 * Jamais de redirection surprise : `requestReview()` d'expo-store-review ouvre
 * la page du store quand la fenêtre native manque (si `playStoreUrl` /
 * `appStoreUrl` sont déclarés). On ne l'appelle donc QUE si la fenêtre native
 * est disponible, et ces deux champs ne sont pas déclarés dans `app.config.ts`.
 */
import { Keyboard, Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { doc, getDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, storageKey, writeJSON } from './storage';
import { isMicOpen } from './voice/micGate';
import { isVoiceBusy } from './voice';
import { markSeen, parseReviewState, parseStoreConfig, type ReviewMoment, type ReviewState, type StoreConfig } from '@/core/storeReview';

// ─── Session (mémoire vive : rien n'est conservé d'un lancement à l'autre) ───

let moment: ReviewMoment | null = null;
let actionFailed = false;
const overlays = new Set<string>();
/** Comptes pour lesquels cette session est la toute première sur ce téléphone. */
const firstSessions = new Set<string>();
const seen = new Set<string>();

/** Un moment positif vient d'avoir lieu (« Objectif atteint » fermé, cagnotte reçue). */
export function markReviewMoment(m: ReviewMoment): void {
  moment = m;
}

export function pendingReviewMoment(): ReviewMoment | null {
  return moment;
}

export function clearReviewMoment(): void {
  moment = null;
}

/** Une action a échoué : plus aucune demande pendant cette session. */
export function noteActionFailed(): void {
  actionFailed = true;
}

export function actionFailedThisSession(): boolean {
  return actionFailed;
}

/** Feuille ou fenêtre ouverte au-dessus de l'Accueil (saisie, célébration d'un trophée). */
export function setReviewOverlay(tag: string, open: boolean): void {
  if (open) overlays.add(tag);
  else overlays.delete(tag);
}

/** Écran occupé : feuille ou fenêtre ouverte, clavier visible, micro ouvert, voix du coach en cours. */
export function screenBusy(): boolean {
  return overlays.size > 0 || Keyboard.isVisible() || isMicOpen() || isVoiceBusy();
}

// ─── Mémoire locale, par compte (règle 14) ───

const stateKey = (uid: string) => storageKey(uid, 'storeReview');

export async function readReviewState(uid: string): Promise<ReviewState> {
  return parseReviewState(await readJSON<unknown>(stateKey(uid)));
}

export async function writeReviewState(uid: string, state: ReviewState): Promise<void> {
  await writeJSON(stateKey(uid), state);
}

/** À l'ouverture de l'Accueil : pose la date de première ouverture (une fois) et retient si c'est la première session. */
export async function touchReviewSession(uid: string): Promise<void> {
  if (seen.has(uid)) return;
  seen.add(uid);
  const { state, firstSession } = markSeen(await readReviewState(uid), Date.now());
  if (firstSession) {
    firstSessions.add(uid);
    await writeReviewState(uid, state);
  }
}

export function isFirstSession(uid: string): boolean {
  return firstSessions.has(uid) || !seen.has(uid);
}

// ─── Fenêtre native (demandes automatiques seulement) ───

/** Vrai seulement si la fenêtre NATIVE existe (Android avec Google Play, iPhone hors TestFlight) ; faux sur le web. */
export async function nativeReviewAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await StoreReview.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Demande la fenêtre officielle. Google / Apple décident seuls de l'afficher ; aucun retour sur l'avis. */
export async function requestNativeReview(): Promise<void> {
  await StoreReview.requestReview();
}

// ─── Ligne du menu : réglage distant + page du store ───

const CONFIG_KEY = 'dinerox:v1:config:store';

/** Dernière valeur connue (cache), puis la valeur publiée si le réseau répond (`config/app/items/store`). */
export async function loadStoreConfig(): Promise<StoreConfig> {
  const cached = parseStoreConfig(await readJSON<unknown>(CONFIG_KEY));
  if (!isFirebaseConfigured) return cached;
  try {
    const snap = await getDoc(doc(firebase().db, 'config', 'app', 'items', 'store'));
    const config = parseStoreConfig(snap.exists() ? snap.data() : null);
    await writeJSON(CONFIG_KEY, config);
    return config;
  } catch {
    return cached;
  }
}

/** Ouvre la première page du store qui s'ouvre (application Play Store, sinon page web). */
export async function openStorePage(urls: readonly string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Adresse non prise en charge sur ce téléphone (pas de Play Store) : adresse suivante.
    }
  }
  return false;
}
