/**
 * Réponses de l'assistant calculées UNIQUEMENT à partir des données réelles.
 * Chaque réponse est une clé i18n + des paramètres (montants en unités
 * mineures) : l'assistant ne peut pas inventer un chiffre.
 */
import type { SpaceData } from '../types';
import type { CurrencyCode } from '../money';
import type { ParsedIntent } from './parser';
import { monthKey, previousMonth, type ISODate } from '../dates';
import { moneyPosition } from '../balance';
import { budgetSummary, envelopeStatuses, resolveEnvelopeId } from '../budget';
import { expensesByCategory, monthFlows, savingsCapacity } from '../insights';
import { goalPlanFor, sortGoals } from '../goals';

export interface AnswerLine {
  key: string;
  params?: Record<string, string | number>;
}

export interface Answer extends AnswerLine {
  bullets?: AnswerLine[];
  /** La réponse repose sur trop peu de données pour conclure. */
  lowData?: boolean;
}

export interface AnswerContext {
  data: SpaceData;
  currency: CurrencyCode;
  now: ISODate;
  categoryName: (id: string) => string;
}

export function answerQuestion(intent: Extract<ParsedIntent, { kind: 'question' }>, ctx: AnswerContext): Answer {
  const { data, currency, now, categoryName } = ctx;
  const month = monthKey(now);
  const prev = previousMonth(month);
  const flows = monthFlows(data.transactions, month, currency);
  const hasData = data.transactions.some((t) => !t.deleted);
  if (!hasData) return { key: 'ai.a.noData', lowData: true };

  switch (intent.topic) {
    case 'spent_month':
      return { key: 'ai.a.spentMonth', params: { amount: flows.expense, income: flows.income } };

    case 'income_month':
      return { key: 'ai.a.incomeMonth', params: { amount: flows.income } };

    case 'spent_category': {
      const id = intent.categoryId!;
      const cur = expensesByCategory(data.transactions, month, currency)[id] ?? 0;
      const before = expensesByCategory(data.transactions, prev, currency)[id] ?? 0;
      return { key: 'ai.a.spentCategory', params: { name: categoryName(id), amount: cur, before } };
    }

    case 'remaining_category': {
      const statuses = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency);
      const envId = resolveEnvelopeId({ categoryId: intent.categoryId, envelopeId: null }, data.envelopes);
      const s = statuses.find((x) => x.envelope.id === envId);
      if (!s) return { key: 'ai.a.noEnvelopeForCategory', params: { name: categoryName(intent.categoryId!) } };
      return s.remaining >= 0
        ? { key: 'ai.a.remainingEnvelope', params: { name: s.envelope.name, remaining: s.remaining, budget: s.budget, percent: s.percent } }
        : { key: 'ai.a.overEnvelope', params: { name: s.envelope.name, over: -s.remaining, budget: s.budget } };
    }

    case 'top_category': {
      const cats = Object.entries(expensesByCategory(data.transactions, month, currency)).sort((a, b) => b[1] - a[1]);
      if (!cats.length) return { key: 'ai.a.noExpenseMonth' };
      const total = cats.reduce((s, [, v]) => s + v, 0);
      return {
        key: 'ai.a.topCategories',
        params: { total },
        bullets: cats.slice(0, 3).map(([id, v]) => ({
          key: 'ai.a.categoryShare',
          params: { name: categoryName(id), amount: v, percent: Math.round((v / total) * 100) },
        })),
      };
    }

    case 'balance': {
      const pos = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, currency);
      return {
        key: 'ai.a.balance',
        params: { available: pos.available, free: pos.free, savings: pos.savings, goals: pos.allocatedToGoals },
      };
    }

    case 'can_afford': {
      if (!intent.amount) return { key: 'ai.a.askAmount' };
      const pos = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, currency);
      const statuses = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency);
      // Ce qui reste à payer ce mois-ci selon le budget (hors « libre » non dépensé).
      const committed = statuses.reduce((s, x) => s + Math.max(0, x.remaining), 0);
      const amount = intent.amount; // converti en unités mineures par l'appelant (toMinor)
      const afterPurchase = pos.free - amount;
      const capacity = savingsCapacity(data.transactions, now, currency);
      if (afterPurchase < 0) {
        const months = capacity && capacity > 0 ? Math.ceil((amount - Math.max(0, pos.free)) / capacity) : null;
        return { key: 'ai.a.affordNo', params: { amount, free: pos.free, months: months ?? 0, hasMonths: months ? 1 : 0 } };
      }
      if (afterPurchase < committed) {
        return { key: 'ai.a.affordTight', params: { amount, free: pos.free, committed, after: afterPurchase } };
      }
      return { key: 'ai.a.affordYes', params: { amount, free: pos.free, after: afterPurchase - committed } };
    }

    case 'goal_feasibility': {
      const goals = sortGoals(data.goals.filter((g) => !g.deleted && g.status === 'active' && g.targetAmount > 0));
      if (!goals.length) return { key: 'ai.a.noGoals' };
      const capacity = savingsCapacity(data.transactions, now, currency);
      let needed = 0;
      const bullets: AnswerLine[] = goals.slice(0, 4).map((g): AnswerLine => {
        const plan = goalPlanFor(g, data.goalContributions, now);
        needed += plan.requiredMonthly ?? 0;
        if (plan.reached) return { key: 'ai.a.goalReached', params: { name: g.name } };
        if (plan.requiredMonthly !== null) return { key: 'ai.a.goalNeeds', params: { name: g.name, monthly: plan.requiredMonthly, months: plan.monthsToTarget ?? 0, remaining: plan.remaining } };
        if (plan.estimatedDate) return { key: 'ai.a.goalEta', params: { name: g.name, date: plan.estimatedDate, remaining: plan.remaining } };
        return { key: 'ai.a.goalNoPlan', params: { name: g.name, remaining: plan.remaining } };
      });
      if (capacity === null) return { key: 'ai.a.goalsNoCapacity', bullets, lowData: true };
      return {
        key: capacity >= needed ? 'ai.a.goalsOnTrack' : 'ai.a.goalsShort',
        params: { capacity, needed, gap: Math.max(0, needed - capacity) },
        bullets,
      };
    }

    case 'compare_months': {
      const before = monthFlows(data.transactions, prev, currency);
      const pct = before.expense > 0 ? Math.round(((flows.expense - before.expense) / before.expense) * 100) : null;
      return {
        key: pct === null ? 'ai.a.compareNoRef' : 'ai.a.compare',
        params: { expense: flows.expense, before: before.expense, income: flows.income, incomeBefore: before.income, percent: pct ?? 0 },
      };
    }

    case 'month_summary': {
      const statuses = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency);
      const summary = budgetSummary(statuses, flows.expense);
      const top = Object.entries(expensesByCategory(data.transactions, month, currency)).sort((a, b) => b[1] - a[1])[0];
      const over = statuses.filter((s) => s.level === 'over');
      const bullets: AnswerLine[] = [
        { key: 'ai.a.sumIncome', params: { amount: flows.income } },
        { key: 'ai.a.sumExpense', params: { amount: flows.expense } },
        { key: 'ai.a.sumNet', params: { amount: flows.net } },
      ];
      if (summary.planned > 0) bullets.push({ key: 'ai.a.sumBudget', params: { remaining: summary.remaining, planned: summary.planned } });
      if (top) bullets.push({ key: 'ai.a.sumTop', params: { name: categoryName(top[0]), amount: top[1] } });
      for (const o of over.slice(0, 2)) bullets.push({ key: 'ai.a.sumOver', params: { name: o.envelope.name, over: -o.remaining } });
      return { key: 'ai.a.summary', bullets };
    }

    case 'reduce_spending': {
      const statuses = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency);
      const cats = Object.entries(expensesByCategory(data.transactions, month, currency)).sort((a, b) => b[1] - a[1]);
      const last = expensesByCategory(data.transactions, prev, currency);
      const bullets: AnswerLine[] = [];
      for (const s of statuses.filter((x) => x.level === 'over' || x.level === 'full').slice(0, 2)) {
        bullets.push({ key: 'ai.a.reduceEnvelope', params: { name: s.envelope.name, spent: s.spent, budget: s.budget } });
      }
      for (const [id, v] of cats.slice(0, 3)) {
        const before = last[id] ?? 0;
        if (before > 0 && v > before) bullets.push({ key: 'ai.a.reduceIncrease', params: { name: categoryName(id), percent: Math.round(((v - before) / before) * 100) } });
      }
      if (cats[0]) bullets.push({ key: 'ai.a.reduceTop', params: { name: categoryName(cats[0][0]), saving: Math.round(cats[0][1] * 0.1) } });
      if (!bullets.length) return { key: 'ai.a.reduceNothing' };
      return { key: 'ai.a.reduce', bullets };
    }

    case 'why_no_savings': {
      const capacity = savingsCapacity(data.transactions, now, currency);
      const statuses = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency);
      const bullets: AnswerLine[] = [];
      if (capacity !== null && capacity <= 0) bullets.push({ key: 'ai.a.whyNegative', params: { amount: -capacity } });
      const cats = Object.entries(expensesByCategory(data.transactions, month, currency)).sort((a, b) => b[1] - a[1]);
      if (cats[0] && flows.expense > 0) {
        bullets.push({ key: 'ai.a.whyTop', params: { name: categoryName(cats[0][0]), percent: Math.round((cats[0][1] / flows.expense) * 100) } });
      }
      const overCount = statuses.filter((s) => s.level === 'over').length;
      if (overCount) bullets.push({ key: 'ai.a.whyOver', params: { count: overCount } });
      const hasSavingsEnvelope = statuses.some((s) => s.envelope.categoryIds.includes('cat_savings') && s.budget > 0);
      if (!hasSavingsEnvelope) bullets.push({ key: 'ai.a.whyNoEnvelope' });
      bullets.push({ key: 'ai.a.whyTip' });
      return { key: 'ai.a.why', params: { capacity: capacity ?? 0 }, bullets };
    }
  }
}
