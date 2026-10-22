/**
 * Connexion par téléphone — refus du serveur → message (maquettes 9 à 12).
 * Le SDK Firebase ajoute le statut HTTP au message (« phone/wrong-secret [403] ») : le refus
 * doit être reconnu tel quel, sinon l'écran montre « Une erreur est survenue » au lieu du
 * message validé (cause trouvée par e2e/phone-auth.js).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/firebase', () => ({}));
vi.mock('../src/services/storage', () => ({ readJSON: async () => null, writeJSON: async () => undefined }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => undefined }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: () => undefined }));

const { phoneErrorOf } = await import('../src/services/phoneAuth');

/** Erreur telle que la rend le SDK web (FunctionsError). */
const sdk = (code: string, message: string, status: number, details?: Record<string, unknown>) => ({ code: `functions/${code}`, message: `${message} [${status}]`, details });

describe('phoneErrorOf : message du SDK avec statut HTTP', () => {
  it('mauvais code reçu : essais restants', () => {
    expect(phoneErrorOf(sdk('invalid-argument', 'phone/wrong-code', 400, { attemptsLeft: 4 }))).toEqual({ key: 'phone.err.wrongCode', params: { count: 4 }, code: 'phone/wrong-code' });
    expect(phoneErrorOf(sdk('invalid-argument', 'phone/wrong-code', 400, { attemptsLeft: 1 })).key).toBe('phone.err.wrongCodeOne');
  });
  it('mauvais code secret, blocage, code expiré, trop d’essais', () => {
    expect(phoneErrorOf(sdk('permission-denied', 'phone/wrong-secret', 403)).key).toBe('phone.err.wrongSecret');
    const now = 1_000_000;
    expect(phoneErrorOf(sdk('resource-exhausted', 'phone/locked', 429, { retryAt: now + 15 * 60_000 }), now)).toEqual({ key: 'phone.err.tooMany', params: { minutes: 15 }, code: 'phone/locked' });
    expect(phoneErrorOf(sdk('failed-precondition', 'phone/expired', 400)).code).toBe('phone/expired');
    expect(phoneErrorOf(sdk('resource-exhausted', 'phone/too-many', 429)).key).toBe('phone.err.codeTooMany');
    expect(phoneErrorOf(sdk('unavailable', 'phone/unavailable', 503)).key).toBe('phone.err.unavailable');
  });
  it('sans réseau : message « Pas de connexion Internet » ; message sans statut toujours reconnu', () => {
    expect(phoneErrorOf({ code: 'functions/internal', message: 'internal' }).key).toBe('phone.err.network');
    expect(phoneErrorOf({ code: 'functions/permission-denied', message: 'phone/wrong-secret' }).key).toBe('phone.err.wrongSecret');
  });
});
