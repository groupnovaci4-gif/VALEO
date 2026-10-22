/**
 * Initialisation Firebase (SDK JS modulaire — compatible Expo Go).
 *
 *  - Auth : session persistante via AsyncStorage.
 *  - Firestore : cache mémoire ; la persistance hors-ligne est assurée par
 *    notre propre moteur (services/sync), indépendant du SDK, qui garde les
 *    données et les écritures en attente sur le téléphone.
 *  - Functions : opérations sensibles côté serveur (invitations, suppression
 *    de compte, IA, abonnements).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { env, isFirebaseConfigured } from '@/config/env';

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}

let services: FirebaseServices | null = null;

/** Jeton App Check de TEST (émulateurs) : non signé, l'émulateur ne lit que l'identifiant d'application. */
function emulatorAppCheckToken(): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ app_id: env.firebase.appId, sub: env.firebase.appId, iat: now, exp: now + 3600 })}.emulateur`;
}

export function firebase(): FirebaseServices {
  if (!isFirebaseConfigured) throw new Error('firebase/not-configured');
  if (services) return services;
  const existing = getApps().length > 0;
  const app = existing ? getApp() : initializeApp(env.firebase);
  const auth = existing
    ? getAuth(app)
    : Platform.OS === 'web'
      ? getAuth(app)
      : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    // Réseaux mobiles et proxys d'opérateurs : bascule automatique en long-polling.
    experimentalAutoDetectLongPolling: true,
    // Les champs facultatifs absents (undefined) sont ignorés au lieu de faire échouer l'écriture.
    ignoreUndefinedProperties: true,
  });
  const functions = getFunctions(app, env.functionsRegion);
  const storage = getStorage(app);
  if (__DEV__ && env.emulatorHost) {
    // App Check (connexion par téléphone, `enforceAppCheck`) : sur les ÉMULATEURS seulement, un jeton
    // de TEST (l'émulateur ne vérifie pas la signature). En production, aucun jeton n'est inventé :
    // un vrai fournisseur (Play Integrity, nouvelle APK) sera branché avant toute activation.
    if (!existing) initializeAppCheck(app, { provider: new CustomProvider({ getToken: async () => ({ token: emulatorAppCheckToken(), expireTimeMillis: Date.now() + 3_600_000 }) }), isTokenAutoRefreshEnabled: false });
    connectAuthEmulator(auth, `http://${env.emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, env.emulatorHost, 8080);
    connectFunctionsEmulator(functions, env.emulatorHost, 5001);
    connectStorageEmulator(storage, env.emulatorHost, 9199);
  }
  services = { app, auth, db, functions, storage };
  return services;
}
