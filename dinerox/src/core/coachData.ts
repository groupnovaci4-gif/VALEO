/**
 * Données du coach — argent disponible v2 (docs/argent-disponible.md §11.1). Module PUR.
 *
 * Calcule à partir de l'espace les symboles du §11.1 (R, C, Rb, S, Ess, F, MC, CF, TE) que
 * lisent les conseils (`nextAdvice`), la règle des 10 %, le score v2, le résumé de l'assistant
 * et l'écran Analyse. R = revenus REÇUS (nature `revenu`) ; jamais le revenu déclaré.
 */
import { periodReport } from './ledger';
import { natureContext, natureOf } from './nature';
import { goalBacking, positionOf } from './position';
import { dailyAllowanceV2 } from './allowance';
import { debtStatus } from './debts';
import { envelopeStatuses } from './budget';
import { budgetTransactions, isReserve } from './reserve';
import { goalPlanFor } from './goals';
import { behaviorScoreV2, isIrregularIncome, savingsRate, type ScoreV2Id } from './coachMetrics';
import { addDays, endOfMonth, lastMonths, monthKey, type ISODate, type MonthKey } from './dates';
import type { CurrencyCode } from './money';
import type { FinancialProfile, SpaceData } from './types';

type Data = SpaceData;

/** Catégories ESSENTIELLES (par identifiant) : logement, eau et énergie, alimentation, transport, santé, scolarité. */
export const ESSENTIAL_CATEGORY_IDS: ReadonlySet<string> = new Set(['cat_housing', 'cat_food', 'cat_transport', 'cat_health', 'cat_education']);
/** Charges fixes (par identifiant), pour CF. */
const FIXED_IDS: ReadonlySet<string> = new Set(['cat_housing', 'cat_internet', 'cat_insurance', 'cat_taxes', 'cat_communication']);

export interface MonthMetrics {
  /** R : revenus reçus. */
  received: number;
  /** C : dépenses (dépense + frais + intérêts + cotisation sans tour − remboursements d'achat). */
  spent: number;
  /** Rb : capital remboursé. */
  repaid: number;
  /** S : épargne nette. */
  saved: number;
  /** Opérations saisies (hors transferts). */
  operations: number;
}

export function monthMetrics(d: Data, month: MonthKey, currency: CurrencyCode): MonthMetrics {
  const r = periodReport(d, { start: `${month}-01`, end: endOfMonth(`${month}-01`) }, currency);
  const operations = d.transactions.filter((t) => !t.deleted && t.currency === currency && t.type !== 'transfer' && monthKey(t.date) === month).length;
  return { received: r.revenus, spent: r.depenses, repaid: r.remboursements, saved: r.epargneNette, operations };
}

/** Les `n` derniers mois CLOS (jamais le mois en cours), du plus ancien au plus récent. */
export function closedMonths(today: ISODate, n: number): MonthKey[] {
  return lastMonths(n + 1, today).slice(0, n);
}

/** Mois clos qui ont au moins une opération (base des moyennes). */
function activeClosedMonths(d: Data, currency: CurrencyCode, today: ISODate, n: number): MonthKey[] {
  return closedMonths(today, n).filter((m) => d.transactions.some((t) => !t.deleted && t.currency === currency && monthKey(t.date) === m));
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/**
 * Ess : dépenses essentielles mensuelles, moyenne des mois clos (jusqu'à 3) — logement,
 * alimentation, transport, santé, scolarité, remboursements de capital et soutiens familiaux
 * RÉGULIERS (récurrence). Catégories prises par identifiant. null sans mois clos.
 */
export function essentials(d: Data, currency: CurrencyCode, today: ISODate): number | null {
  const months = activeClosedMonths(d, currency, today, 3);
  if (!months.length) return null;
  const ctx = natureContext(d);
  const per = months.map((m) => {
    let n = 0;
    for (const t of d.transactions) {
      if (t.deleted || t.currency !== currency || monthKey(t.date) !== m) continue;
      const k = natureOf(t, ctx);
      if (k === 'remboursement_capital') n += t.amount;
      else if (k === 'depense' && t.categoryId && (ESSENTIAL_CATEGORY_IDS.has(t.categoryId) || (t.categoryId === 'cat_family' && !!t.recurringId))) n += t.amount;
    }
    return n;
  });
  return avg(per);
}

/**
 * F : épargne de précaution = comptes d'épargne « urgence » ou « général » + objectif « Fonds
 * d'urgence » (adossé) + réserves. Les objectifs à date (moto, mariage) n'en font pas partie.
 */
export function precautionFund(d: Data, currency: CurrencyCode, today: ISODate): number {
  const p = positionOf(d, currency, today);
  let fund = 0;
  for (const a of d.accounts) {
    if (a.deleted || !a.isSavings || a.currency !== currency) continue;
    if (a.savingsKind === 'emergency' || a.savingsKind === 'general' || !a.savingsKind) fund += Math.max(0, p.accounts[a.id]?.free ?? 0);
  }
  const backing = goalBacking(d, currency, today);
  for (const g of d.goals) {
    if (g.deleted || g.currency !== currency) continue;
    if (g.templateId === 'emergency_fund' || isReserve(g)) fund += backing.get(g.id)?.total ?? 0;
  }
  return fund;
}

export interface CoachState {
  tracked: boolean;
  available: number;
  commitments: number;
  /** Mois clos de référence (le dernier). */
  month: MonthKey | null;
  last: MonthMetrics | null;
  /** Moyenne de R sur les mois clos (null : aucun mois clos). */
  averageReceived: number | null;
  irregular: boolean;
  essentials: number | null;
  fund: number;
  monthsCovered: number | null;
  /** Mois clos (sur les 3 derniers) où C + Rb > R. */
  overspentMonths: number;
  savingsRate: number | null;
  fixedShare: number | null;
  debtShare: number | null;
  overdue: boolean;
  goalsBehind: boolean;
}

export function coachState(d: Data, currency: CurrencyCode, today: ISODate, financial?: Pick<FinancialProfile, 'payDay' | 'incomeNature'> | null): CoachState {
  const position = positionOf(d, currency, today);
  const allowance = dailyAllowanceV2({ data: d, currency, today, payDay: financial?.payDay ?? null });
  const months = activeClosedMonths(d, currency, today, 3);
  const metrics = months.map((m) => monthMetrics(d, m, currency));
  const last = metrics.length ? metrics[metrics.length - 1] : null;
  const received6 = activeClosedMonths(d, currency, today, 6).map((m) => monthMetrics(d, m, currency).received);
  const irregular = isIrregularIncome(financial ?? null, received6);
  const ess = essentials(d, currency, today);
  const fund = precautionFund(d, currency, today);
  const averageReceived = metrics.length ? avg(metrics.map((m) => m.received)) : null;
  // Charges fixes : dépenses des catégories fixes + récurrences de dépense, en moyenne.
  const ctx = natureContext(d);
  const fixedAvg = months.length
    ? avg(
        months.map((m) =>
          d.transactions
            .filter((t) => !t.deleted && t.currency === currency && monthKey(t.date) === m && natureOf(t, ctx) === 'depense' && ((t.categoryId && FIXED_IDS.has(t.categoryId)) || !!t.recurringId))
            .reduce((n, t) => n + t.amount, 0),
        ),
      )
    : 0;
  let installments = 0;
  let overdue = false;
  for (const x of d.debts) {
    if (x.deleted || x.direction !== 'i_owe' || x.currency !== currency) continue;
    const s = debtStatus(x, d.debtPayments, today);
    if (s.settled) continue;
    installments += Math.min(x.installment ?? 0, s.remaining);
    if (s.daysToDue !== null && s.daysToDue < 0) overdue = true;
  }
  if (allowance.status !== 'needs_money' && allowance.items.some((c) => c.kind === 'tontine' && c.date < today)) overdue = true;
  const goalsBehind = d.goals.some((g) => {
    if (g.deleted || g.status !== 'active' || g.currency !== currency || isReserve(g) || g.targetAmount <= 0) return false;
    const plan = goalPlanFor(g, d.goalContributions, today);
    return !plan.reached && (plan.overdue || (plan.monthlyGap ?? 0) > 0);
  });
  return {
    tracked: position.tracked,
    available: position.available,
    commitments: allowance.status === 'needs_money' ? 0 : allowance.commitments,
    month: months.length ? months[months.length - 1] : null,
    last,
    averageReceived,
    irregular,
    essentials: ess,
    fund,
    monthsCovered: ess && ess > 0 ? fund / ess : null,
    overspentMonths: metrics.filter((m) => m.spent + m.repaid > m.received).length,
    savingsRate: last ? savingsRate(last.saved, last.received) : null,
    fixedShare: averageReceived && averageReceived > 0 ? Math.floor((fixedAvg * 100) / averageReceived) : null,
    debtShare: averageReceived && averageReceived > 0 && installments > 0 ? Math.floor((installments * 100) / averageReceived) : null,
    overdue,
    goalsBehind,
  };
}

export interface ScoreV2Result {
  month: MonthKey;
  score: number | null;
  components: { id: ScoreV2Id; weight: number; value: number; points: number }[];
}

/** Score v2 d'un mois clos (§11.5). */
export function scoreForMonth(d: Data, currency: CurrencyCode, month: MonthKey, financial?: Pick<FinancialProfile, 'incomeNature'> | null): ScoreV2Result {
  const end = endOfMonth(`${month}-01`);
  const m = monthMetrics(d, month, currency);
  // Mois clos jusqu'à `month` compris : on se place au lendemain de sa fin.
  const ess = essentials(d, currency, nextDay(end));
  const fund = precautionFund(d, currency, end);
  const received6 = closedMonths(nextDay(end), 6).map((x) => monthMetrics(d, x, currency).received).filter((v) => v > 0);
  const budgets = envelopeStatuses(d.envelopes, budgetTransactions(d.transactions, d.goalContributions), d.budgets, month, currency, d.accounts)
    .filter((s) => s.budget > 0 && !s.envelope.categoryIds.some((c) => c === 'cat_savings' || c === 'cat_investment'))
    .map((s) => ({ budget: s.budget, spent: s.spent }));
  const owed = d.debts.filter((x) => !x.deleted && x.direction === 'i_owe' && x.currency === currency && x.status === 'active');
  let installments = 0;
  let late = false;
  for (const x of owed) {
    const s = debtStatus(x, d.debtPayments, end);
    if (s.settled) continue;
    installments += Math.min(x.installment ?? 0, s.remaining);
    if (s.daysToDue !== null && s.daysToDue < 0) late = true;
  }
  const r = behaviorScoreV2({
    received: m.received,
    spent: m.spent,
    repaid: m.repaid,
    saved: m.saved,
    tracked: positionOf(d, currency, end).tracked,
    operations: m.operations,
    monthsCovered: ess && ess > 0 ? fund / ess : null,
    irregular: isIrregularIncome(financial ?? null, received6),
    budgets,
    debts: owed.length ? { late, debtShare: m.received > 0 ? Math.floor((installments * 100) / m.received) : 100 } : null,
  });
  return { month, ...r };
}

function nextDay(d: ISODate): ISODate {
  return addDays(d, 1);
}
