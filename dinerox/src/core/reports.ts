/**
 * Rapports : quotidien, hebdomadaire, mensuel, annuel.
 */
import type { Account, Category, SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { flowTotals } from './balance';
import { isConsumption, isSavingExpense } from './savingsFlows';
import { addDays, inPeriod, monthKey, periodOf, previousPeriod, type ISODate, type Period, type PeriodKind } from './dates';

export interface SeriesPoint {
  /** Libellé du point : 'YYYY-MM-DD' (jour) ou 'YYYY-MM' (mois). */
  key: string;
  income: number;
  expense: number;
}

export interface CategoryShare {
  categoryId: string;
  amount: number;
  /** Part des dépenses, 0–100. */
  percent: number;
}

export interface Report {
  period: Period;
  income: number;
  expense: number;
  net: number;
  /** Épargne de la période : transferts vers des comptes d'épargne + dépenses catégorie épargne. */
  saved: number;
  /** Taux d'épargne en % du revenu (null si pas de revenu). */
  savingsRate: number | null;
  byCategory: CategoryShare[];
  series: SeriesPoint[];
  previous: { income: number; expense: number; net: number };
  /** Variation des dépenses vs période précédente en % (null si pas de référence). */
  expenseChange: number | null;
  incomeChange: number | null;
  transactionCount: number;
}

function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export function buildReport(data: SpaceData, kind: PeriodKind, ref: ISODate, currency: CurrencyCode): Report {
  const period = periodOf(kind, ref);
  const prev = previousPeriod(period);
  const totals = flowTotals(data.transactions, period, currency);
  const before = flowTotals(data.transactions, prev, currency);

  const savingsIds = new Set(data.accounts.filter((a: Account) => a.isSavings && !a.deleted).map((a) => a.id));
  let saved = 0;
  const cats: Record<string, number> = {};
  for (const t of data.transactions) {
    if (t.deleted || t.currency !== currency || !inPeriod(t.date, period)) continue;
    // Épargne NETTE : versements vers l'épargne moins retraits de l'épargne.
    if (t.type === 'transfer' && t.toAccountId && savingsIds.has(t.toAccountId) && !savingsIds.has(t.accountId)) saved += t.amount;
    if (t.type === 'transfer' && t.toAccountId && savingsIds.has(t.accountId) && !savingsIds.has(t.toAccountId)) saved -= t.amount;
    // Anciennes « dépenses » Épargne / Investissement : de l'épargne, pas de la consommation.
    if (isSavingExpense(t)) saved += t.amount;
    else if (isConsumption(t)) {
      const k = t.categoryId ?? 'uncategorized';
      cats[k] = (cats[k] ?? 0) + t.amount;
    }
  }
  const byCategory = Object.entries(cats)
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
      percent: totals.expense > 0 ? Math.round((amount / totals.expense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    period,
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
    saved,
    savingsRate: totals.income > 0 ? Math.round((saved / totals.income) * 100) : null,
    byCategory,
    series: buildSeries(data.transactions, period, currency),
    previous: { income: before.income, expense: before.expense, net: before.net },
    expenseChange: pctChange(totals.expense, before.expense),
    incomeChange: pctChange(totals.income, before.income),
    transactionCount: totals.count,
  };
}

/** Série temporelle : par jour (jour/semaine/mois) ou par mois (année). */
export function buildSeries(transactions: Transaction[], period: Period, currency: CurrencyCode): SeriesPoint[] {
  const byYear = period.kind === 'year';
  const points = new Map<string, SeriesPoint>();
  if (byYear) {
    const y = period.start.slice(0, 4);
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      points.set(k, { key: k, income: 0, expense: 0 });
    }
  } else {
    for (let d = period.start; d <= period.end; d = addDays(d, 1)) points.set(d, { key: d, income: 0, expense: 0 });
  }
  for (const t of transactions) {
    if (t.deleted || (t.type !== 'income' && t.type !== 'expense') || t.currency !== currency || !inPeriod(t.date, period)) continue;
    const p = points.get(byYear ? monthKey(t.date) : t.date);
    if (!p) continue;
    if (t.type === 'income') p.income += t.amount;
    else p.expense += t.amount;
  }
  return [...points.values()];
}

// ─── Export CSV ───────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise les formules (injection CSV dans un tableur).
  // Un nombre seul (« -5000.00 ») n'est jamais une formule : il reste un nombre pour le tableur.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Exporte des opérations au format CSV (séparateur « ; », compatible Excel
 * en français). Montants en unités MAJEURES avec point décimal.
 */
export function transactionsToCsv(
  transactions: Transaction[],
  ctx: {
    accountName: (id: string) => string;
    categoryName: (c: Category | undefined, id: string) => string;
    categories: Category[];
    decimals: (currency: string) => number;
    headers: string[];
    typeLabel: (t: Transaction['type']) => string;
  },
): string {
  const rows = [ctx.headers.map(csvCell).join(';')];
  const sorted = [...transactions].filter((t) => !t.deleted).sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    const dec = ctx.decimals(t.currency);
    // Ajustement de solde (1.8) : le type ne dit pas le sens — un ajustement à la baisse est négatif.
    const amount = ((t.type === 'adjustment' && t.direction === 'out' ? -t.amount : t.amount) / 10 ** dec).toFixed(dec);
    rows.push(
      [
        t.date,
        ctx.typeLabel(t.type),
        amount,
        t.currency,
        ctx.accountName(t.accountId),
        t.toAccountId ? ctx.accountName(t.toAccountId) : '',
        t.categoryId ? ctx.categoryName(ctx.categories.find((c) => c.id === t.categoryId), t.categoryId) : '',
        t.payee ?? '',
        t.note ?? '',
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return '﻿' + rows.join('\n');
}
