/** Lot A, phase 0 — Historique : mois, filtres, totaux par devise. */
import { describe, expect, it } from 'vitest';
import { ALL_HISTORY, filterHistory, historyCategories, historyMonths, isFiltered, periodTotals } from '../src/core/history';
import { tx } from './helpers';

const list = [
  tx({ id: 'a', type: 'expense', amount: 2000, accountId: 'cash', categoryId: 'cat_transport', date: '2026-10-03', createdAt: 1 }),
  tx({ id: 'b', type: 'income', amount: 250000, accountId: 'bank', categoryId: 'inc_salary', date: '2026-10-01', createdAt: 2 }),
  tx({ id: 'c', type: 'expense', amount: 500, accountId: 'cash', categoryId: 'cat_food', date: '2026-09-28', payee: 'Garba', createdAt: 3 }),
  tx({ id: 'd', type: 'transfer', amount: 10000, accountId: 'bank', toAccountId: 'cash', date: '2026-10-02', createdAt: 4 }),
  tx({ id: 'e', type: 'expense', amount: 1500, accountId: 'eur', currency: 'EUR', categoryId: 'cat_food', date: '2026-10-02', createdAt: 5 }),
  tx({ id: 'z', type: 'expense', amount: 999, accountId: 'cash', categoryId: 'cat_food', date: '2026-10-02', deleted: true, createdAt: 6 }),
];

describe('historique', () => {
  it('mois disponibles, du plus récent au plus ancien, sans les supprimées', () => {
    expect(historyMonths(list)).toEqual(['2026-10', '2026-09']);
  });
  it('catégories utilisées (hors transferts)', () => {
    expect(historyCategories(list).sort()).toEqual(['cat_food', 'cat_transport', 'inc_salary']);
  });
  it('sans filtre : tout, trié du plus récent au plus ancien', () => {
    expect(filterHistory(list, ALL_HISTORY).map((t) => t.id)).toEqual(['a', 'e', 'd', 'b', 'c']);
    expect(isFiltered(ALL_HISTORY)).toBe(false);
  });
  it('filtre par mois, compte, catégorie et recherche', () => {
    expect(filterHistory(list, { ...ALL_HISTORY, month: '2026-09' }).map((t) => t.id)).toEqual(['c']);
    expect(filterHistory(list, { ...ALL_HISTORY, accountId: 'cash' }).map((t) => t.id)).toEqual(['a', 'd', 'c']);
    expect(filterHistory(list, { ...ALL_HISTORY, categoryId: 'cat_food' }).map((t) => t.id)).toEqual(['e', 'c']);
    expect(filterHistory(list, { ...ALL_HISTORY, search: 'garba' }).map((t) => t.id)).toEqual(['c']);
    expect(isFiltered({ ...ALL_HISTORY, month: '2026-10' })).toBe(true);
  });
  it('totaux par devise, transferts exclus, jamais additionnés entre devises', () => {
    const tot = periodTotals(filterHistory(list, { ...ALL_HISTORY, month: '2026-10' }));
    expect(tot.XOF).toEqual({ income: 250000, expense: 2000, net: 248000, count: 2 });
    expect(tot.EUR).toEqual({ income: 0, expense: 1500, net: -1500, count: 1 });
  });
});
