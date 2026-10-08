/**
 * Catalogue de catégories en vigueur : celui embarqué dans l'application, ou
 * la version corrigée publiée par l'administrateur (`config/categories/items/v2`,
 * lecture pour tout utilisateur connecté, écriture administrateur — règles
 * Firestore). Mise en cache locale ; hors ligne ou en mode local, le cache
 * (sinon le catalogue embarqué) s'applique.
 */
import { useSyncExternalStore } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';
import { EMBEDDED_CATALOG, sanitizeCatalog, type CategoryCatalog } from '@/core/categoryCatalog';

const KEY = 'dinerox:v1:config:categories';
let current: CategoryCatalog = EMBEDDED_CATALOG;
const listeners = new Set<() => void>();

function set(c: CategoryCatalog) {
  // Jamais une version plus ancienne que celle embarquée.
  if (c.catalogVersion < EMBEDDED_CATALOG.catalogVersion) return;
  current = c;
  listeners.forEach((l) => l());
}

export function currentCatalog(): CategoryCatalog {
  return current;
}

export function useCategoryCatalog(): CategoryCatalog {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Charge le cache puis, en ligne, la version publiée. Ne lève jamais d'erreur. */
export async function loadCategoryCatalog(online: boolean): Promise<CategoryCatalog> {
  try {
    const cached = sanitizeCatalog(await readJSON<unknown>(KEY));
    if (cached) set(cached);
    if (!isFirebaseConfigured || !online) return current;
    const snap = await getDoc(doc(firebase().db, 'config', 'categories', 'items', `v${EMBEDDED_CATALOG.catalogVersion}`));
    const remote = snap.exists() ? sanitizeCatalog(snap.data()) : null;
    if (remote) {
      set(remote);
      await writeJSON(KEY, remote);
    }
  } catch {
    /* hors ligne, refus, document mal formé : le catalogue en place reste */
  }
  return current;
}
