/**
 * Résumé chiffré envoyé à l'IA distante (avec consentement). Minimisation :
 * montants agrégés, catégories, enveloppes et objectifs — JAMAIS de
 * bénéficiaires, notes, noms de personnes, e-mails ou numéros.
 */
import type { SpaceData } from '../types';
import type { CurrencyCode } from '../money';
import { monthKey, previousMonth, type ISODate } from '../dates';
import { envelopeStatuses } from '../budget';
import { expensesByCategory, monthFlows, savingsCapacity } from '../insights';
import { goalPlanFor } from '../goals';
import { moneyPosition } from '../balance';
import { debtTotals } from '../debts';

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
}

export function buildFinanceSummary(data: SpaceData, currency: CurrencyCode, now: ISODate, categoryName: (id: string) => string): FinanceSummary {
  const m = monthKey(now);
  const p = previousMonth(m);
  const pos = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, currency);
  return {
    currency,
    today: now,
    month: (({ income, expense }) => ({ income, expense }))(monthFlows(data.transactions, m, currency)),
    previousMonth: (({ income, expense }) => ({ income, expense }))(monthFlows(data.transactions, p, currency)),
    topCategories: Object.entries(expensesByCategory(data.transactions, m, currency))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, amount]) => ({ name: categoryName(id), amount })),
    envelopes: envelopeStatuses(data.envelopes, data.transactions, data.budgets, m, currency).map((s) => ({ name: s.envelope.name.slice(0, 40), budget: s.budget, spent: s.spent })),
    goals: data.goals
      .filter((g) => g.status === 'active' && g.currency === currency)
      .slice(0, 8)
      .map((g) => {
        const plan = goalPlanFor(g, data.goalContributions, now);
        return { name: g.name.slice(0, 60), target: g.targetAmount, saved: plan.saved, targetDate: g.targetDate ?? null, monthlyNeeded: plan.requiredMonthly };
      }),
    position: { available: pos.available, free: pos.free, savings: pos.savings },
    savingsCapacity: savingsCapacity(data.transactions, now, currency),
    debts: (({ iOwe, owedToMe }) => ({ iOwe, owedToMe }))(debtTotals(data.debts, data.debtPayments, currency)),
  };
}
