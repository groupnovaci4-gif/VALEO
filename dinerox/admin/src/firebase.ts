/**
 * Firebase côté portail : Auth et Functions SEULEMENT. Le portail ne lit ni n'écrit
 * jamais Firestore (le module n'est même pas importé : test dans tests/).
 * Session limitée à l'onglet (fermer l'onglet = se déconnecter).
 */
import { initializeApp } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

export const USE_EMULATORS = import.meta.env.MODE === 'emulators';
const EMU_HOST = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1';

const config = USE_EMULATORS
  ? { apiKey: 'fake-api-key', projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-dinerox', authDomain: 'demo-dinerox.firebaseapp.com', appId: '1:1:web:1' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const app = initializeApp(config);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'europe-west1');
void setPersistence(auth, browserSessionPersistence);
auth.languageCode = 'fr';

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, EMU_HOST, 5001);
}
