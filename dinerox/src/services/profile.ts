/**
 * Profil utilisateur (users/{uid}). L'abonnement y figure mais n'est
 * modifiable que par le serveur (voir firestore.rules).
 */
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import type { UserPreferences, UserProfile } from '@/core/types';
import { defaultSubscription } from '@/core/subscription';
import { DEFAULT_CURRENCY } from '@/core/money';
import { deviceLanguage } from '@/i18n';

export const defaultPreferences = (): UserPreferences => ({
  theme: 'dark',
  notifications: {
    budgetAlerts: true,
    goalProgress: true,
    incomeReceived: true,
    unusualSpending: true,
    savingsReminder: true,
    debtDue: true,
    weeklySummary: true,
    monthlySummary: true,
  },
  appLock: false,
  autoLockMinutes: 1,
  aiConsent: false,
  analyticsConsent: false,
  budgetMethod: 'envelopes',
});

export function defaultProfile(uid: string, email: string, firstName = ''): UserProfile {
  const now = Date.now();
  let timezone = 'Africa/Abidjan';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
  } catch {
    /* Hermes sans Intl complet */
  }
  return {
    uid,
    firstName,
    lastName: '',
    email,
    phone: null,
    country: 'CI',
    currency: DEFAULT_CURRENCY,
    photoURL: null,
    language: deviceLanguage(),
    timezone,
    preferences: defaultPreferences(),
    subscription: defaultSubscription(now),
    onboarding: { completed: false },
    termsAcceptedVersion: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Crée le profil s'il n'existe pas ; renvoie le profil serveur. */
export async function ensureProfile(uid: string, email: string, firstName: string, termsVersion: string | null, lastName = ''): Promise<UserProfile> {
  const { db } = firebase();
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as UserProfile;
  const profile = { ...defaultProfile(uid, email, firstName), lastName, termsAcceptedVersion: termsVersion };
  await setDoc(ref, profile);
  return profile;
}

export function listenProfile(uid: string, cb: (p: UserProfile | null) => void, onError: () => void): () => void {
  const { db } = firebase();
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb(snap.exists() ? (snap.data() as UserProfile) : null),
    () => onError(),
  );
}

/** Mise à jour partielle. Le champ `subscription` est refusé par les règles. */
export async function saveProfile(uid: string, patch: Partial<Omit<UserProfile, 'subscription' | 'uid'>>): Promise<void> {
  const { db } = firebase();
  await setDoc(doc(db, 'users', uid), { ...patch, updatedAt: Date.now() }, { merge: true });
}
