/**
 * Interrupteur publié « connexion par numéro » (audit du 23/10, C5) : `config/app/items/phoneAuth`
 * (`{ enabled: true }`), écrit par un administrateur, lisible AVANT toute connexion (règle dédiée).
 * Tant qu'il n'est pas activé — valeur par défaut —, l'écran de bienvenue reste celui d'origine
 * (« Créer mon compte » / « J'ai déjà un compte ») et « Ajouter mon numéro » n'est pas proposé :
 * une APK construite avant l'ouverture des fournisseurs n'affiche jamais de bouton qui échouerait.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';

const KEY = 'dinerox:v1:config:phoneAuth';

/** Seul `enabled: true` active (absent, faux, mal formé → désactivé). */
export const phoneAuthEnabledFrom = (raw: unknown): boolean => (raw as { enabled?: unknown } | null)?.enabled === true;

/** Valeur publiée (mise en cache), sinon la dernière connue, sinon DÉSACTIVÉ. */
export async function loadPhoneAuthEnabled(): Promise<boolean> {
  const cached = phoneAuthEnabledFrom(await readJSON<unknown>(KEY));
  if (!isFirebaseConfigured) return false;
  try {
    const snap = await getDoc(doc(firebase().db, 'config', 'app', 'items', 'phoneAuth'));
    const enabled = phoneAuthEnabledFrom(snap.exists() ? snap.data() : null);
    await writeJSON(KEY, { enabled });
    return enabled;
  } catch {
    return cached;
  }
}

/** `null` le temps de la première lecture (dernière valeur connue d'abord, puis la valeur publiée). */
export function usePhoneAuthEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void readJSON<unknown>(KEY).then((raw) => {
      if (alive && raw != null) setEnabled((v) => (v === null ? phoneAuthEnabledFrom(raw) : v));
    });
    void loadPhoneAuthEnabled().then((v) => {
      if (alive) setEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
