import { describe, expect, it } from 'vitest';
import { envelopeLevel, envelopeStatuses, normalizeLevel, proposeBudget, proposeIncomeAllocation, resolveEnvelopeId } from '../src/core/budget';
import { envelope, tx } from './helpers';

describe('seuils d enveloppe', () => {
  it('85 % / 100 % / dépassement (budget 100 000)', () => {
    expect(envelopeLevel(50_000, 100_000)).toBe('ok');
    expect(envelopeLevel(84_999, 100_000)).toBe('ok');
    expect(envelopeLevel(85_000, 100_000)).toBe('warning');
    expect(envelopeLevel(90_000, 100_000)).toBe('warning');
    expect(envelopeLevel(99_999, 100_000)).toBe('warning');
    expect(envelopeLevel(100_000, 100_000)).toBe('reached');
    expect(envelopeLevel(100_001, 100_000)).toBe('critical');
    expect(envelopeLevel(120_000, 100_000)).toBe('critical');
  });
  it('budget nul', () => {
    expect(envelopeLevel(0, 0)).toBe('ok');
    expect(envelopeLevel(1, 0)).toBe('critical');
  });
  it('lecture compatible des anciens niveaux', () => {
    expect(normalizeLevel('warn70')).toBe('ok');
    expect(normalizeLevel('warn90')).toBe('warning');
    expect(normalizeLevel('full')).toBe('reached');
    expect(normalizeLevel('over')).toBe('critical');
    expect(normalizeLevel('critical')).toBe('critical');
    expect(normalizeLevel(undefined)).toBe('ok');
  });
});

describe('consommation des enveloppes', () => {
  const food = envelope({ id: 'food', monthlyBudget: 80_000, categoryIds: ['cat_food'] });
  const transport = envelope({ id: 'tr', monthlyBudget: 40_000, categoryIds: ['cat_transport'], order: 1 });
  it('rattache par catégorie ou explicitement, sur le mois', () => {
    const list = [
      tx({ type: 'expense', amount: 30_000, accountId: 'a', categoryId: 'cat_food', date: '2026-10-02' }),
      tx({ type: 'expense', amount: 10_000, accountId: 'a', envelopeId: 'food', date: '2026-10-03' }),
      tx({ type: 'expense', amount: 33_000, accountId: 'a', categoryId: 'cat_transport', date: '2026-10-03' }),
      tx({ type: 'expense', amount: 99_000, accountId: 'a', categoryId: 'cat_food', date: '2026-09-30' }),
    ];
    const s = envelopeStatuses([food, transport], list, [], '2026-10', 'XOF');
    expect(s[0]).toMatchObject({ spent: 40_000, remaining: 40_000, percent: 50, level: 'ok' });
    expect(s[1]).toMatchObject({ spent: 33_000, percent: 83, level: 'ok' });
  });
  it('le plan du mois surcharge le budget par défaut', () => {
    const s = envelopeStatuses([food], [], [{ id: '2026-10', month: '2026-10', method: 'custom', expectedIncome: 0, allocations: { food: 50_000 }, createdAt: 1, updatedAt: 1, createdBy: 'u' }], '2026-10', 'XOF');
    expect(s[0].budget).toBe(50_000);
  });
  it('choix explicite prioritaire', () => {
    expect(resolveEnvelopeId({ envelopeId: 'x', categoryId: 'cat_food' }, [food])).toBe('x');
    expect(resolveEnvelopeId({ envelopeId: null, categoryId: 'cat_food' }, [food])).toBe('food');
    expect(resolveEnvelopeId({ envelopeId: null, categoryId: 'cat_other' }, [food])).toBeNull();
  });
});

describe('budget automatique', () => {
  it('reproduit l exemple 450 000 FCFA', () => {
    const lines = proposeBudget(450_000, 'envelopes', 'XOF');
    const m = Object.fromEntries(lines.map((l) => [l.bucket, l.amount]));
    expect(m).toEqual({ housing: 100_000, food: 80_000, transport: 40_000, family: 50_000, savings: 50_000, project: 30_000, free: 100_000 });
  });
  it('la somme est toujours égale au revenu', () => {
    for (const income of [1, 73_500, 450_000, 1_234_567]) {
      for (const method of ['envelopes', '50_30_20', 'zero_based'] as const) {
        const sum = proposeBudget(income, method, 'XOF').reduce((s, l) => s + l.amount, 0);
        expect(sum).toBe(income);
      }
    }
  });
  it('50/30/20', () => {
    const m = Object.fromEntries(proposeBudget(500_000, '50_30_20', 'XOF').map((l) => [l.bucket, l.amount]));
    expect(m).toEqual({ needs: 250_000, wants: 150_000, savings: 100_000 });
  });
  it('revenu nul ou négatif → rien', () => {
    expect(proposeBudget(0, 'envelopes', 'XOF')).toEqual([]);
    expect(proposeBudget(-5, 'envelopes', 'XOF')).toEqual([]);
  });
  it('affectation d un revenu : somme exacte, jamais plus que le besoin', () => {
    const food = envelope({ id: 'food', monthlyBudget: 80_000, categoryIds: ['cat_food'] });
    const rent = envelope({ id: 'rent', monthlyBudget: 100_000, categoryIds: ['cat_housing'] });
    const statuses = envelopeStatuses([food, rent], [], [], '2026-10', 'XOF');
    const alloc = proposeIncomeAllocation(250_000, statuses, 'XOF');
    expect(alloc.reduce((s, a) => s + a.amount, 0)).toBe(250_000);
    expect(alloc.find((a) => a.envelopeId === 'food')!.amount).toBeLessThanOrEqual(80_000);
    expect(alloc.find((a) => a.envelopeId === null)!.amount).toBe(70_000);
  });
});
