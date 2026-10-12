/**
 * Back-office — double vérification par code à 6 chiffres (TOTP, RFC 6238),
 * codes de secours et chiffrement du secret. Logique PURE (node:crypto seul).
 *
 * - Secret de 20 octets, chiffré AES-256-GCM avec la clé `BO_MFA_KEY`
 *   (Secret Manager) : jamais en clair dans Firestore, jamais renvoyé après
 *   l'enrôlement.
 * - Fenêtre ±1 pas de 30 s (décalage d'horloge du téléphone), et un même pas
 *   n'est jamais accepté deux fois (rejeu).
 * - Codes de secours : 8 codes d'usage unique, stockés HACHÉS (HMAC-SHA256).
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_S = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('base32/invalid');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Code HOTP (RFC 4226) pour un compteur donné. */
export function hotp(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_S);

export function totp(secretB32: string, nowMs: number): string {
  return hotp(secretB32, totpStep(nowMs));
}

/**
 * Vérifie un code. `lastStep` = dernier pas déjà accepté (anti-rejeu).
 * Renvoie le pas accepté, ou null.
 */
export function verifyTotp(secretB32: string, code: unknown, nowMs: number, lastStep: number | null | undefined): number | null {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null;
  const c = Buffer.from(code.trim());
  const now = totpStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const expected = Buffer.from(hotp(secretB32, step));
    if (timingSafeEqual(expected, c)) return step;
  }
  return null;
}

// ─── Codes de secours ─────────────────────────────────────────────────

/** Alphabet sans caractères ambigus (0/O, 1/I/L). */
const RC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_COUNT = 8;

export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_COUNT }, () => {
    const b = randomBytes(8);
    const chars = [...b].map((x) => RC[x % RC.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  });
}

export function normalizeRecovery(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{8}$/.test(c) ? c : null;
}

/** Empreinte d'un code de secours (clé = BO_MFA_KEY : inutilisable sans elle). */
export function hashRecovery(code: string, key: Buffer): string {
  return createHmac('sha256', key).update(`recovery:${code}`).digest('hex');
}

// ─── Chiffrement du secret ────────────────────────────────────────────

/** Clé AES-256 depuis la valeur du secret (base64, 32 octets). Refus si absente : jamais de repli. */
export function parseKey(raw: string | undefined): Buffer {
  const key = Buffer.from(raw ?? '', 'base64');
  if (key.length !== 32) throw new Error('bo/mfa-key-missing');
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(blob: string, key: Buffer): string {
  const [v, iv, tag, enc] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('bo/mfa-secret-invalid');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}
