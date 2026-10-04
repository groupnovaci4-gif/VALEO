import { describe, expect, it } from 'vitest';
import { computeInsights, savingsCapacity, detectRecurringPayments } from '../src/core/insights';
import { buildReport, transactionsToCsv } from '../src/core/reports';
import { emptySpaceData } from '../src/core/types';
import { account, envelope, tx } from './helpers';

const NOW = '2026-10-20';

describe('moteur d analyse', () => {
  const data = emptySpaceData();
  data.accounts = [account({ id: 'c' })];
  data.envelopes = [envelope({ id: 'tr', name: 'Transport', monthlyBudget: 40_000, categoryIds: ['cat_transport'] })];
  data.transactions = [
    tx({ type: 'expense', amount: 33_000, accountId: 'c', categoryId: 'cat_transport', date: '2026-10-05' }),
    tx({ type: 'expense', amount: 50_000, accountId: 'c', categoryId: 'cat_food', date: '2026-09-10' }),
    tx({ type: 'expense', amount: 61_000, accountId: 'c', categoryId: 'cat_food', date: '2026-10-10' }),
    tx({ type: 'income', amount: 450_000, accountId: 'c', date: '2026-09-25' }),
    tx({ type: 'income', amount: 450_000, accountId: 'c', date: '2026-08-25' }),
    tx({ type: 'expense', amount: 370_000, accountId: 'c', date: '2026-08-26' }),
  ];
  const insights = computeInsights({ data, currency: 'XOF', now: NOW, categoryName: (_c, id) => id });

  it('alerte enveloppe à 82 %', () => {
    expect(insights.find((i) => i.kind === 'envelope_threshold')).toMatchObject({ params: { percent: 83, level: 'warn70' } });
  });
  it('hausse d une catégorie vs mois dernier', () => {
    expect(insights.find((i) => i.kind === 'category_increase')).toMatchObject({ params: { percent: 22 } });
  });
  it('capacité d épargne = moyenne des mois complets', () => {
    // août : 450 − 370 = 80 ; sept : 450 − 50 = 400 → 240 000
    expect(savingsCapacity(data.transactions, NOW, 'XOF')).toBe(240_000);
  });
  it('détection de paiements récurrents', () => {
    const list = ['2026-08-03', '2026-09-03', '2026-10-03'].map((date) => tx({ type: 'expense', amount: 10_000, accountId: 'c', payee: 'Canal+', date }));
    expect(detectRecurringPayments(list, NOW, 'XOF')).toEqual([{ payee: 'Canal+', amount: 10_000, months: 3 }]);
  });
});

describe('rapports', () => {
  const data = emptySpaceData();
  data.accounts = [account({ id: 'c' }), account({ id: 's', isSavings: true })];
  data.transactions = [
    tx({ type: 'income', amount: 450_000, accountId: 'c', date: '2026-10-01' }),
    tx({ type: 'expense', amount: 100_000, accountId: 'c', categoryId: 'cat_housing', date: '2026-10-02' }),
    tx({ type: 'transfer', amount: 50_000, accountId: 'c', toAccountId: 's', date: '2026-10-03' }),
    tx({ type: 'expense', amount: 80_000, accountId: 'c', date: '2026-09-02' }),
  ];
  it('mensuel : totaux, épargne, comparaison', () => {
    const r = buildReport(data, 'month', '2026-10-15', 'XOF');
    expect(r).toMatchObject({ income: 450_000, expense: 100_000, net: 350_000, saved: 50_000, savingsRate: 11, expenseChange: 25 });
    expect(r.series).toHaveLength(31);
    expect(r.byCategory[0]).toMatchObject({ categoryId: 'cat_housing', percent: 100 });
  });
  it('annuel : 12 points', () => {
    expect(buildReport(data, 'year', '2026-10-15', 'XOF').series).toHaveLength(12);
  });
  it('hebdomadaire : lundi → dimanche', () => {
    const r = buildReport(data, 'week', '2026-10-01', 'XOF');
    expect(r.period).toMatchObject({ start: '2026-09-28', end: '2026-10-04' });
  });
  it('CSV : séparateur ; et neutralisation des formules', () => {
    const csv = transactionsToCsv([tx({ type: 'expense', amount: 5000, accountId: 'c', payee: '=HACK()', note: 'a;b' })], {
      accountName: () => 'Cash', categoryName: () => '', categories: [], decimals: () => 0, headers: ['Date', 'Type', 'Montant', 'Devise', 'Compte', 'Vers', 'Catégorie', 'Bénéficiaire', 'Note'], typeLabel: (t) => t,
    });
    const line = csv.split('\n')[1];
    expect(line).toContain("'=HACK()");
    expect(line).toContain('"a;b"');
  });
});
