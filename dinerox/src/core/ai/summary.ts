/**
 * Résumé chiffré envoyé à l'IA distante (avec consentement). Minimisation :
 * montants agrégés, catégories, enveloppes et objectifs — JAMAIS de
 * bénéficiaires, notes, noms de personnes, e-mails ou numéros.
 * Réserves et moments forts : un libellé GÉNÉRIQUE remplace le nom saisi
 * (« Funérailles de… », « Dot de… » pourraient nommer une personne).
 * Argent disponible v2 (§11.6) : le résumé transmet D, E, R, C, Rb, S et les indicateurs
 * DÉJÀ calculés (`coachState`) ; l'assistant reformule, il ne recalcule pas. Le pays réel
 * de la personne est transmis (le texte système ne dit plus « Afrique francophone » pour tous).
 */
import type { SpaceData } from '../types';
import type { CurrencyCode } from '../money';
import { monthKey, previousMonth, type ISODate } from '../dates';
import { envelopeStatuses } from '../budget';
import { expensesByCategory, monthFlows } from '../insights';
import { observedCapacity } from '../intelligence';
import { goalPlanFor } from '../goals';
import { moneyPosition } from '../balance';
import { coachState, monthMetrics } from '../coachData';
import { ensureLedgerView } from '../nature';
import { tenPercent } from '../coachMetrics';
import { debtTotals } from '../debts';
import { budgetTransactions, isReserve, isSeason } from '../reserve';

export interface FinanceSummary {
  currency: CurrencyCode;
  today: ISODate;
  month: { income: number; expense: number };
  previousMonth: { income: number; expense: number };
  topCategories: { name: string; amount: number }[];
  envelopes: { name: string; budget: number; spent: number }[];
  goals: { name: string; target: number; saved: number; targetDate: string | null; monthlyNeeded: number | null }[];
  position: { available: number; free: number; savings: number };
  savingsCapacity: number | null;
  debts: { iOwe: number; owedToMe: number };
  /** Pays de la personne (code ISO), pour le texte système. */
  country: string | null;
  /** D : argent disponible ; E : engagements restants. */
  available: number;
  commitments: number;
  /** R, C, Rb, S du mois (revenus REÇUS, jamais le déclaré). */
  received: number;
  spent: number;
  repaid: number;
  saved: number;
  /** Indicateurs déjà calculés (§11). */
  indicators: { monthsCovered: number | null; savingsRate: number | null; fixedShare: number | null; debtShare: number | null; tenPercent: number | null; tenPercentFeasible: number | null };
}

export function buildFinanceSummary(
  data: SpaceData,
  currency: CurrencyCode,
  now: ISODate,
  categoryName: (id: string) => string,
  labels: { reserve: string; season: string; country?: string | null } = { reserve: 'Réserve famille', season: 'Moment fort' },
): FinanceSummary {
  data = ensureLedgerView(data);
  const m = monthKey(now);
  const state = coachState(data, currency, now);
  const mm = monthMetrics(data, m, currency);
  const ten = tenPercent({ received: mm.received, available: state.available, commitments: state.commitments, saved: Math.max(0, mm.saved) });
  const p = previousMonth(m);
  const pos = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, currency);
  return {
    currency,
    today: now,
    month: (({ income, expense }) => ({ income, expense }))(monthFlows(data.transactions, m, currency)),
    previousMonth: (({ income, expense }) => ({ income, expense }))(monthFlows(data.transactions, p, currency)),
    topCategories: Object.entries(expensesByCategory(data.transactions, m, currency))
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, amount]) => ({ name: categoryName(id), amount })),
    envelopes: envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, m, currency, data.accounts).map((s) => ({ name: s.envelope.name.slice(0, 40), budget: s.budget, spent: s.spent })),
    goals: data.goals
      .filter((g) => g.status === 'active' && g.currency === currency)
      .slice(0, 8)
      .map((g) => {
        const plan = goalPlanFor(g, data.goalContributions, now);
        const name = isReserve(g) ? labels.reserve : isSeason(g) ? labels.season : g.name.slice(0, 60);
        return { name, target: g.targetAmount, saved: plan.saved, targetDate: g.targetDate ?? null, monthlyNeeded: plan.requiredMonthly };
      }),
    position: { available: pos.available, free: pos.free, savings: pos.savings },
    savingsCapacity: observedCapacity(data, currency, now),
    debts: (({ iOwe, owedToMe }) => ({ iOwe, owedToMe }))(debtTotals(data.debts, data.debtPayments, currency)),
    country: labels.country ?? null,
    available: state.available,
    commitments: state.commitments,
    received: mm.received,
    spent: mm.spent,
    repaid: mm.repaid,
    saved: mm.saved,
    indicators: {
      monthsCovered: state.monthsCovered === null ? null : Math.floor(state.monthsCovered * 10) / 10,
      savingsRate: state.savingsRate,
      fixedShare: state.fixedShare,
      debtShare: state.debtShare,
      tenPercent: ten.advice,
      tenPercentFeasible: ten.feasible,
    },
  };
}
