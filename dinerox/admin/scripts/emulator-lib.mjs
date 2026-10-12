/**
 * Outils communs aux scripts LOCAUX du portail (émulateurs seulement, projet « demo-… » :
 * aucun accès possible à un vrai projet Firebase).
 */
import { createRequire } from 'node:module';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
export const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-dinerox';
if (!PROJECT.startsWith('demo-')) throw new Error('Scripts réservés aux émulateurs (projet demo-…).');

const req = createRequire(new URL('../../firebase/functions/package.json', import.meta.url));
const { initializeApp, getApps } = req('firebase-admin/app');
const { getAuth } = req('firebase-admin/auth');
const { getFirestore } = req('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
export const auth = getAuth();
export const db = getFirestore();

/** Clé de TEST des émulateurs (firebase/functions/.secret.local) — jamais la vraie. */
export const TEST_KEY = Buffer.alloc(32, 7);

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32decode(s) {
  let bits = 0, value = 0; const out = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totp(secret, now = Date.now()) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac('sha1', b32decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1e6).padStart(6, '0');
}
export function encryptSecret(plain, key = TEST_KEY) {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

/** Collaborateur avec mot de passe ; `secret` fourni = double vérification déjà activée. */
export async function upsertStaff({ email, displayName, roleId, password, secret = null }) {
  let u = await auth.getUserByEmail(email).catch(() => null);
  if (!u) u = await auth.createUser({ email, password, displayName });
  else await auth.updateUser(u.uid, { password, displayName });
  await db.doc(`boStaff/${u.uid}`).set({ email, displayName, roleId, status: 'active', mfa: { enrolled: !!secret, secretEnc: secret ? encryptSecret(secret) : null, pendingSecretEnc: null, recoveryHashes: [], lastStep: null }, createdAt: Date.now(), createdBy: 'seed', lastLoginAt: null });
  return u.uid;
}
