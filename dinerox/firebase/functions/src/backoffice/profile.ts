/**
 * MIROIR de defaultProfile() / defaultPreferences() (src/services/profile.ts)
 * et de defaultSubscription() (src/core/subscription.ts) : profil d'un compte
 * créé par le back-office, identique à une inscription dans l'app (formule
 * gratuite, onboarding à faire). Vérifié par tests/backoffice-parity.test.ts.
 */
export interface NewUserInput {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  currency: string;
  language: 'fr' | 'en';
  timezone: string;
}

export function serverDefaultPreferences() {
  return {
    theme: 'light',
    notifications: {
      budgetAlerts: true,
      goalProgress: true,
      incomeReceived: true,
      unusualSpending: true,
      savingsReminder: true,
      debtDue: true,
      weeklySummary: true,
      monthlySummary: true,
      dailyEntryReminder: true,
      tontineDue: true,
      dailyReminderHour: 20,
    },
    appLock: false,
    autoLockMinutes: 1,
    aiConsent: false,
    analyticsConsent: false,
    budgetMethod: 'envelopes',
    coach: { enabled: true, voice: 'important', speakAmounts: false, soundVolume: 0.6, frequency: 'normal', criticalOnly: false, silent: false, premiumVoice: false },
    entry: { defaultMethod: 'voice', voiceLanguage: null, onDeviceOnly: false, showExamples: true, speakAmounts: true },
  };
}

export function serverDefaultSubscription(now: number) {
  return { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: now };
}

export function serverDefaultProfile(i: NewUserInput, now: number) {
  return {
    uid: i.uid,
    firstName: i.firstName,
    lastName: i.lastName,
    email: i.email,
    phone: null,
    country: i.country,
    currency: i.currency,
    photoURL: null,
    language: i.language,
    timezone: i.timezone,
    preferences: serverDefaultPreferences(),
    subscription: serverDefaultSubscription(now),
    onboarding: { completed: false },
    termsAcceptedVersion: null,
    createdAt: now,
    updatedAt: now,
  };
}
