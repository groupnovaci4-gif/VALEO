/**
 * « À lire » (refonte finale E4) : messages lus, mémorisés LOCALEMENT par identifiant et par
 * compte (`storageKey(uid, 'toRead')`). Rien n'est envoyé au serveur. Un seul état partagé par
 * l'accueil, l'onglet Budget et la cloche (abonnement), relu à chaque changement de compte.
 * `checkedAt` / `checkedDay` : l'heure à laquelle les rappels sont jugés (chargement, lecture,
 * retour de l'application au premier plan) — jamais lue pendant un rendu.
 */
import { AppState } from 'react-native';
import { readJSON, storageKey, writeJSON } from './storage';
import { today } from '@/core/dates';
import { pruneReadStore, type ReadStore } from '@/features/notifications/toRead';

const key = (uid: string) => storageKey(uid, 'toRead');

export interface ReadStateSnapshot {
  uid: string | null;
  store: ReadStore;
  loaded: boolean;
  checkedAt: number;
  checkedDay: string;
}

let current: ReadStateSnapshot = { uid: null, store: {}, loaded: false, checkedAt: Date.now(), checkedDay: today() };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const stamp = () => ({ checkedAt: Date.now(), checkedDay: today() });

let appStateWatched = false;
function watchAppState() {
  if (appStateWatched) return;
  appStateWatched = true;
  // Retour au premier plan : un rappel arrivé à échéance (3 jours, veille) peut s'afficher.
  AppState.addEventListener?.('change', (s) => {
    if (s !== 'active') return;
    current = { ...current, ...stamp() };
    emit();
  });
}

export function subscribeReadState(l: () => void): () => void {
  watchAppState();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function readStateSnapshot(): ReadStateSnapshot {
  return current;
}

/** Chargement en cours (audit du 23/10, R12) : UN seul par compte, partagé par tous les écrans. */
let loading: { uid: string; promise: Promise<void> } | null = null;

/**
 * Charge la mémoire du compte (une fois par compte) ; un autre compte repart d'une mémoire vide.
 * R12 : deux écrans qui la demandent en même temps partagent la même lecture, et un message lu
 * PENDANT le chargement est fusionné avec la mémoire enregistrée (il ne réapparaît jamais).
 */
export function loadReadState(uid: string | null): Promise<void> {
  if (current.uid === uid && current.loaded) return Promise.resolve();
  if (uid && loading?.uid === uid) return loading.promise;
  current = { uid, store: {}, loaded: !uid, ...stamp() };
  emit();
  if (!uid) {
    loading = null;
    return Promise.resolve();
  }
  const entry: { uid: string; promise: Promise<void> } = { uid, promise: Promise.resolve() };
  entry.promise = (async () => {
    const saved = (await readJSON<ReadStore>(key(uid)).catch(() => null)) ?? {};
    if (loading === entry) loading = null;
    if (current.uid !== uid) return;
    // Lu pendant le chargement : gardé, et enregistré avec le reste.
    const during = current.store;
    const merged = pruneReadStore({ ...saved, ...during }, Date.now());
    current = { uid, store: merged, loaded: true, ...stamp() };
    emit();
    if (Object.keys(during).length) void writeJSON(key(uid), merged).catch(() => undefined);
  })();
  loading = entry;
  return entry.promise;
}

/**
 * Remplace la mémoire du compte courant et l'enregistre (sans compte : en mémoire seulement).
 * Pendant le chargement, rien n'est écrit : la fusion du chargement s'en charge (R12).
 */
export function setReadState(uid: string | null, next: ReadStore): void {
  if (current.uid !== uid) return;
  const stillLoading = !!uid && loading?.uid === uid;
  current = { uid, store: next, loaded: !stillLoading, ...stamp() };
  emit();
  if (uid && !stillLoading) void writeJSON(key(uid), next).catch(() => undefined);
}

/** Moment présent d'une lecture (×, fin de « Écouter », « Tout marquer comme lu »), hors rendu. */
export function readNow(): { now: number; day: string } {
  return { now: Date.now(), day: today() };
}
