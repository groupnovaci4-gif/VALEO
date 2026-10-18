/**
 * Historique des opérations — module PUR : mois disponibles, filtres (mois,
 * type, compte, catégorie, recherche) et totaux de la période filtrée.
 */
import { endOfMonth, monthKey, type MonthKey } from './dates';
import { filterTransactions, sortTransactions } from './transactions';
import type { Transaction, TransactionType } from './types';
import { isRevenue, spendingAmount } from './nature';

export interface HistoryFilter {
  type: TransactionType | 'all';
  accountId: string | 'all';
  categoryId: string | 'all';
  month: MonthKey | 'all';
  search: string;
}

export const ALL_HISTORY: HistoryFilter = { type: 'all', accountId: 'all', categoryId: 'all', month: 'all', search: '' };

/** Mois qui contiennent au moins une opération, du plus récent au plus ancien. */
export function historyMonths(list: Transaction[]): MonthKey[] {
  return [...new Set(list.filter((t) => !t.deleted).map((t) => monthKey(t.date)))].sort((a, b) => b.localeCompare(a));
}

/** Catégories effectivement utilisées (pour ne proposer que des filtres utiles). */
export function historyCategories(list: Transaction[]): string[] {
  return [...new Set(list.filter((t) => !t.deleted && t.type !== 'transfer' && t.categoryId).map((t) => t.categoryId as string))];
}

export function filterHistory(list: Transaction[], f: HistoryFilter, labelOf?: (t: Transaction) => string): Transaction[] {
  const from = f.month === 'all' ? undefined : `${f.month}-01`;
  const to = f.month === 'all' ? undefined : endOfMonth(`${f.month}-01`);
  return sortTransactions(
    filterTransactions(
      list,
      { type: f.type, accountId: f.accountId === 'all' ? undefined : f.accountId, categoryId: f.categoryId === 'all' ? undefined : f.categoryId, search: f.search, from, to },
      labelOf,
    ),
  );
}

export interface PeriodTotals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

/**
 * Revenus et dépenses de la liste, PAR DEVISE (jamais additionnées entre devises).
 * Argent disponible v2 (§10.2) : par NATURE, comme le rapport de la même période —
 * un emprunt, une cagnotte, un remboursement ne sont pas des revenus, le capital
 * remboursé pas une dépense ; un transfert n'est ni l'un ni l'autre.
 */
export function periodTotals(list: Transaction[]): Record<string, PeriodTotals> {
  const out: Record<string, PeriodTotals> = {};
  for (const t of list) {
    if (t.deleted || (t.type !== 'income' && t.type !== 'expense')) continue;
    const r = (out[t.currency] ??= { income: 0, expense: 0, net: 0, count: 0 });
    if (isRevenue(t)) r.income += t.amount;
    else r.expense += spendingAmount(t);
    r.net = r.income - r.expense;
    r.count += 1;
  }
  return out;
}

export function isFiltered(f: HistoryFilter): boolean {
  return f.type !== 'all' || f.accountId !== 'all' || f.categoryId !== 'all' || f.month !== 'all' || !!f.search.trim();
}
