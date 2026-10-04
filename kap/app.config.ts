import type { ExpoConfig } from 'expo/config';
import { brand } from './src/config/brand';

/**
 * Configuration Expo dynamique : le nom, le schéma et l'identifiant viennent
 * de `src/config/brand.ts`, l'environnement de `APP_ENV`.
 * development | staging | production — chacun pointe vers son projet Firebase
 * via les variables `EXPO_PUBLIC_FIREBASE_*` (voir `.env.example`).
 */
const APP_ENV = (process.env.APP_ENV ?? 'development') as 'development' | 'staging' | 'production';
const suffix = APP_ENV === 'production' ? '' : `.${APP_ENV}`;
const displayName = APP_ENV === 'production' ? brand.name : `${brand.name} (${APP_ENV})`;

const config: ExpoConfig = {
  name: displayName,
  slug: brand.slug,
  scheme: brand.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: brand.colors.splash,
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: brand.bundleId + suffix,
    infoPlist: {
      NSFaceIDUsageDescription: `${brand.name} utilise Face ID pour protéger l'accès à vos finances.`,
      NSPhotoLibraryUsageDescription: 'Pour joindre un justificatif à une dépense.',
    },
  },
  android: {
    package: brand.bundleId + suffix,
    adaptiveIcon: {
      backgroundColor: '#0F172A',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT'],
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    ['expo-splash-screen', { backgroundColor: brand.colors.splash, image: './assets/splash-icon.png', imageWidth: 160 }],
    ['expo-local-authentication', { faceIDPermission: `${brand.name} utilise Face ID pour protéger vos finances.` }],
    ['expo-notifications', { color: brand.colors.accent }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    appEnv: APP_ENV,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
