import { describe, expect, it } from 'vitest';
import { cleanName, normalizePhone, validateEmail, validateName, validatePassword, validatePhone, validateSignUp } from '../src/core/validation';

const ok = { lastName: 'Konan', firstName: 'César', email: 'test@example.com', phone: '', password: 'motdepasse123', confirm: 'motdepasse123', terms: true };

describe('validation des formulaires', () => {
  it('noms : accents, apostrophe, trait d’union, espaces multiples', () => {
    for (const n of ['Konan', 'César', "N'Guessan", 'Kouassi-Brou', 'Marie Christelle', 'Ébrié', 'Diop  ', 'O’Brien', 'Jr.']) expect(validateName(n), n).toBeNull();
    expect(cleanName('  Marie   Christelle ')).toBe('Marie Christelle');
  });
  it('noms : vide, trop long, chiffres ou symboles refusés avec un motif précis', () => {
    expect(validateName('   ')).toBe('required');
    expect(validateName('a'.repeat(81))).toBe('tooLong');
    expect(validateName('K0nan')).toBe('invalid');
    expect(validateName('<script>')).toBe('invalid');
  });
  it('e-mail', () => {
    expect(validateEmail('test@example.com')).toBeNull();
    expect(validateEmail(' test@example.com ')).toBeNull();
    expect(validateEmail('')).toBe('required');
    for (const e of ['test@', 'test.example.com', 'test@example', 'te st@example.com']) expect(validateEmail(e), e).toBe('invalid');
  });
  it('téléphone facultatif : vide accepté, formats CI/FR/internationaux, invalides refusés', () => {
    expect(validatePhone('')).toBeNull();
    for (const p of ['07 07 07 07 07', '+225 07 07 07 07 07', '0033 6 12 34 56 78', '(+33) 6-12-34-56-78']) expect(validatePhone(p), p).toBeNull();
    for (const p of ['123', 'abc12345678', '+1234567890123456']) expect(validatePhone(p), p).toBe('invalid');
    expect(normalizePhone('+225 07 07 07 07 07')).toBe('+2250707070707');
    expect(normalizePhone('0033 6 12 34 56 78')).toBe('+33612345678');
  });
  it('mot de passe', () => {
    expect(validatePassword('')).toBe('required');
    expect(validatePassword('court')).toBe('weak');
    expect(validatePassword('x'.repeat(129))).toBe('tooLong');
    expect(validatePassword('motdepasse123')).toBeNull();
  });
  it('inscription : valide, confirmation incorrecte, conditions non acceptées', () => {
    expect(validateSignUp(ok)).toEqual({});
    expect(validateSignUp({ ...ok, confirm: 'autre' })).toEqual({ confirm: 'auth.err.passwordMismatch' });
    expect(validateSignUp({ ...ok, terms: false })).toEqual({ terms: 'auth.err.terms' });
    expect(Object.keys(validateSignUp({ ...ok, lastName: '', email: 'x', phone: '12', password: '1' })).sort()).toEqual(['email', 'lastName', 'password', 'phone']);
  });
});
