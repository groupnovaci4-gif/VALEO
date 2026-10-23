/**
 * Connexion par téléphone — module PUR du serveur (aucun accès Firestore ici).
 * Règles reprises À L'IDENTIQUE de l'application (src/core/phone.ts ; parité testée par
 * tests/phone-server.test.ts) : c'est le serveur qui fait foi.
 * Empreintes : code reçu (HMAC lié à la demande), code secret (scrypt + sel + poivre),
 * numéro et appareil (HMAC) — jamais rien en clair.
 */
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

const MIN = 60_000;

export const PHONE_RULES = {
  codeTtlMs: 10 * MIN,
  codeMaxAttempts: 5,
  sendIntervalMs: MIN,
  sendsPerDay: 5,
  deviceSendsPerDay: 20,
  secretMaxFails: 5,
  locksMs: [15 * MIN, 60 * MIN, 24 * 60 * MIN],
  ticketTtlMs: 10 * MIN,
} as const;

/**
 * Règles propres au SERVEUR (audit du 23/10), hors parité avec l'application :
 *  - « Ajouter mon numéro » exige une connexion de moins de 5 minutes (S1) ;
 *  - plafonds du jour par canal et par préfixe, en plus du plafond global (S4) ;
 *  - une demande de code porte sa date de suppression automatique (S5, règle TTL à venir).
 */
export const PHONE_LIMITS = {
  recentLoginMs: 5 * MIN,
  smsDailyCap: 500,
  prefixDailyCap: 300,
  requestTtlMs: 24 * 60 * MIN,
} as const;

export const DEFAULT_DIAL = '225';

export const DIAL_CODES: Record<string, string> = {
  CI: '225', SN: '221', BJ: '229', TG: '228', BF: '226', ML: '223', NE: '227', GW: '245', GN: '224', GH: '233', NG: '234',
  CM: '237', GA: '241', CG: '242', TD: '235', CD: '243',
  MA: '212', DZ: '213', TN: '216', KE: '254',
  FR: '33', BE: '32', CH: '41', LU: '352', MC: '377', GB: '44', IE: '353', DE: '49', NL: '31', ES: '34', IT: '39', PT: '351',
  SE: '46', NO: '47', DK: '45', PL: '48', CZ: '420',
};

/** Liste blanche des SMS (5bis.5) : les pays proposés par l'application (src/core/countries.ts). */
export const SMS_DIAL_CODES: string[] = [...new Set(Object.values(DIAL_CODES))];

const KEEP_LEADING_ZERO = new Set(['225', '229']);
const NATIONAL_LENGTH: Record<string, number> = { '225': 10 };
const KNOWN = Object.values(DIAL_CODES).sort((a, b) => b.length - a.length);
const dialOfDigits = (digits: string): string | null => KNOWN.find((d) => digits.startsWith(d)) ?? null;

export function dialCodeOf(e164: string): string | null {
  return /^\+\d+$/.test(e164) ? dialOfDigits(e164.slice(1)) : null;
}

export function smsAllowed(e164: string): boolean {
  const d = dialCodeOf(e164);
  return !!d && SMS_DIAL_CODES.includes(d);
}

/** S4 : WhatsApp suit la MÊME liste de pays que les SMS (pays proposés par l'application). */
export const codeCountryAllowed = (e164: string): boolean => smsAllowed(e164);

/** Préfixe d'un numéro pour son plafond du jour : indicatif + 2 premiers chiffres (« 22507 »). Jamais le numéro entier. */
export function prefixOf(e164: string): string {
  const d = dialCodeOf(e164) ?? '';
  return e164.slice(1, 1 + d.length + 2);
}

/** S1 : connexion récente (`auth_time` du jeton, en secondes). */
export function recentLogin(authTimeSec: unknown, now: number): boolean {
  const t = Number(authTimeSec);
  return Number.isFinite(t) && t > 0 && now - t * 1000 <= PHONE_LIMITS.recentLoginMs;
}

/** S4 : jeton App Check à usage unique déjà utilisé (rejeu) → refus. */
export const appCheckReplayed = (app: { alreadyConsumed?: boolean } | undefined): boolean => app?.alreadyConsumed === true;

export function normalizePhone(raw: string, dial: string = DEFAULT_DIAL): string | null {
  const s = String(raw ?? '').trim();
  const clean = (x: string) => x.replace(/[\s.\-()]/g, '');
  let digits: string;
  if (/^(\+|00)/.test(s)) digits = clean(s.replace(/^(\+|00)/, ''));
  else {
    let local = clean(s);
    if (!KEEP_LEADING_ZERO.has(dial)) local = local.replace(/^0/, '');
    digits = `${dial}${local}`;
  }
  if (!/^\d+$/.test(digits) || digits.length < 8 || digits.length > 15) return null;
  const cc = dialOfDigits(digits);
  if (cc && NATIONAL_LENGTH[cc] && digits.length - cc.length !== NATIONAL_LENGTH[cc]) return null;
  if (cc && digits.length - cc.length < 6) return null;
  return `+${digits}`;
}

export function secretProblem(code: string): 'format' | 'weak' | null {
  if (!/^\d{6}$/.test(code)) return 'format';
  const d = [...code].map(Number);
  const step = (k: number) => d.every((x, i) => i === 0 || x === d[i - 1] + k);
  if (step(0) || step(1) || step(-1)) return 'weak';
  if (code === code.slice(0, 2).repeat(3) || code === code.slice(0, 3).repeat(2)) return 'weak';
  if (code[0] === code[1] && code[2] === code[3] && code[4] === code[5]) return 'weak';
  return null;
}

export interface PhoneGuard {
  day: string;
  sends: number;
  lastSendAt: number;
  fails: number;
  lockLevel: number;
  lockedUntil: number;
}

export const emptyGuard = (day: string): PhoneGuard => ({ day, sends: 0, lastSendAt: 0, fails: 0, lockLevel: 0, lockedUntil: 0 });

export type SendDecision = { ok: true } | { ok: false; reason: 'too-soon' | 'daily-limit'; retryAt: number | null };

export function sendDecision(g: PhoneGuard, now: number, day: string): SendDecision {
  const sends = g.day === day ? g.sends : 0;
  if (g.lastSendAt && now - g.lastSendAt < PHONE_RULES.sendIntervalMs) return { ok: false, reason: 'too-soon', retryAt: g.lastSendAt + PHONE_RULES.sendIntervalMs };
  if (sends >= PHONE_RULES.sendsPerDay) return { ok: false, reason: 'daily-limit', retryAt: null };
  return { ok: true };
}

export function lockDuration(level: number): number {
  if (level <= 0) return 0;
  return PHONE_RULES.locksMs[Math.min(level, PHONE_RULES.locksMs.length) - 1];
}

export function isLocked(g: Pick<PhoneGuard, 'lockedUntil'>, now: number): boolean {
  return g.lockedUntil > now;
}

export function failureAfter(g: PhoneGuard, now: number): PhoneGuard {
  const fails = g.fails + 1;
  if (fails < PHONE_RULES.secretMaxFails) return { ...g, fails };
  const lockLevel = g.lockLevel + 1;
  return { ...g, fails: 0, lockLevel, lockedUntil: now + lockDuration(lockLevel) };
}

/** Jour de référence des compteurs (UTC = heure d'Abidjan). */
export const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

// ─── Empreintes ──────────────────────────────────────────────────────

const hmac = (pepper: string, value: string) => createHmac('sha256', pepper).update(value).digest('hex');

/** Code reçu : 6 chiffres tirés par le générateur cryptographique. */
export const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');
/** Jeton aléatoire (identifiant de demande, ticket). */
export const newToken = (): string => randomBytes(24).toString('base64url');
export const newSalt = (): string => randomBytes(16).toString('hex');

/** Empreinte d'un code reçu, liée à SA demande (un même code ne vaut pas pour une autre demande). */
export const codeHash = (pepper: string, requestId: string, code: string): string => hmac(pepper, `code:${requestId}:${code}`);
/** Empreinte d'un ticket (donné après un code correct). */
export const ticketHash = (pepper: string, ticket: string): string => hmac(pepper, `ticket:${ticket}`);
/** Identifiant d'un numéro : jamais le numéro en clair dans un identifiant de document. */
export const phoneKey = (pepper: string, e164: string): string => hmac(pepper, `phone:${e164}`);
/** Identifiant d'un appareil (jamais l'identifiant en clair). */
export const deviceKey = (pepper: string, deviceId: string): string => hmac(pepper, `device:${deviceId}`);

/** Comparaison à temps constant de deux empreintes hexadécimales. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Coût scrypt : volontairement élevé (serveur), identique pour un numéro inconnu (même temps de calcul). */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

export interface SecretHash {
  salt: string;
  hash: string;
}

function scryptHex(secret: string, salt: string, pepper: string): Promise<string> {
  return new Promise((resolve, reject) =>
    scrypt(`${secret}:${pepper}`, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))),
  );
}

export async function hashSecret(secret: string, salt: string, pepper: string): Promise<SecretHash> {
  return { salt, hash: await scryptHex(secret, salt, pepper) };
}

export async function checkSecret(secret: string, stored: SecretHash, pepper: string): Promise<boolean> {
  return sameHash(await scryptHex(secret, stored.salt, pepper), stored.hash);
}

/** Sel fixe d'un numéro inconnu : le calcul est fait quand même (même durée qu'un mauvais code). */
export const DUMMY_SECRET: SecretHash = { salt: '00000000000000000000000000000000', hash: '0'.repeat(64) };
