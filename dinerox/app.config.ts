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
  version: '1.6.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: brand.bundleId + suffix,
    infoPlist: {
      NSFaceIDUsageDescription: `${brand.name} utilise Face ID pour protéger l'accès à vos finances.`,
      NSPhotoLibraryUsageDescription: 'Pour joindre un justificatif à une dépense.',
      // Partage (étape 2) : savoir si WhatsApp (ou WhatsApp Business) est installé. Ce schéma seulement.
      LSApplicationQueriesSchemes: ['whatsapp'],
    },
  },
  android: {
    package: brand.bundleId + suffix,
    // Connexion Google (É1) : expo-auth-session revient vers `<paquet>:/oauthredirect`. Android
    // seulement (fusionné avec `scheme`) : le schéma `dinerox` des liens ne change pas.
    scheme: brand.bundleId + suffix,
    adaptiveIcon: {
      backgroundColor: brand.colors.night,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT'],
    // Audit 2026-10 (F7) : permissions ajoutées par des bibliothèques mais inutiles à l'application
    // (affichage par-dessus les autres applis ; caméra : les justificatifs viennent de la galerie).
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.CAMERA'],
    // Liens DineroX (`https://{domaine}/i/{code}`) : ouverture directe dans l'application
    // (Android App Links). La vérification exige `/.well-known/assetlinks.json` sur chaque
    // domaine, avec l'empreinte SHA-256 de la clé de signature Play : sans lui, le lien
    // s'ouvre dans le navigateur (page de redirection), jamais d'erreur.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        // Invitation (`/i/`), tontine partagée (`/t/`) et campagne (`/a`, étape 5) s'ouvrent dans l'application installée.
        data: brand.linkHosts.flatMap((host) => [
          { scheme: 'https', host, pathPrefix: '/i/' },
          { scheme: 'https', host, pathPrefix: '/t/' },
          { scheme: 'https', host, path: '/a' },
        ]),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    // Micro (RECORD_AUDIO) : ajouté par expo-speech-recognition pour la saisie vocale,
    // demandé au premier appui sur le micro, jamais au lancement.
  },
  // Textes des autorisations iOS (micro, reconnaissance vocale) en français et en anglais,
  // rangés sous `ios` dans chaque fichier : sinon Expo les copie en ressources Android et
  // le lint de la compilation release échoue.
  locales: { fr: './locales/fr.json', en: './locales/en.json' },
  web: { favicon: './assets/favicon.png', bundler: 'metro' },
  plugins: [
    'expo-router',
    // Partage (étape 2) : visibilité de WhatsApp et WhatsApp Business (Android 11+), rien d'autre.
    './plugins/withWhatsAppQueries.js',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    ['expo-splash-screen', { backgroundColor: brand.colors.splash, image: './assets/splash-icon.png', imageWidth: 160 }],
    ['expo-local-authentication', { faceIDPermission: `${brand.name} utilise Face ID pour protéger vos finances.` }],
    ['expo-notifications', { color: brand.colors.green }],
    // Sons courts du coach : lecture seule, jamais en arrière-plan (le coach ne parle
    // jamais hors premier plan). expo-audio n'enregistre rien : le micro est demandé
    // par la reconnaissance vocale ci-dessous.
    ['expo-audio', { microphonePermission: MIC_TEXT, recordAudioAndroid: false, enableBackgroundPlayback: false, enableBackgroundRecording: false }],
    // Saisie vocale : reconnaissance du téléphone (sur l'appareil quand c'est possible).
    // L'audio n'est jamais stocké ni envoyé aux serveurs DineroX.
    [
      'expo-speech-recognition',
      {
        microphonePermission: MIC_TEXT,
        speechRecognitionPermission: SPEECH_TEXT,
        androidSpeechServicePackages: ['com.google.android.googlequicksearchbox', 'com.google.android.as'],
      },
    ],
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
/** Textes d'autorisation par défaut (français ; traductions iOS dans ./locales). */
const MIC_TEXT = "Le micro sert uniquement à dicter vos dépenses et revenus. L'audio n'est ni enregistré ni envoyé à nos serveurs.";
const SPEECH_TEXT = "La reconnaissance vocale transforme votre phrase en texte pour préparer l'opération, que vous confirmez avant tout enregistrement.";

export default ({ config }: ConfigContext): ExpoConfig => build(config);
