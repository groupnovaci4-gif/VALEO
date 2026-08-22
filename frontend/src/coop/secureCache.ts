// Cache hors-ligne chiffré (AES) — les données de la coopérative ne sont jamais
// stockées en clair sur l'appareil. La clé de chiffrement vit dans le
// Keychain/Keystore (SecureStore), séparée des données chiffrées (AsyncStorage).
import CryptoJS from "crypto-js";
import * as Crypto from "expo-crypto";

import { storage } from "@/src/utils/storage";

const ENC_KEY = "coop:enckey";

async function getKey(): Promise<string> {
  let key = await storage.secureGet<string | null>(ENC_KEY, null);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    await storage.secureSet(ENC_KEY, key);
  }
  return key;
}

export async function saveCache(key: string, obj: any): Promise<void> {
  try {
    const k = await getKey();
    const cipher = CryptoJS.AES.encrypt(JSON.stringify(obj), k).toString();
    await storage.setItem(key, cipher);
  } catch {
    // En cas d'échec de chiffrement, ne PAS écrire en clair.
  }
}

export async function loadCache<T = any>(key: string): Promise<T | null> {
  try {
    const cipher = await storage.getItem<string | null>(key, null);
    if (!cipher || typeof cipher !== "string") return null;
    const k = await getKey();
    const txt = CryptoJS.AES.decrypt(cipher, k).toString(CryptoJS.enc.Utf8);
    return txt ? (JSON.parse(txt) as T) : null;
  } catch {
    return null;
  }
}
