import type { ConfigContext, ExpoConfig } from 'expo/config';
import { execSync } from 'node:child_process';
import { brand } from './src/config/brand.ts';

/** Identifiant de version affiché dans l'app (commit), pour savoir quelle version est installée. */
function buildId(): string {
  const fromEas = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (fromEas) return fromEas.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

/**
 * Configuration Expo dynamique : le nom, le schéma et l'identifiant viennent
 * de `src/config/brand.ts`, l'environnement de `APP_ENV`.
 * development | staging | production — chacun pointe vers son projet Firebase
 * via les variables `EXPO_PUBLIC_FIREBASE_*` (voir `.env.example`).
 */
const APP_ENV = (process.env.APP_ENV ?? 'development') as 'development' | 'staging' | 'production';
const suffix = APP_ENV === 'production' ? '' : `.${APP_ENV}`;
const displayName = APP_ENV === 'production' ? brand.name : `${brand.name} (${APP_ENV})`;

const build = (base: Partial<ExpoConfig>): ExpoConfig => ({
  ...base,
  name: displayName,
  slug: brand.slug,
  scheme: brand.scheme,
  version: '1.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
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
      backgroundColor: brand.colors.night,
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
    ['expo-notifications', { color: brand.colors.green }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    ...base.extra,
    appEnv: APP_ENV,
    buildId: buildId(),
    builtAt: new Date().toISOString().slice(0, 10),
    // Écrit dans app.json par `eas init`, ou fourni par EAS_PROJECT_ID.
    eas: { projectId: process.env.EAS_PROJECT_ID ?? (base.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId },
  },
});

// `config` contient app.json (où `eas init` enregistre l'identifiant du projet EAS).
export default ({ config }: ConfigContext): ExpoConfig => build(config);
