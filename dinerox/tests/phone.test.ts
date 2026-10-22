/**
 * Connexion par téléphone, étape 1 (docs/connexion-telephone/PROPOSITION.md §7, DECISIONS.md §5bis) :
 * module PUR `src/core/phone.ts` — numéro au format international (+225 proposé, modifiable),
 * liste blanche des SMS (pays proposés par l'application), code secret (6 chiffres, refus des
 * suites évidentes), règles d'envoi et de blocage.
 */
import { describe, expect, it } from 'vitest';
import { COUNTRY_PROFILES } from '../src/core/countries';
import {
  DEFAULT_DIAL,
  DIAL_CODES,
  PHONE_RULES,
  dialCodeOf,
  failureAfter,
  formatLocal,
  isLocked,
  lockDuration,
  maskPhone,
  normalizePhone,
  secretProblem,
  sendDecision,
  smsAllowed,
  smsDialCodes,
  type PhoneGuard,
} from '../src/core/phone';

const MIN = 60_000;
const DAY = '2026-10-22';

describe('numéro au format international (+225 proposé, modifiable)', () => {
  it('« 07 08 09 10 11 » → +2250708091011 (Côte d’Ivoire : le 0 fait partie du numéro)', () => {
    expect(DEFAULT_DIAL).toBe('225');
    expect(normalizePhone('07 08 09 10 11')).toBe('+2250708091011');
    expect(normalizePhone('07.08.09.10.11')).toBe('+2250708091011');
    expect(normalizePhone('+225 07 08 09 10 11')).toBe('+2250708091011');
    expect(normalizePhone('00225 0708091011')).toBe('+2250708091011');
  });
  it('autre indicatif choisi : le 0 national est retiré (France 06… → +336…)', () => {
    expect(normalizePhone('06 12 34 56 78', '33')).toBe('+33612345678');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
  });
  it('numéro incomplet ou absurde : refusé (null)', () => {
    for (const bad of ['', '07', '12 34', 'abc', '+225 07 08', '+1234567890123456']) expect(normalizePhone(bad), bad).toBeNull();
  });
  it('affichage : masqué (« +225 07 08 •• •• 11 ») et local (« 07 08 09 10 11 »)', () => {
    expect(maskPhone('+2250708091011')).toBe('+225 07 08 •• •• 11');
    expect(formatLocal('+2250708091011')).toBe('07 08 09 10 11');
  });
});

describe('5bis.5 — SMS seulement vers les pays proposés par l’application', () => {
  it('chaque pays de core/countries.ts a son indicatif', () => {
    for (const p of COUNTRY_PROFILES) expect(DIAL_CODES[p.code], p.code).toMatch(/^\d{1,4}$/);
  });
  it('la liste blanche = les indicatifs de ces pays, et eux seuls', () => {
    expect(new Set(smsDialCodes())).toEqual(new Set(COUNTRY_PROFILES.map((p) => DIAL_CODES[p.code])));
  });
  it('Côte d’Ivoire, Sénégal, France : autorisés ; indicatif hors liste (+1, +7, +86, +880) : refusé', () => {
    for (const ok of ['+2250708091011', '+221771234567', '+33612345678']) expect(smsAllowed(ok), ok).toBe(true);
    for (const no of ['+12025550123', '+79161234567', '+8613812345678', '+8801712345678']) expect(smsAllowed(no), no).toBe(false);
    expect(dialCodeOf('+2250708091011')).toBe('225');
    expect(dialCodeOf('+12025550123')).toBeNull();
  });
});

describe('code secret : 6 chiffres, jamais une suite évidente', () => {
  it('6 chiffres exactement', () => {
    for (const bad of ['', '12345', '1234567', '12a456', '12 456']) expect(secretProblem(bad), bad).toBe('format');
  });
  it('« 123456 », « 000000 », « 654321 », « 121212 », « 123123 » : refusés', () => {
    for (const weak of ['123456', '000000', '111111', '654321', '234567', '987654', '121212', '123123', '112233']) expect(secretProblem(weak), weak).toBe('weak');
  });
  it('un code ordinaire est accepté', () => {
    for (const ok of ['483915', '720461', '905238']) expect(secretProblem(ok), ok).toBeNull();
  });
});

describe('règles d’envoi : 1 par minute, 5 par jour et par numéro', () => {
  const g = (o: Partial<PhoneGuard> = {}): PhoneGuard => ({ day: DAY, sends: 0, lastSendAt: 0, fails: 0, lockLevel: 0, lockedUntil: 0, ...o });
  it('constantes du fondateur', () => {
    expect(PHONE_RULES).toMatchObject({ codeTtlMs: 10 * MIN, codeMaxAttempts: 5, sendsPerDay: 5, sendIntervalMs: MIN, secretMaxFails: 5 });
    expect(PHONE_RULES.locksMs).toEqual([15 * MIN, 60 * MIN, 24 * 60 * MIN]);
  });
  it('premier envoi : accepté ; moins d’une minute après : refusé (« too-soon »)', () => {
    expect(sendDecision(g(), 1_000_000, DAY)).toEqual({ ok: true });
    const r = sendDecision(g({ sends: 1, lastSendAt: 1_000_000 }), 1_000_000 + 30_000, DAY);
    expect(r).toEqual({ ok: false, reason: 'too-soon', retryAt: 1_000_000 + MIN });
  });
  it('6e envoi du jour : refusé (« daily-limit ») ; le lendemain, le compteur repart de zéro', () => {
    expect(sendDecision(g({ sends: 5, lastSendAt: 0 }), 10 * MIN, DAY)).toMatchObject({ ok: false, reason: 'daily-limit' });
    expect(sendDecision(g({ sends: 5, lastSendAt: 0 }), 10 * MIN, '2026-10-23')).toEqual({ ok: true });
  });
});

describe('blocage : 15 min, puis 1 h, puis 24 h (par numéro tenté)', () => {
  const g0: PhoneGuard = { day: DAY, sends: 0, lastSendAt: 0, fails: 0, lockLevel: 0, lockedUntil: 0 };
  it('durées par niveau', () => {
    expect(lockDuration(1)).toBe(15 * MIN);
    expect(lockDuration(2)).toBe(60 * MIN);
    expect(lockDuration(3)).toBe(24 * 60 * MIN);
    expect(lockDuration(9)).toBe(24 * 60 * MIN);
  });
  it('5 erreurs → bloqué 15 min ; 5 de plus après → 1 h ; puis 24 h', () => {
    let g = g0;
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) g = failureAfter(g, now);
    expect(isLocked(g, now)).toBe(false);
    g = failureAfter(g, now);
    expect(g.lockedUntil).toBe(now + 15 * MIN);
    expect(isLocked(g, now + 14 * MIN)).toBe(true);
    expect(isLocked(g, now + 15 * MIN)).toBe(false);
    const later = now + 16 * MIN;
    for (let i = 0; i < 5; i++) g = failureAfter(g, later);
    expect(g.lockedUntil).toBe(later + 60 * MIN);
    const later2 = later + 61 * MIN;
    for (let i = 0; i < 5; i++) g = failureAfter(g, later2);
    expect(g.lockedUntil).toBe(later2 + 24 * 60 * MIN);
  });
});
