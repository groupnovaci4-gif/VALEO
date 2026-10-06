/**
 * Verrouillage de l'application : code PIN + biométrie (Face ID / empreinte).
 *
 * Le PIN n'est jamais stocké en clair : empreinte SHA-256 salée, conservée
 * dans SecureStore (Keychain iOS / Keystore Android). Après 5 erreurs, le
 * déverrouillage est bloqué pendant une durée croissante.
 *
 * Un code PAR UTILISATEUR (clé suffixée par l'uid) : sur un appareil partagé,
 * le code de A ne verrouille ni ne déverrouille jamais la session de B.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

// SecureStore n'accepte que [A-Za-z0-9._-] dans les clés.
const safe = (uid: string) => uid.replace(/[^A-Za-z0-9._-]/g, '_');
const pinKey = (uid: string) => `dinerox.pin.v2.${safe(uid)}`;
const attemptsKey = (uid: string) => `dinerox.pin.attempts.v2.${safe(uid)}`;
// Ancien code commun à tout l'appareil (v1) : propriétaire inconnu, jamais réutilisé.
const LEGACY_KEYS = ['dinerox.pin.v1', 'dinerox.pin.attempts.v1'];
const MAX_ATTEMPTS = 5;

interface StoredPin {
  salt: string;
  hash: string;
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function hashPin(pin: string, salt: string): Promise<string> {
  // Plusieurs tours pour ralentir une attaque hors-ligne sur une sauvegarde volée.
  let h = `${salt}:${pin}`;
  for (let i = 0; i < 2000; i++) h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, h + salt);
  return h;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function hasPin(uid: string): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(pinKey(uid)));
}

/** Supprime l'ancien code commun à l'appareil (il pourrait appartenir à un autre utilisateur). */
export async function dropLegacyPin(): Promise<void> {
  for (const k of LEGACY_KEYS) await SecureStore.deleteItemAsync(k).catch(() => undefined);
}

export async function setPin(uid: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('pin/invalid');
  const salt = toHex(Crypto.getRandomBytes(16));
  const stored: StoredPin = { salt, hash: await hashPin(pin, salt) };
  await SecureStore.setItemAsync(pinKey(uid), JSON.stringify(stored));
  await SecureStore.deleteItemAsync(attemptsKey(uid));
}

export async function clearPin(uid: string): Promise<void> {
  await SecureStore.deleteItemAsync(pinKey(uid));
  await SecureStore.deleteItemAsync(attemptsKey(uid));
}

interface Attempts {
  count: number;
  lockedUntil: number;
}

async function readAttempts(uid: string): Promise<Attempts> {
  const raw = await SecureStore.getItemAsync(attemptsKey(uid));
  return raw ? (JSON.parse(raw) as Attempts) : { count: 0, lockedUntil: 0 };
}

/** Secondes restantes de blocage (0 si libre). */
export async function lockoutRemaining(uid: string): Promise<number> {
  const a = await readAttempts(uid);
  return Math.max(0, Math.ceil((a.lockedUntil - Date.now()) / 1000));
}

export type PinCheck = { ok: true } | { ok: false; lockedFor: number };

export async function verifyPin(uid: string, pin: string): Promise<PinCheck> {
  const remaining = await lockoutRemaining(uid);
  if (remaining > 0) return { ok: false, lockedFor: remaining };
  const raw = await SecureStore.getItemAsync(pinKey(uid));
  if (!raw) return { ok: true };
  const stored = JSON.parse(raw) as StoredPin;
  if ((await hashPin(pin, stored.salt)) === stored.hash) {
    await SecureStore.deleteItemAsync(attemptsKey(uid));
    return { ok: true };
  }
  const a = await readAttempts(uid);
  const count = a.count + 1;
  // 30 s, puis 60 s, 120 s… à chaque série de 5 erreurs.
  const lockedUntil = count % MAX_ATTEMPTS === 0 ? Date.now() + 30_000 * 2 ** (count / MAX_ATTEMPTS - 1) : 0;
  await SecureStore.setItemAsync(attemptsKey(uid), JSON.stringify({ count, lockedUntil }));
  return { ok: false, lockedFor: lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0 };
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function authenticateBiometric(prompt: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: true, cancelLabel: 'PIN' });
    return r.success;
  } catch {
    return false;
  }
}
