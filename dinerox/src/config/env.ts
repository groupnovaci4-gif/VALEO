/**
 * Variables d'environnement publiques (préfixe EXPO_PUBLIC_, intégrées au
 * bundle). AUCUN SECRET ici : les clés Firebase web sont des identifiants
 * publics, protégés par les règles de sécurité et App Check. Les vrais
 * secrets (clé d'API IA…) vivent dans Secret Manager côté Cloud Functions.
 *
 * Les accès sont STATIQUES (process.env.EXPO_PUBLIC_X) : Expo ne remplace
 * pas les accès dynamiques.
 */
import Constants from 'expo-constants';

export type AppEnv = 'development' | 'staging' | 'production';

export const env = {
  appEnv: ((Constants.expoConfig?.extra as { appEnv?: AppEnv } | undefined)?.appEnv ?? 'development') as AppEnv,
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
  functionsRegion: process.env.EXPO_PUBLIC_FUNCTIONS_REGION ?? 'europe-west1',
  /** host:port de l'émulateur local (ex. 192.168.1.10) — développement uniquement. */
  emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '',
  google: {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  },
  /** Active le menu « données de démonstration » (jamais en production). */
  enableDemo: process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true',
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
};

export const isFirebaseConfigured = Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.appId);
export const isGoogleConfigured = Boolean(env.google.webClientId);
export const demoAllowed = env.appEnv !== 'production' && (env.enableDemo || __DEV__);
