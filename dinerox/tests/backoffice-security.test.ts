import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashRecovery, hotp, newRecoveryCodes, normalizeRecovery, parseKey, totp, verifyTotp } from '../firebase/functions/src/backoffice/totp';
import { buildEntry, DETAIL_KEYS, FINANCIAL_KEYS, GENESIS_HASH, validateReason, verifyChain, type AuditEntry } from '../firebase/functions/src/backoffice/auditCore';

describe('double vérification (TOTP)', () => {
  // RFC 6238, annexe B : secret ASCII « 12345678901234567890 », SHA-1, 8 chiffres → 6 derniers.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('vecteurs de la RFC 6238', () => {
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000)).toBe('081804');
    expect(totp(secret, 2_000_000_000_000)).toBe('279037');
    expect(hotp(secret, 0)).toBe('755224'); // RFC 4226
  });
  it('base32 aller-retour', () => {
    const b = randomBytes(20);
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });
  it('fenêtre de ±30 s, rien au-delà', () => {
    const now = 1_760_000_000_000;
    expect(verifyTotp(secret, totp(secret, now - 30_000), now, null)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now + 30_000), now, null)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 90_000), now, null)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
    expect(verifyTotp(secret, 123456, now, null)).toBeNull();
  });
  it('un code déjà utilisé n’est jamais accepté deux fois (rejeu)', () => {
    const now = 1_760_000_000_000;
    const step = verifyTotp(secret, totp(secret, now), now, null);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now), now, step)).toBeNull();
  });
  it('secret chiffré : illisible sans la clé, refus si la clé manque', () => {
    const key = randomBytes(32);
    const blob = encryptSecret(secret, key);
    expect(blob).not.toContain(secret);
    expect(decryptSecret(blob, key)).toBe(secret);
    expect(() => decryptSecret(blob, randomBytes(32))).toThrow();
    expect(() => parseKey(undefined)).toThrow('bo/mfa-key-missing');
    expect(() => parseKey('')).toThrow('bo/mfa-key-missing');
    expect(parseKey(key.toString('base64')).equals(key)).toBe(true);
  });
  it('codes de secours : 8, uniques, format XXXX-XXXX, hachés', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const key = randomBytes(32);
    expect(hashRecovery(normalizeRecovery(codes[0].toLowerCase())!, key)).toBe(hashRecovery(codes[0].replace('-', ''), key));
    expect(hashRecovery('ABCDEFGH', key)).not.toContain('ABCDEFGH');
  });
});

describe('journal d’audit', () => {
  const input = {
    actorUid: 'A',
    actorEmail: 'koffi@dinerox.app',
    actorRole: 'superAdmin',
    action: 'data.delete',
    result: 'ok' as const,
    targetUid: 'U1',
    targetEmail: 'Aicha.Kone@exemple.ci',
    before: { status: 'active', amount: 50000, payee: 'Marché', note: 'secret', categoryId: 'cat_food', plan: 'free' },
    after: { email: 'aicha.kone@exemple.ci', balance: 10, firstName: 'Aïcha' },
    effects: { debtPayment: 1, reserveUse: 2, amount: 5000.5 } as Record<string, number>,
  };

  it('aucun champ financier, même si l’appelant en fournit', () => {
    const e = buildEntry(input, 1, 1000, GENESIS_HASH);
    const json = JSON.stringify(e);
    for (const k of FINANCIAL_KEYS) {
      expect(Object.keys(e.before ?? {})).not.toContain(k);
      expect(Object.keys(e.after ?? {})).not.toContain(k);
    }
    expect(json).not.toContain('50000');
    expect(json).not.toContain('Marché');
    expect(json).not.toContain('secret');
    expect(e.effects).toEqual({ debtPayment: 1, reserveUse: 2 });
    for (const k of DETAIL_KEYS) expect(FINANCIAL_KEYS).not.toContain(k);
  });
  it('pas d’adresse d’utilisateur en clair : domaine + empreinte (D11), e-mail masqué dans after', () => {
    const e = buildEntry(input, 1, 1000, GENESIS_HASH);
    expect(JSON.stringify(e).toLowerCase()).not.toContain('aicha.kone@');
    expect(e.targetDomain).toBe('exemple.ci');
    expect(e.targetEmailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(e.after?.email).toBe('a•••@exemple.ci');
  });
  it('chaînage : une ligne modifiée, retirée ou insérée se voit', () => {
    const chain: AuditEntry[] = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= 5; i++) {
      const e = buildEntry({ ...input, action: `a${i}` }, i, 1000 + i, prev);
      chain.push(e);
      prev = e.hash;
    }
    expect(verifyChain(chain)).toBeNull();
    expect(verifyChain(chain.map((e, i) => (i === 2 ? { ...e, reasonNote: 'modifié' } : e)))).toBe(3);
    expect(verifyChain(chain.filter((_, i) => i !== 1))).toBe(3);
    expect(verifyChain([chain[0], chain[2], chain[1]])).toBe(3);
  });
  it('motif interne : liste fermée, « Autre » exige une précision', () => {
    expect(validateReason('client_request', undefined)).toEqual({ ok: true, reasonCode: 'client_request', reasonNote: null });
    expect(validateReason('other', '')).toEqual({ ok: false });
    expect(validateReason('other', 'Contrôle interne')).toEqual({ ok: true, reasonCode: 'other', reasonNote: 'Contrôle interne' });
    expect(validateReason('curiosité', 'x')).toEqual({ ok: false });
  });
});
