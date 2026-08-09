// VALEO — code secret local (PIN 4 chiffres)
// Vérificateur PBKDF2-HMAC-SHA-256 avec sel aléatoire. Le PIN n'est jamais stocké en clair.
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import * as Crypto from "expo-crypto";

export type PinRecord = {
  scheme: "pbkdf2-sha256";
  iterations: number;
  saltHex: string;
  verifierHex: string;
  version: 1;
};

// Compromis perf/sécurité pour téléphones d'entrée de gamme.
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);
export const normalizePhone = (phone?: string): string => (phone || "").replace(/\D/g, "");
export const normalizeText = (value?: string): string => (value || "").trim().normalize("NFKC").toLocaleLowerCase();

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error("Le code doit contenir exactement 4 chiffres");
  const salt = await Crypto.getRandomBytesAsync(16);
  const verifier = pbkdf2(sha256, utf8ToBytes(pin), salt, { c: ITERATIONS, dkLen: KEY_LENGTH });
  return { scheme: "pbkdf2-sha256", iterations: ITERATIONS, saltHex: bytesToHex(salt), verifierHex: bytesToHex(verifier), version: 1 };
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function verifyPin(pin: string, record?: PinRecord | null): boolean {
  if (!record || !record.saltHex || !record.verifierHex) return false;
  try {
    if (!isValidPin(pin)) return false;
    const candidate = pbkdf2(sha256, utf8ToBytes(pin), hexToBytes(record.saltHex), { c: record.iterations, dkLen: KEY_LENGTH });
    return constantTimeEqual(candidate, hexToBytes(record.verifierHex));
  } catch {
    return false;
  }
}
