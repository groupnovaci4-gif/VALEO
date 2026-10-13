/**
 * Identifiant d'appareil pour l'anti-triche du parrainage UNIQUEMENT
 * (« un appareil ne peut être filleul qu'une fois », « pas d'auto-parrainage »).
 *
 *  - Android : `getAndroidId()` (propre à l'application et à la clé de signature) ;
 *  - iPhone  : `identifierForVendor` (propre à l'éditeur) ;
 *  - web     : identifiant d'installation tiré au hasard et gardé localement.
 * Ce n'est PAS un identifiant publicitaire. Il est envoyé à la Cloud Function,
 * qui n'en garde qu'une empreinte (HMAC avec un secret serveur), jamais en clair.
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { readJSON, writeJSON } from './storage';

const WEB_KEY = 'dinerox:v1:device:installId';

export async function deviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') return Application.getAndroidId() || null;
    if (Platform.OS === 'ios') return (await Application.getIosIdForVendorAsync()) || null;
    const saved = await readJSON<string>(WEB_KEY);
    if (saved) return saved;
    const id = Crypto.randomUUID();
    await writeJSON(WEB_KEY, id);
    return id;
  } catch {
    // Identifiant indisponible : le serveur refusera le parrainage (« appareil »), sans bloquer l'application.
    return null;
  }
}
