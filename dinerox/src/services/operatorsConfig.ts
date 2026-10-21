/**
 * Réglage des opérateurs Mobile Money (logo ou pastille) : celui embarqué
 * (`src/config/operators.json`), ou celui publié par l'administrateur
 * (`config/operators/items/v1`, lecture pour tout utilisateur connecté, écriture
 * administrateur — règles Firestore existantes `config/{doc}/items/{itemId}`). Permet de
 * retirer le logo d'un opérateur sans nouvelle version de l'application. Mise en cache locale.
 *
 * JAMAIS bloquant (fondateur, 2026-10-21) : l'application démarre avec le réglage embarqué ; la
 * version publiée s'applique ensuite en arrière-plan si elle arrive avant
 * `OPERATORS_REMOTE_TIMEOUT_MS`. Au-delà, en cas d'erreur ou hors ligne : rien ne change.
 */
import { useSyncExternalStore } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';
import bundled from '@/config/operators.json';
import { withOperatorOverrides, type OperatorData } from '@/components/ui/contentIconMap';

const KEY = 'dinerox:v1:config:operators';
/** Délai maximum du cache puis de la lecture distante ; une réponse plus tardive est ignorée. */
export const OPERATORS_REMOTE_TIMEOUT_MS = 5000;
let current: OperatorData = bundled;
const listeners = new Set<() => void>();

function set(remote: unknown) {
  current = withOperatorOverrides(bundled, remote);
  listeners.forEach((l) => l());
}

/** Résout `null` si la promesse ne répond pas à temps (sans jamais la laisser lever d'erreur). */
function within<T>(p: Promise<T>, deadline: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export function currentOperators(): OperatorData {
  return current;
}

export function useOperators(): OperatorData {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Charge le cache puis, en ligne, le réglage publié. Ne lève jamais d'erreur et se termine au plus tard au délai maximum. */
export async function loadOperatorsConfig(online: boolean): Promise<void> {
  const deadline = Date.now() + OPERATORS_REMOTE_TIMEOUT_MS;
  try {
    const cached = await within(readJSON<unknown>(KEY), deadline);
    if (cached) set(cached);
    if (!isFirebaseConfigured || !online) return;
    const snap = await within(getDoc(doc(firebase().db, 'config', 'operators', 'items', 'v1')), deadline);
    if (snap?.exists()) {
      const data = snap.data();
      set(data);
      void writeJSON(KEY, { affichage: (data as { affichage?: unknown }).affichage ?? null }).catch(() => undefined);
    }
  } catch {
    /* hors ligne, refus, document mal formé : le réglage en place reste */
  }
}
