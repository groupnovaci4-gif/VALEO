/**
 * Réglage des opérateurs Mobile Money (logo ou pastille) : celui embarqué
 * (`src/config/operators.json`), ou celui publié par l'administrateur
 * (`config/operators/items/v1`, lecture pour tout utilisateur connecté, écriture
 * administrateur — règles Firestore existantes `config/{doc}/items/{itemId}`). Permet de
 * retirer le logo d'un opérateur sans nouvelle version de l'application. Mise en cache locale.
 */
import { useSyncExternalStore } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';
import bundled from '@/config/operators.json';
import { withOperatorOverrides, type OperatorData } from '@/components/ui/contentIconMap';

const KEY = 'dinerox:v1:config:operators';
let current: OperatorData = bundled;
const listeners = new Set<() => void>();

function set(remote: unknown) {
  current = withOperatorOverrides(bundled, remote);
  listeners.forEach((l) => l());
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

/** Charge le cache puis, en ligne, le réglage publié. Ne lève jamais d'erreur. */
export async function loadOperatorsConfig(online: boolean): Promise<void> {
  try {
    const cached = await readJSON<unknown>(KEY);
    if (cached) set(cached);
    if (!isFirebaseConfigured || !online) return;
    const snap = await getDoc(doc(firebase().db, 'config', 'operators', 'items', 'v1'));
    if (snap.exists()) {
      const data = snap.data();
      set(data);
      await writeJSON(KEY, { affichage: (data as { affichage?: unknown }).affichage ?? null });
    }
  } catch {
    /* hors ligne, refus, document mal formé : le réglage en place reste */
  }
}
