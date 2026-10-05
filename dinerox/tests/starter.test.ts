import { describe, expect, it } from 'vitest';
import { starterStructure } from '../src/core/defaults';

const meta = { now: 1, uid: 'u1', lang: 'fr' as const, label: (k: string) => k, date: '2026-10-05' };

describe('structure de départ (inscription sans questionnaire)', () => {
  it('crée un compte Espèces, des enveloppes et les catégories, sans montant inventé', () => {
    const s = starterStructure({ firstName: 'Awa', currency: 'XOF' }, meta);
    expect(s.accounts).toHaveLength(1);
    expect(s.accounts![0].openingBalance).toBe(0);
    expect(s.envelopes!.length).toBeGreaterThan(0);
    expect(s.envelopes!.every((e) => e.monthlyBudget === 0)).toBe(true);
    expect(s.categories!.length).toBeGreaterThan(0);
    expect(s.recurring).toHaveLength(0);
    expect(s.goals).toHaveLength(0);
  });
  it('identifiants fixes : deux appareils écrivent les mêmes documents (pas de doublon)', () => {
    const a = starterStructure({ firstName: 'Awa', currency: 'XOF' }, meta);
    const b = starterStructure({ firstName: 'Awa', currency: 'XOF' }, { ...meta, now: 999 });
    expect(a.accounts!.map((x) => x.id)).toEqual(b.accounts!.map((x) => x.id));
    expect(a.envelopes!.map((x) => x.id)).toEqual(b.envelopes!.map((x) => x.id));
    expect(a.accounts![0].id).toBe('acc_start1');
    expect(new Set(a.envelopes!.map((x) => x.id)).size).toBe(a.envelopes!.length);
  });
});
