import { describe, expect, it } from 'vitest';
import { familyObligations, monthlyEquivalent, obligationTotals, obligationsDueTomorrow, yearlyAmount } from '../src/core/obligations';
import type { RecurringRule } from '../src/core/types';

const rule = (p: Partial<RecurringRule>): RecurringRule => ({
  id: p.id ?? `r${Math.random()}`,
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'u',
  type: 'expense',
  label: 'Maman',
  amount: 20_000,
  currency: 'XOF',
  accountId: 'a',
  categoryId: 'cat_family',
  frequency: 'monthly',
  startDate: '2026-01-05',
  active: true,
  ...p,
});

describe('famille et obligations', () => {
  it('liste : récurrences de dépense « Famille » uniquement (ni revenus, ni autres catégories, ni supprimées)', () => {
    const rules = [
      rule({ id: 'mum', label: 'Maman' }),
      rule({ id: 'school', label: 'Scolarité neveu', amount: 15_000 }),
      rule({ id: 'rent', categoryId: 'cat_housing', label: 'Loyer' }),
      rule({ id: 'gift', type: 'income', label: 'Aide reçue' }),
      rule({ id: 'old', deleted: true }),
      rule({ id: 'eur', currency: 'EUR' }),
    ];
    expect(familyObligations({ recurring: rules }, 'XOF').map((r) => r.id)).toEqual(['mum', 'school']);
  });

  it('équivalents : hebdomadaire × 52 / 12, annuel / 12', () => {
    expect(monthlyEquivalent(rule({ amount: 20_000, frequency: 'monthly' }))).toBe(20_000);
    expect(monthlyEquivalent(rule({ amount: 3_000, frequency: 'weekly' }))).toBe(13_000);
    expect(monthlyEquivalent(rule({ amount: 120_000, frequency: 'yearly' }))).toBe(10_000);
    expect(yearlyAmount(rule({ amount: 3_000, frequency: 'weekly' }))).toBe(156_000);
  });

  it('totaux par mois, par an et part des revenus (soutiens actifs seulement)', () => {
    const rules = [rule({ amount: 20_000 }), rule({ amount: 15_000 }), rule({ amount: 50_000, active: false })];
    expect(obligationTotals(rules, 350_000)).toEqual({ count: 2, monthly: 35_000, yearly: 420_000, shareOfIncome: 10 });
  });

  it('sans revenu connu : aucune part inventée', () => {
    expect(obligationTotals([rule({})], null).shareOfIncome).toBeNull();
    expect(obligationTotals([rule({})], 0).shareOfIncome).toBeNull();
  });

  it('soutien à verser demain (déjà enregistré : non)', () => {
    const r = rule({ id: 'mum', startDate: '2026-01-16' });
    expect(obligationsDueTomorrow({ recurring: [r] }, '2026-10-15').map((x) => x.id)).toEqual(['mum']);
    expect(obligationsDueTomorrow({ recurring: [r] }, '2026-10-14')).toEqual([]);
    expect(obligationsDueTomorrow({ recurring: [{ ...r, lastGenerated: '2026-10-16' }] }, '2026-10-15')).toEqual([]);
    expect(obligationsDueTomorrow({ recurring: [{ ...r, active: false }] }, '2026-10-15')).toEqual([]);
  });
});
