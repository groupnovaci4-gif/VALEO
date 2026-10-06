/**
 * Authentification (Firebase Auth) : inscription, connexion, Google,
 * mot de passe oublié/modifié, vérification e-mail, suppression du compte.
 * Les erreurs Firebase sont traduites en messages humains (authErrorKey).
 */
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { forgetDeviceNotifications } from './notifications';
import { firebase } from './firebase';
import type { TKey } from '@/i18n';
import { hasKey } from '@/i18n';

export async function signUp(email: string, password: string, firstName: string, lastName = ''): Promise<User> {
  const { auth } = firebase();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: `${firstName.trim()} ${lastName.trim()}`.trim() });
  // Non bloquant : l'utilisateur peut continuer et confirmer plus tard.
  void sendEmailVerification(cred.user).catch(() => undefined);
  return cred.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const { auth } = firebase();
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

/** Connexion Google : le jeton est obtenu par expo-auth-session (écran de connexion). */
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const { auth } = firebase();
  const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  return cred.user;
}

export async function signOut(): Promise<void> {
  const { auth } = firebase();
  // Avant la déconnexion (droits encore valides) : plus aucune notification de ce compte ici.
  await forgetDeviceNotifications(auth.currentUser?.uid ?? null, true).catch(() => undefined);
  await fbSignOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(firebase().auth, email.trim());
}

export async function resendVerification(): Promise<void> {
  const user = firebase().auth.currentUser;
  if (user) await sendEmailVerification(user);
}

export async function changePassword(current: string, next: string): Promise<void> {
  const user = firebase().auth.currentUser;
  if (!user?.email) throw { code: 'auth/requires-recent-login' };
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
}

/**
 * Suppression du compte : faite côté serveur (Cloud Function) pour effacer
 * TOUTES les données (espace personnel, appartenances, invitations) puis le
 * compte d'authentification, même si le téléphone perd la connexion.
 */
export async function deleteAccount(): Promise<void> {
  const fn = httpsCallable(firebase().functions, 'deleteAccount');
  await fn({});
  await fbSignOut(firebase().auth).catch(() => undefined);
}

export function isPasswordStrong(p: string): boolean {
  return p.length >= 8;
}

/** Code d'erreur Firebase → clé de message humain. */
export function authErrorKey(e: unknown): TKey {
  const code = String((e as { code?: string })?.code ?? '').replace(/^auth\//, '');
  const map: Record<string, string> = {
    'user-not-found': 'invalid-credential',
    'wrong-password': 'invalid-credential',
    'invalid-login-credentials': 'invalid-credential',
    'network-request-failed': 'network',
    'missing-password': 'invalid-credential',
  };
  const key = `auth.err.${map[code] ?? code}`;
  return hasKey(key) ? key : 'error.generic';
}
