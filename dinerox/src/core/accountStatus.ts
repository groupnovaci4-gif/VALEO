/**
 * Compte suspendu par le back-office (D5) — logique PURE (testée).
 *
 * Le back-office désactive le compte Firebase Auth et révoque ses jetons. Un
 * téléphone déjà connecté le découvre en renouvelant son jeton : Firebase répond
 * alors `auth/user-disabled`. Toute autre erreur (hors ligne, délai…) ne dit RIEN
 * sur le compte : l'app ne fait rien et réessaiera plus tard.
 */
export function isSuspendedAuthError(e: unknown): boolean {
  return String((e as { code?: unknown } | null)?.code ?? '') === 'auth/user-disabled';
}

/** Moments où l'app vérifie le compte : démarrage, retour au premier plan, retour du réseau. */
export type AccountCheckTrigger = 'start' | 'foreground' | 'online';
