/**
 * Rapports : quotidien, hebdomadaire, mensuel, annuel. Argent disponible v2 (§10.1) : les
 * totaux viennent du grand livre (`periodReport`) — mêmes natures que l'historique, le
 * relevé, l'export et le coach. L'export CSV est `ledger.ts › ledgerCsv`.
 */
import type { SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { periodReport, type PeriodReport } from './ledger';
import { isRevenue, isSpending, spendingAmount, txNature, withLedgerView } from './nature';
import { savingsRate } from './coachMetrics';
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
  /** Épargne NETTE de la période (§10.1). */
  saved: number;
  /** Dont « Mis de côté › Tontine » : cotisations payées depuis un compte courant (cercle fermé, 2026-10-14). */
  savedTontine: number;
  /** Taux d'épargne en % du revenu (null si pas de revenu). */
  savingsRate: number | null;
  byCategory: CategoryShare[];
  series: SeriesPoint[];
  previous: { income: number; expense: number; net: number };
  /** Variation des dépenses vs période précédente en % (null si pas de référence). */
  expenseChange: number | null;
  incomeChange: number | null;
  transactionCount: number;
  /** Lignes du grand livre (§10.1) : remboursements, financement, corrections, remises et pertes, résultat. */
  ledger: PeriodReport;
}

function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export function buildReport(input: SpaceData, kind: PeriodKind, ref: ISODate, currency: CurrencyCode): Report {
  const data = input.transactions.some((t) => t.nature) ? input : withLedgerView(input);
  const period = periodOf(kind, ref);
  const prev = previousPeriod(period);
  const now = periodReport(data, period, currency);
  const before = periodReport(data, prev, currency);
  const cats: Record<string, number> = {};
  let savedTontine = 0;
  let count = 0;
  const savingsIds = new Set(data.accounts.filter((a) => a.isSavings && !a.deleted).map((a) => a.id));
  for (const t of data.transactions) {
    if (t.deleted || t.currency !== currency || !inPeriod(t.date, period)) continue;
    if (t.type === 'income' || t.type === 'expense') count++;
    // « Mis de côté › Tontine » : cotisations payées depuis un compte courant.
    if (txNature(t) === 'cotisation_tontine' && !savingsIds.has(t.accountId)) savedTontine += t.amount;
    if (isSpending(t)) {
      const k = t.categoryId ?? 'uncategorized';
      cats[k] = (cats[k] ?? 0) + t.amount;
    }
  }
  const byCategory = Object.entries(cats)
    .map(([categoryId, amount]) => ({ categoryId, amount, percent: now.depenses > 0 ? Math.round((amount / now.depenses) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return {
    period,
    income: now.revenus,
    expense: now.depenses,
    net: now.revenus - now.depenses,
    saved: now.epargneNette,
    savedTontine,
    savingsRate: savingsRate(now.epargneNette, now.revenus),
    byCategory,
    series: buildSeries(data.transactions, period, currency),
    previous: { income: before.revenus, expense: before.depenses, net: before.revenus - before.depenses },
    expenseChange: pctChange(now.depenses, before.depenses),
    incomeChange: pctChange(now.revenus, before.revenus),
    transactionCount: count,
    ledger: now,
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
    if (isRevenue(t)) p.income += t.amount;
    else p.expense += spendingAmount(t);
  }
  return [...points.values()];
}
