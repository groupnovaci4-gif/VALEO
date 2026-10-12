import { describe, expect, it, vi } from 'vitest';
import { isSuspendedAuthError } from '../src/core/accountStatus';
import { brand } from '../src/config/brand';

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }] }));
const { translate } = await import('../src/i18n');

describe('compte suspendu (D5, D16)', () => {
  it('seule la réponse « compte désactivé » signifie une suspension', () => {
    expect(isSuspendedAuthError({ code: 'auth/user-disabled' })).toBe(true);
    for (const code of ['auth/network-request-failed', 'auth/user-token-expired', 'auth/internal-error', 'unavailable', '']) expect(isSuspendedAuthError({ code })).toBe(false);
    expect(isSuspendedAuthError(null)).toBe(false);
    expect(isSuspendedAuthError(new Error('x'))).toBe(false);
  });

  it('textes validés (D16), adresse de support lue dans brand.ts', () => {
    expect(translate('fr', 'auth.suspended.title')).toBe('Compte suspendu');
    expect(translate('fr', 'auth.suspended.body')).toBe(`Votre compte ${brand.name} est suspendu : vous ne pouvez plus vous connecter pour le moment. Vos données sont conservées. Pour en savoir plus, écrivez-nous à ${brand.supportEmail}.`);
    expect(translate('fr', 'auth.err.user-disabled')).toBe(`Ce compte est suspendu. Écrivez-nous à ${brand.supportEmail} pour en savoir plus.`);
    expect(translate('en', 'auth.suspended.title')).toBe('Account suspended');
    expect(translate('en', 'auth.suspended.body')).toBe(`Your ${brand.name} account is suspended, so you can't sign in for now. Your data is kept. To find out more, write to us at ${brand.supportEmail}.`);
    expect(translate('en', 'auth.err.user-disabled')).toBe(`This account is suspended. Write to us at ${brand.supportEmail} to find out more.`);
  });
});
