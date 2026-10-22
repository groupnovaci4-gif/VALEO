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

/** Charge la mémoire du compte (une fois par compte) ; un autre compte repart d'une mémoire vide. */
export async function loadReadState(uid: string | null): Promise<void> {
  if (current.uid === uid && current.loaded) return;
  current = { uid, store: {}, loaded: !uid, ...stamp() };
  emit();
  if (!uid) return;
  const saved = (await readJSON<ReadStore>(key(uid)).catch(() => null)) ?? {};
  if (current.uid !== uid) return;
  current = { uid, store: pruneReadStore(saved, Date.now()), loaded: true, ...stamp() };
  emit();
}

/** Remplace la mémoire du compte courant et l'enregistre (sans compte : en mémoire seulement). */
export function setReadState(uid: string | null, next: ReadStore): void {
  if (current.uid !== uid) return;
  current = { uid, store: next, loaded: true, ...stamp() };
  emit();
  if (uid) void writeJSON(key(uid), next).catch(() => undefined);
}

/** Moment présent d'une lecture (×, fin de « Écouter », « Tout marquer comme lu »), hors rendu. */
export function readNow(): { now: number; day: string } {
  return { now: Date.now(), day: today() };
}
