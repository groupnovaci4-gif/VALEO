/**
 * Audit du 23/10, partie 2 (branche connexion-telephone) — côté application :
 *  - icône d'un message « À lire » : elle suit l'ÉTIQUETTE (un « Votre coach » n'a jamais
 *    l'ampoule violette du « Conseil du jour ») ;
 *  - interrupteur publié (C5) : seul `enabled: true` affiche les boutons « numéro » ;
 *  - refus du serveur → messages existants (S1 connexion récente, S8 compte suspendu, S4 pays).
 * Les parcours eux-mêmes sont vérifiés par e2e/phone-auth.js et e2e/suspended.js.
 */
import { describe, expect, it, vi } from 'vitest';
import { finalPalette } from '../src/theme/finalPalette';
import { look } from '../src/features/notifications/look';

vi.mock('../src/services/firebase', () => ({}));
vi.mock('../src/services/storage', () => ({ readJSON: async () => null, writeJSON: async () => undefined }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => undefined }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: () => undefined }));
vi.mock('firebase/firestore', () => ({ doc: () => undefined, getDoc: async () => undefined }));
vi.mock('../src/config/env', () => ({ isFirebaseConfigured: false, env: {} }));

const { phoneErrorOf } = await import('../src/services/phoneAuth');
const { phoneAuthEnabledFrom } = await import('../src/services/phoneAuthSwitch');

describe('« À lire » : l’icône suit l’étiquette', () => {
  for (const dark of [false, true]) {
    const p = finalPalette(dark);
    it(`« Votre coach » au ton « conseil » : pas l’ampoule violette du « Conseil du jour » (${dark ? 'sombre' : 'clair'})`, () => {
      const coach = look({ kind: 'coach', tone: 'advice' }, p);
      expect(coach.icon).not.toBe('bulb');
      expect(coach.fg).not.toBe(p.violetFg);
      expect(coach).toEqual(look({ kind: 'coach', tone: 'info' }, p));
    });
    it(`« Conseil du jour » garde son ampoule violette ; « Votre analyse » son graphique (${dark ? 'sombre' : 'clair'})`, () => {
      expect(look({ kind: 'advice', tone: 'advice' }, p)).toEqual({ bg: p.violetBg, fg: p.violetFg, icon: 'bulb' });
      expect(look({ kind: 'analysis', tone: 'advice' }, p).icon).toBe('analytics');
      expect(look({ kind: 'budget', tone: 'danger' }, p).icon).toBe('alert-circle');
    });
  }
});

describe('C5 — interrupteur « connexion par numéro »', () => {
  it('désactivé par défaut : absent, faux ou mal formé', () => {
    for (const raw of [null, undefined, {}, { enabled: false }, { enabled: 'true' }, { enabled: 1 }, 'true']) expect(phoneAuthEnabledFrom(raw), JSON.stringify(raw)).toBe(false);
  });
  it('activé seulement par `enabled: true`', () => {
    expect(phoneAuthEnabledFrom({ enabled: true })).toBe(true);
  });
});

describe('refus du serveur (audit 23/10) → messages existants', () => {
  const sdk = (code: string, message: string, status: number) => ({ code: `functions/${code}`, message: `${message} [${status}]` });
  it('S8 : compte suspendu → « Ce compte est suspendu… » (même message que l’e-mail)', () => {
    expect(phoneErrorOf(sdk('permission-denied', 'phone/disabled', 403)).key).toBe('auth.err.user-disabled');
  });
  it('S1 : connexion trop ancienne → « reconnectez-vous puis réessayez »', () => {
    expect(phoneErrorOf(sdk('failed-precondition', 'phone/recent-login', 400)).key).toBe('auth.err.requires-recent-login');
  });
  it('S4 : pays hors liste par WhatsApp → message dédié (le message SMS ne convient pas)', () => {
    expect(phoneErrorOf(sdk('failed-precondition', 'phone/country', 400)).key).toBe('phone.err.country');
    expect(phoneErrorOf(sdk('failed-precondition', 'phone/sms-country', 400)).key).toBe('phone.err.smsCountry');
  });
});
