/**
 * Connexion par téléphone (docs/connexion-telephone/DECISIONS.md §5bis, PROPOSITION.md) — module
 * PUR, testé (tests/phone.test.ts). Repris À L'IDENTIQUE côté serveur
 * (firebase/functions/src/phone.ts, parité testée) : le serveur fait foi.
 *  - numéro au format international (+225 proposé, modifiable) ;
 *  - liste blanche des SMS : les pays proposés par l'application (core/countries.ts) ;
 *  - code secret : 6 chiffres, jamais une suite évidente ;
 *  - envois : 1 par minute, 5 par jour et par numéro ; blocage 15 min, 1 h, puis 24 h.
 */
import { COUNTRY_PROFILES } from './countries';

const MIN = 60_000;

export const PHONE_RULES = {
  /** Code reçu (WhatsApp / SMS) : valable 10 minutes, usage unique, 5 essais. */
  codeTtlMs: 10 * MIN,
  codeMaxAttempts: 5,
  /** Envois par numéro : 1 par minute, 5 par jour. */
  sendIntervalMs: MIN,
  sendsPerDay: 5,
  /** Envois par appareil et par jour (un téléphone ne fait pas envoyer des codes à des centaines de numéros). */
  deviceSendsPerDay: 20,
  /** Code secret : 5 erreurs → blocage 15 min, puis 1 h, puis 24 h (par numéro tenté). */
  secretMaxFails: 5,
  locksMs: [15 * MIN, 60 * MIN, 24 * 60 * MIN],
  /** Ticket donné après un code reçu correct : 10 minutes pour choisir son code secret. */
  ticketTtlMs: 10 * MIN,
} as const;

/** Indicatif proposé (modifiable). */
export const DEFAULT_DIAL = '225';

/** Indicatif de chaque pays proposé par l'application (core/countries.ts). */
export const DIAL_CODES: Record<string, string> = {
  CI: '225', SN: '221', BJ: '229', TG: '228', BF: '226', ML: '223', NE: '227', GW: '245', GN: '224', GH: '233', NG: '234',
  CM: '237', GA: '241', CG: '242', TD: '235', CD: '243',
  MA: '212', DZ: '213', TN: '216', KE: '254',
  FR: '33', BE: '32', CH: '41', LU: '352', MC: '377', GB: '44', IE: '353', DE: '49', NL: '31', ES: '34', IT: '39', PT: '351',
  SE: '46', NO: '47', DK: '45', PL: '48', CZ: '420',
};

/** Pays où le 0 initial fait partie du numéro (numérotation à 10 chiffres : Côte d'Ivoire, Bénin). */
const KEEP_LEADING_ZERO = new Set(['225', '229']);
/** Longueur du numéro national quand elle est fixe. */
const NATIONAL_LENGTH: Record<string, number> = { '225': 10 };

/** Liste blanche des SMS (5bis.5) : les indicatifs des pays proposés par l'application, et eux seuls. */
export function smsDialCodes(): string[] {
  return [...new Set(COUNTRY_PROFILES.map((p) => DIAL_CODES[p.code]).filter((d): d is string => !!d))];
}

const KNOWN = () => Object.values(DIAL_CODES).sort((a, b) => b.length - a.length);

function dialOfDigits(digits: string): string | null {
  return KNOWN().find((d) => digits.startsWith(d)) ?? null;
}

/** Indicatif d'un numéro international (« +2250708… » → « 225 »), s'il fait partie des pays proposés. */
export function dialCodeOf(e164: string): string | null {
  return /^\+\d+$/.test(e164) ? dialOfDigits(e164.slice(1)) : null;
}

/** SMS autorisé seulement vers un pays proposé par l'application. */
export function smsAllowed(e164: string): boolean {
  const d = dialCodeOf(e164);
  return !!d && smsDialCodes().includes(d);
}

/**
 * Numéro saisi → format international (« +2250708091011 »), ou null s'il est incomplet.
 * `dial` : indicatif choisi (+225 proposé). Un numéro écrit avec « + » ou « 00 » garde le sien.
 */
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

const pairs = (x: string) => x.match(/.{1,2}/g) ?? [];

/** Numéro national par groupes de 2 (« 07 08 09 10 11 »). */
export function formatLocal(e164: string): string {
  const cc = dialCodeOf(e164) ?? '';
  const national = e164.slice(1 + cc.length);
  const shown = KEEP_LEADING_ZERO.has(cc) || !cc ? national : `0${national}`;
  return pairs(shown).join(' ');
}

/** Numéro masqué pour l'affichage (« +225 07 08 •• •• 11 ») : jamais le numéro entier à l'écran. */
export function maskPhone(e164: string): string {
  const cc = dialCodeOf(e164) ?? '';
  const groups = formatLocal(e164).split(' ');
  const masked = groups.map((g, i) => (i < 2 || i === groups.length - 1 ? g : '••'));
  return `+${cc} ${masked.join(' ')}`.trim();
}

/** Code secret : `format` (pas 6 chiffres), `weak` (suite évidente) ou null (accepté). */
export function secretProblem(code: string): 'format' | 'weak' | null {
  if (!/^\d{6}$/.test(code)) return 'format';
  const d = [...code].map(Number);
  const step = (k: number) => d.every((x, i) => i === 0 || x === d[i - 1] + k);
  if (step(0) || step(1) || step(-1)) return 'weak';
  if (code === code.slice(0, 2).repeat(3) || code === code.slice(0, 3).repeat(2)) return 'weak';
  if (code[0] === code[1] && code[2] === code[3] && code[4] === code[5]) return 'weak';
  return null;
}

/** État d'un numéro (côté serveur) : envois du jour, erreurs de code secret, blocage. */
export interface PhoneGuard {
  day: string;
  sends: number;
  lastSendAt: number;
  fails: number;
  lockLevel: number;
  lockedUntil: number;
}

export type SendDecision = { ok: true } | { ok: false; reason: 'too-soon' | 'daily-limit'; retryAt: number | null };

/** Un code peut-il être envoyé à ce numéro maintenant ? (1 par minute, 5 par jour). */
export function sendDecision(g: PhoneGuard, now: number, day: string): SendDecision {
  const sends = g.day === day ? g.sends : 0;
  if (g.lastSendAt && now - g.lastSendAt < PHONE_RULES.sendIntervalMs) return { ok: false, reason: 'too-soon', retryAt: g.lastSendAt + PHONE_RULES.sendIntervalMs };
  if (sends >= PHONE_RULES.sendsPerDay) return { ok: false, reason: 'daily-limit', retryAt: null };
  return { ok: true };
}

/** Durée du blocage de niveau `level` (1 : 15 min, 2 : 1 h, 3 et plus : 24 h). */
export function lockDuration(level: number): number {
  if (level <= 0) return 0;
  return PHONE_RULES.locksMs[Math.min(level, PHONE_RULES.locksMs.length) - 1];
}

export function isLocked(g: Pick<PhoneGuard, 'lockedUntil'>, now: number): boolean {
  return g.lockedUntil > now;
}

/** Après un code secret faux : 5 erreurs → blocage du niveau suivant (compteur remis à zéro). */
export function failureAfter(g: PhoneGuard, now: number): PhoneGuard {
  const fails = g.fails + 1;
  if (fails < PHONE_RULES.secretMaxFails) return { ...g, fails };
  const lockLevel = g.lockLevel + 1;
  return { ...g, fails: 0, lockLevel, lockedUntil: now + lockDuration(lockLevel) };
}
