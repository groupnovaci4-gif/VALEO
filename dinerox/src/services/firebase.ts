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
    connectAuthEmulator(auth, `http://${env.emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, env.emulatorHost, 8080);
    connectFunctionsEmulator(functions, env.emulatorHost, 5001);
    connectStorageEmulator(storage, env.emulatorHost, 9199);
  }
  services = { app, auth, db, functions, storage };
  return services;
}
