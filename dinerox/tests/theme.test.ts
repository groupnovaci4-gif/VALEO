import { describe, expect, it } from 'vitest';
import { pickableColors } from '../src/theme/tokens';
import { ACCOUNT_TEMPLATES } from '../src/core/defaults';

describe('palette', () => {
  it('ne contient aucune couleur en double (clé React unique dans le sélecteur)', () => {
    const norm = pickableColors.map((c) => c.toUpperCase());
    expect(new Set(norm).size).toBe(norm.length);
  });
  it('les modèles de compte ont des clés uniques', () => {
    const keys = ACCOUNT_TEMPLATES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
