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

// Un PIN à 4 chiffres n'a que 10 000 combinaisons : un KDF léger reste adapté
// tout en restant fluide sur les téléphones d'entrée de gamme (calcul en pur JS).
const ITERATIONS = 15_000;
const KEY_LENGTH = 32;

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);
export const normalizePhone = (phone?: string): string => (phone || "").replace(/\D/g, "");
export const normalizeText = (value?: string): string => (value || "").trim().normalize("NFKC").toLocaleLowerCase();

const yieldToUI = () => new Promise((r) => setTimeout(r, 16));

async function randomSalt(size: number): Promise<Uint8Array> {
  try {
    return await Crypto.getRandomBytesAsync(size);
  } catch {
    // Repli si l'API native n'est pas disponible.
    const b = new Uint8Array(size);
    for (let i = 0; i < size; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error("Le code doit contenir exactement 4 chiffres");
  await yieldToUI(); // laisse l'UI afficher l'indicateur de chargement avant le calcul
  const salt = await randomSalt(16);
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

// Variante non bloquante : cède la main à l'UI avant le calcul (affiche le loader).
export async function verifyPinAsync(pin: string, record?: PinRecord | null): Promise<boolean> {
  await yieldToUI();
  return verifyPin(pin, record);
}
