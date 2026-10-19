/**
 * Réponses de l'assistant calculées UNIQUEMENT à partir des données réelles.
 * Chaque réponse est une clé i18n + des paramètres (montants en unités
 * mineures) : l'assistant ne peut pas inventer un chiffre.
 */
import type { SpaceData } from '../types';
import type { CurrencyCode } from '../money';
import type { ParsedIntent } from './parser';
import { endOfMonth, monthKey, previousMonth, type ISODate } from '../dates';
import { moneyPosition } from '../balance';
import { budgetSummary, envelopeStatuses, resolveEnvelopeId } from '../budget';
import { financialSnapshot, observedCapacity } from '../intelligence';
import { coachState } from '../coachData';
import { ensureLedgerView } from '../nature';
import { expensesByCategory } from '../insights';
import { monthSummary } from '../monthSummary';
import { periodReport } from '../ledger';
import { goalPlanFor, sortGoals } from '../goals';
import { budgetTransactions, isReserve } from '../reserve';

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
  const { currency, now, categoryName } = ctx;
  const data = ensureLedgerView(ctx.data);
  const month = monthKey(now);
  const prev = previousMonth(month);
  // Audit I1, I2 : le mois jusqu'à aujourd'hui, avec le calcul des rapports (clôtures de tontine comprises).
  const ms = monthSummary(data, currency, now);
  const flows = { income: ms.income, expense: ms.expense, net: ms.income - ms.expense };
  const byCat = (m: string) => expensesByCategory(data.transactions, m, currency, m === month ? now : undefined);
  /** Catégories réellement dépensées (la ligne des remboursements, négative, n'est jamais « la plus chère »). */
  const ranked = (m: string) => Object.entries(byCat(m)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const hasData = data.transactions.some((t) => !t.deleted) || data.tontineEntries.some((e) => !e.deleted);
  if (!hasData) return { key: 'ai.a.noData', lowData: true };

  switch (intent.topic) {
    // Hypothèse de contribution : le simulateur (core/simulator) donne les chiffres.
    case 'contribution_sim':
      return { key: 'ai.a.contributionSim', params: { amount: intent.amount ?? 0 } };
    case 'spent_month':
      return { key: 'ai.a.spentMonth', params: { amount: flows.expense, income: flows.income } };

    case 'income_month':
      return { key: 'ai.a.incomeMonth', params: { amount: flows.income } };

    case 'spent_category': {
      const id = intent.categoryId!;
      const cur = byCat(month)[id] ?? 0;
      const before = byCat(prev)[id] ?? 0;
      return { key: 'ai.a.spentCategory', params: { name: categoryName(id), amount: cur, before } };
    }

    case 'remaining_category': {
      const statuses = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency, data.accounts);
      const envId = resolveEnvelopeId({ categoryId: intent.categoryId, envelopeId: null }, data.envelopes);
      const s = statuses.find((x) => x.envelope.id === envId);
      if (!s) return { key: 'ai.a.noEnvelopeForCategory', params: { name: categoryName(intent.categoryId!) } };
      return s.remaining >= 0
        ? { key: 'ai.a.remainingEnvelope', params: { name: s.envelope.name, remaining: s.remaining, budget: s.budget, percent: s.percent } }
        : { key: 'ai.a.overEnvelope', params: { name: s.envelope.name, over: -s.remaining, budget: s.budget } };
    }

    case 'top_category': {
      const cats = ranked(month);
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
      // Argent disponible v2 (§11.3) : comparé à D − E — loyer, cotisations, mensualités et mises
      // de côté prévues d'ici la prochaine paie (ou la fin du mois) sont déjà engagés.
      const committed = coachState(data, currency, now).commitments;
      const amount = intent.amount; // converti en unités mineures par l'appelant (toMinor)
      const afterPurchase = pos.free - amount;
      const capacity = observedCapacity(data, currency, now);
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
      // Objectifs de la devise de l'espace uniquement (jamais d'addition de devises).
      const goals = sortGoals(data.goals.filter((g) => !g.deleted && !isReserve(g) && g.status === 'active' && g.targetAmount > 0 && g.currency === currency));
      if (!goals.length) return { key: 'ai.a.noGoals' };
      const capacity = observedCapacity(data, currency, now);
      // Effort total calculé sur TOUS les objectifs ; seul le détail affiché est limité à 4.
      const needed = goals.reduce((n, g) => n + (goalPlanFor(g, data.goalContributions, now).requiredMonthly ?? 0), 0);
      const bullets: AnswerLine[] = goals.slice(0, 4).map((g): AnswerLine => {
        const plan = goalPlanFor(g, data.goalContributions, now);
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
      const b = periodReport(data, { start: `${prev}-01`, end: endOfMonth(`${prev}-01`) }, currency);
      const before = { income: b.revenus, expense: b.depenses };
      const pct = before.expense > 0 ? Math.round(((flows.expense - before.expense) / before.expense) * 100) : null;
      return {
        key: pct === null ? 'ai.a.compareNoRef' : 'ai.a.compare',
        params: { expense: flows.expense, before: before.expense, income: flows.income, incomeBefore: before.income, percent: pct ?? 0 },
      };
    }

    case 'month_summary': {
      const statuses = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency, data.accounts);
      const summary = budgetSummary(statuses, flows.expense);
      const top = ranked(month)[0];
      const over = statuses.filter((s) => s.level === 'critical');
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
      const statuses = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency, data.accounts);
      const cats = ranked(month);
      const last = byCat(prev);
      const bullets: AnswerLine[] = [];
      for (const s of statuses.filter((x) => x.level === 'critical' || x.level === 'reached').slice(0, 2)) {
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
      const capacity = observedCapacity(data, currency, now);
      const statuses = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency, data.accounts);
      const bullets: AnswerLine[] = [];
      if (capacity !== null && capacity <= 0) bullets.push({ key: 'ai.a.whyNegative', params: { amount: -capacity } });
      const cats = ranked(month);
      if (cats[0] && flows.expense > 0) {
        bullets.push({ key: 'ai.a.whyTop', params: { name: categoryName(cats[0][0]), percent: Math.round((cats[0][1] / flows.expense) * 100) } });
      }
      // Moteur d'intelligence : poids des charges fixes, des dettes et de la famille.
      const snap = financialSnapshot({ data, currency, now, available: 0 });
      if (snap.fixedRatio !== null && snap.fixedRatio >= 50) bullets.push({ key: 'ai.a.whyFixed', params: { percent: snap.fixedRatio } });
      if (snap.debtRatio !== null && snap.debtRatio >= 35) bullets.push({ key: 'ai.a.whyDebt', params: { percent: snap.debtRatio } });
      if (snap.familyShare !== null && snap.familyShare >= 20) bullets.push({ key: 'ai.a.whyFamily', params: { percent: snap.familyShare } });
      const overCount = statuses.filter((s) => s.level === 'critical').length;
      if (overCount) bullets.push({ key: 'ai.a.whyOver', params: { count: overCount } });
      const hasSavingsEnvelope = statuses.some((s) => s.envelope.categoryIds.includes('cat_savings') && s.budget > 0);
      if (!hasSavingsEnvelope) bullets.push({ key: 'ai.a.whyNoEnvelope' });
      bullets.push({ key: 'ai.a.whyTip' });
      return { key: 'ai.a.why', params: { capacity: capacity ?? 0 }, bullets };
    }
  }
}
