/**
 * Étape 5 — origine de l'installation, gardée SUR L'APPAREIL jusqu'à
 * l'inscription, puis envoyée une seule fois à `recordSignupOrigin` (compteurs
 * anonymes). Jamais de code d'invitation, d'identifiant d'appareil ni de donnée
 * personnelle : seulement `src` / `cmp` / `cnt` et « lien d'invitation » oui/non.
 *
 * Plusieurs comptes sur un téléphone : seul le PREMIER compte compté hérite de
 * l'origine ; les suivants sont comptés en « Origine inconnue ».
 */
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import { readJSON, writeJSON } from './storage';
import { cleanOrigin, hasOrigin, type InstallOrigin } from '@/core/installOrigin';

const PENDING_KEY = 'dinerox:v1:device:pendingOrigin';
const USED_KEY = 'dinerox:v1:device:originUsed';

export async function readPendingOrigin(): Promise<InstallOrigin | null> {
  const raw = await readJSON<unknown>(PENDING_KEY);
  return raw ? cleanOrigin(raw as Record<string, unknown>) : null;
}

/** Retient l'origine de l'installation : la première connue gagne, jamais remplacée. */
export async function rememberOrigin(o: InstallOrigin): Promise<void> {
  if (!hasOrigin(o)) return;
  if (await readJSON<boolean>(USED_KEY)) return;
  if (await readJSON<unknown>(PENDING_KEY)) return;
  await writeJSON(PENDING_KEY, cleanOrigin(o));
}

export type OriginResult = { counted: true } | { counted: false; reason: 'already' | 'too-old' };

/**
 * Envoie l'origine du compte qui vient de s'inscrire. Compté : l'origine est
 * consommée et l'appareil marqué (les comptes suivants : « inconnue »).
 * Une erreur réseau est levée (l'appelant réessaiera).
 */
export async function sendSignupOrigin(): Promise<OriginResult> {
  const used = !!(await readJSON<boolean>(USED_KEY));
  const origin = used ? {} : ((await readPendingOrigin()) ?? {});
  const r = await httpsCallable<InstallOrigin, OriginResult>(firebase().functions, 'recordSignupOrigin')(origin);
  if (r.data.counted) {
    await writeJSON(USED_KEY, true);
    await writeJSON(PENDING_KEY, null);
  }
  return r.data;
}
