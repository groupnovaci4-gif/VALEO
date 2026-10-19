/**
 * Réponses calculées sur le téléphone pour TOUTES les rubriques (docs/ia-comprend-tout.md §2.1,
 * §2.3). Module PUR : chaque réponse est une clé i18n + des paramètres (montants en unités
 * mineures, dates ISO) venant des calculs existants de `src/core`. L'IA ne calcule jamais un
 * chiffre ; un élément introuvable n'est jamais remplacé par un autre.
 *
 * Droits : `topicGate` applique `can()` (rôle) et `hasFeature()` (formule) — une rubrique fermée
 * reste fermée. Les sujets d'analyse avancée gardent leur formule (aucune nouvelle limite).
 */
import { answerQuestion, type Answer as LegacyAnswer, type AnswerLine } from './answers';
import type { QuestionIntent, Topic } from './intent';
import type { SectionId } from './sections';
import { positionOf } from '../position';
import { dailyAllowanceV2, unallocated } from '../allowance';
import { envelopeStatuses } from '../budget';
import { budgetTransactions, reserveState } from '../reserve';
import { goalPlanFor } from '../goals';
import { seasonPlanFor } from '../seasons';
import { myContribution, nextContribution, nextPayout, scheduleState } from '../tontine';
import { debtStatus, debtTotals } from '../debts';
import { upcomingOccurrence } from '../recurring';
import { recurringToConfirm } from '../recurringConfirm';
import { familyObligations, obligationTotals, yearlyAmount } from '../obligations';
import { financialCalendar } from '../calendar';
import { netWorth } from '../networth';
import { periodReport } from '../ledger';
import { tenPercent } from '../coachMetrics';
import { closedMonths, scoreForMonth } from '../coachData';
import { financialSnapshot } from '../intelligence';
import { ensureLedgerView, isSpending, spendingAmount } from '../nature';
import { monthFlows } from '../insights';
import { endOfMonth, monthKey, periodOf, previousMonth, type ISODate } from '../dates';
import { nextPayday } from '../payPeriod';
import { can } from '../permissions';
import { hasFeature, type Feature } from '../subscription';
import type { CurrencyCode } from '../money';
import type { FinancialProfile, PlanId, Role, SpaceData, SpaceKind } from '../types';

export interface Answer extends LegacyAnswer {
  /** Écran à ouvrir pour en savoir plus (« Voir »). */
  link?: SectionId | null;
}

export interface AnswerCtx {
  data: SpaceData;
  currency: CurrencyCode;
  now: ISODate;
  categoryName: (id: string) => string;
  payDay?: number | null;
  financial?: Pick<FinancialProfile, 'incomeNature'> | null;
  /** Récompenses obtenues (mémoire du coach, sur l'appareil). */
  rewardsCount?: number;
  spaceKind: SpaceKind;
}

/** Sujets d'analyse réservés à la formule qui inclut l'assistant (inchangé depuis la 1.9). */
const ASSISTANT_TOPICS = new Set<Topic>(['top_category', 'compare_months', 'month_summary', 'can_afford', 'goal_feasibility', 'reduce_spending', 'why_no_savings']);

/** Droits nécessaires par sujet : lecture d'une collection (rôle) et fonction de la formule. */
const GATES: Partial<Record<Topic, { can?: Parameters<typeof can>[2]; feature?: Feature }>> = {
  net_worth: { can: 'assets', feature: 'net_worth' },
  asset_value: { can: 'assets', feature: 'net_worth' },
  debts_owe: { can: 'debts' },
  debts_owed: { can: 'debts' },
  debt_with: { can: 'debts' },
  debt_next_due: { can: 'debts' },
  tontine_next: { can: 'tontines' },
  tontine_amount: { can: 'tontines' },
  tontine_turn: { can: 'tontines' },
  tontine_paid: { can: 'tontines' },
  tontine_late: { can: 'tontines' },
  recurring_amount: { can: 'recurring' },
  support_year: { can: 'recurring' },
  recurring_next: { can: 'recurring' },
  next_payday: { can: 'recurring' },
  due_week: { can: 'recurring' },
};

/** Chiffres masqués chez un membre enfant (audit B6) : ils dépendent d'engagements qu'il ne voit pas. */
const CHILD_HIDDEN = new Set<Topic>(['per_day', 'until_payday', 'to_allocate']);

/** null : le sujet est ouvert ; sinon le message à afficher (formule ou rôle). */
export function topicGate(topic: Topic, who: { plan: PlanId; role: Role | null; spaceKind: SpaceKind }): Answer | null {
  if (ASSISTANT_TOPICS.has(topic) && !hasFeature(who.plan, 'ai_assistant')) return { key: 'ai.locked', link: 'subscription' };
  // Audit B6 (b) : un enfant ne voit ni les dettes, ni les tontines, ni les charges — le reste par
  // jour et le reste à répartir seraient faux : « Demandez à un parent ».
  if (who.role === 'child' && CHILD_HIDDEN.has(topic)) return { key: 'ia.a.childAsk' };
  const g = GATES[topic];
  if (g?.can && !can(who.role, 'read', g.can)) return { key: 'ia.a.roleLocked' };
  if (g?.feature && !hasFeature(who.plan, g.feature)) return { key: 'ai.locked', link: 'subscription' };
  return null;
}

const LEGACY = new Set<Topic>(['spent_month', 'top_category', 'compare_months', 'income_month', 'month_summary', 'can_afford', 'goal_feasibility', 'reduce_spending', 'why_no_savings', 'contribution_sim']);

function spentIn(data: SpaceData, currency: CurrencyCode, start: ISODate, end: ISODate, match: (t: SpaceData['transactions'][number]) => boolean): number {
  return data.transactions.filter((t) => !t.deleted && t.currency === currency && t.date >= start && t.date <= end && match(t)).reduce((n, t) => n + spendingAmount(t), 0);
}

/** Période d'une question, jusqu'à AUJOURD'HUI (audit I1 : une opération future n'est pas encore « dépensée »). */
function range(period: QuestionIntent['period'], now: ISODate): { start: ISODate; end: ISODate } {
  if (period === 'week') {
    const w = periodOf('week', now);
    return { start: w.start, end: w.end < now ? w.end : now };
  }
  if (period === 'year') return { start: `${now.slice(0, 4)}-01-01`, end: now };
  if (period === 'last_month') {
    const m = previousMonth(monthKey(now));
    return { start: `${m}-01`, end: endOfMonth(`${m}-01`) };
  }
  return { start: `${monthKey(now)}-01`, end: now };
}

/** Réponse à une question comprise. Les références (`ref`) viennent du vocabulaire de l'espace. */
export function answerIntent(q: QuestionIntent, ctx: AnswerCtx): Answer {
  const { currency, now } = ctx;
  const data = ensureLedgerView(ctx.data);
  const id = q.ref?.id;
  const position = () => positionOf(data, currency, now);
  const allowance = () => dailyAllowanceV2({ data, currency, today: now, payDay: ctx.payDay ?? null });
  const statuses = () => envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, monthKey(now), currency, data.accounts);

  if (LEGACY.has(q.topic)) {
    const a = answerQuestion({ kind: 'question', topic: q.topic as never, categoryId: q.categoryId ?? null, amount: q.amount ?? null }, { data, currency, now, categoryName: ctx.categoryName });
    const link: Partial<Record<Topic, SectionId>> = { spent_month: 'history', income_month: 'history', top_category: 'analysis', compare_months: 'reports', month_summary: 'reports', can_afford: 'simulate', goal_feasibility: 'goals', reduce_spending: 'budget', why_no_savings: 'analysis', contribution_sim: 'simulate' };
    return { ...a, link: link[q.topic] ?? null };
  }

  switch (q.topic) {
    // ─── Argent ─────────────────────────────────────────────
    case 'available': {
      const p = position();
      // Audit B3 : une ligne par autre devise, jamais additionnée.
      const others = Object.entries(p.otherCurrencies).map(([cur, o]): AnswerLine => ({ key: 'ia.a.availableOther', params: { available: o.available, total: o.totalAccounts, cur } }));
      return { key: 'ia.a.available', params: { available: p.available, setAside: p.setAside, total: p.totalAccounts }, ...(others.length ? { bullets: others } : {}), link: 'home' };
    }
    case 'account_balance': {
      // Audit B3 : le solde d'un compte dans SA devise (`cur` : devise du montant affiché).
      const acc = data.accounts.find((a) => a.id === id);
      const cur = acc?.currency ?? currency;
      const balance = positionOf(data, cur, now).accounts[id ?? '']?.balance ?? 0;
      return { key: 'ia.a.accountBalance', params: { name: acc?.name ?? q.ref?.label ?? '', amount: balance, cur }, link: 'accounts' };
    }
    case 'set_aside': {
      const p = position();
      return { key: 'ia.a.setAside', params: { amount: p.setAside, outside: p.outside + p.tontineReceivable }, link: 'savings' };
    }
    case 'total_accounts':
      return { key: 'ia.a.totalAccounts', params: { amount: position().totalAccounts }, link: 'accounts' };
    case 'accounts_list': {
      // Audit B3 : tous les comptes, chacun dans sa devise (la devise de l'espace d'abord).
      const live = data.accounts.filter((a) => !a.deleted && a.active).sort((a, b) => Number(a.currency !== currency) - Number(b.currency !== currency) || a.order - b.order);
      const byCur = new Map<CurrencyCode, ReturnType<typeof positionOf>>();
      const balanceOf = (a: (typeof live)[number]) => {
        if (!byCur.has(a.currency)) byCur.set(a.currency, positionOf(data, a.currency, now));
        return byCur.get(a.currency)!.accounts[a.id]?.balance ?? 0;
      };
      return { key: 'ia.a.accountsList', params: { count: live.length }, bullets: live.map((a): AnswerLine => ({ key: 'ia.a.accountLine', params: { name: a.name, amount: balanceOf(a), cur: a.currency } })), link: 'accounts' };
    }
    case 'per_day': {
      const r = allowance();
      if (r.status === 'needs_money') return { key: 'ia.a.needsMoney', link: 'home' };
      if (r.status === 'deficit') return { key: 'ia.a.perDayDeficit', params: { deficit: r.deficit, until: r.until }, link: 'home' };
      return { key: 'ia.a.perDay', params: { perDay: r.perDay, until: r.until }, link: 'home' };
    }
    case 'until_payday': {
      const r = allowance();
      if (r.status === 'needs_money') return { key: 'ia.a.needsMoney', link: 'home' };
      return { key: 'ia.a.untilPayday', params: { amount: Math.max(0, r.available - r.commitments), until: r.until, days: r.daysLeft, commitments: r.commitments }, link: 'home' };
    }

    // ─── Budget ─────────────────────────────────────────────
    case 'envelope_remaining': {
      const s = statuses().find((x) => x.envelope.id === id);
      if (!s) return { key: 'ia.a.noEnvelope', params: { name: q.ref?.label ?? '' }, link: 'budget' };
      return s.remaining >= 0
        ? { key: 'ai.a.remainingEnvelope', params: { name: s.envelope.name, remaining: s.remaining, budget: s.budget, percent: s.percent }, link: 'budget' }
        : { key: 'ai.a.overEnvelope', params: { name: s.envelope.name, over: -s.remaining, budget: s.budget }, link: 'budget' };
    }
    case 'envelopes_over': {
      const over = statuses().filter((s) => s.remaining < 0);
      if (!over.length) return { key: 'ia.a.envelopesNoneOver', link: 'budget' };
      return { key: 'ia.a.envelopesOver', params: { count: over.length }, bullets: over.map((s) => ({ key: 'ai.a.sumOver', params: { name: s.envelope.name, over: -s.remaining } })), link: 'budget' };
    }
    case 'to_allocate': {
      const u = unallocated({ data, currency, today: now, payDay: ctx.payDay ?? null });
      return u.amount < 0 ? { key: 'budget.toAllocateOver', params: { amount: -u.amount }, link: 'budget' } : { key: 'budget.toAllocate', params: { amount: u.amount }, link: 'budget' };
    }

    // ─── Dépenses par catégorie ─────────────────────────────
    case 'spent_category': {
      const r = range(q.period, now);
      const target = q.subcategoryId ?? q.categoryId ?? '';
      const match = (t: SpaceData['transactions'][number]) => isSpending(t) && (q.subcategoryId ? t.subcategoryId === q.subcategoryId : t.categoryId === q.categoryId);
      const amount = spentIn(data, currency, r.start, r.end, match);
      // Audit C6 : la part prise sur une réserve est dite (l'enveloppe, elle, ne la compte pas — règle 19).
      const ids = new Set(data.transactions.filter((t) => !t.deleted && t.currency === currency && t.date >= r.start && t.date <= r.end && match(t)).map((t) => t.id));
      const fromReserve = data.goalContributions.filter((c) => !c.deleted && c.amount < 0 && c.linkedTransactionId && ids.has(c.linkedTransactionId)).reduce((n, c) => n - c.amount, 0);
      return { key: `ia.a.spentCat.${q.period ?? 'month'}`, params: { name: ctx.categoryName(target), amount }, ...(fromReserve > 0 ? { bullets: [{ key: 'ia.a.reservePart', params: { amount: Math.min(fromReserve, amount) } }] } : {}), link: 'history' };
    }

    // ─── Épargne ────────────────────────────────────────────
    case 'saved_month': {
      const r = periodReport(data, range('month', now), currency);
      return { key: 'ia.a.savedMonth', params: { amount: r.epargneNette }, link: 'savings' };
    }
    case 'savings_balance': {
      const p = position();
      const sav = data.accounts.filter((a) => !a.deleted && a.isSavings && a.currency === currency);
      return { key: 'ia.a.savingsBalance', params: { amount: sav.reduce((n, a) => n + (p.accounts[a.id]?.balance ?? 0), 0), count: sav.length }, link: 'savings' };
    }
    case 'ten_percent': {
      const r = periodReport(data, range('month', now), currency);
      const al = allowance();
      const t = tenPercent({ received: r.revenus, available: al.status === 'needs_money' ? 0 : al.available, commitments: al.status === 'needs_money' ? 0 : al.commitments, saved: r.epargneNette });
      if (t.advice === null) return { key: 'ia.a.tenNone', link: 'savings' };
      return { key: 'ia.a.ten', params: { advice: t.advice, feasible: t.feasible ?? 0, saved: Math.max(0, r.epargneNette), toReach: t.toReach ?? 0 }, link: 'savings' };
    }

    // ─── Objectifs, réserve, moments forts ──────────────────
    case 'goal_status':
    case 'goal_monthly':
    case 'goal_eta': {
      const g = data.goals.find((x) => x.id === id);
      if (!g) return { key: 'ia.a.noGoal', link: 'goals' };
      const plan = goalPlanFor(g, data.goalContributions, now);
      if (plan.reached) return { key: 'ai.a.goalReached', params: { name: g.name }, link: 'goals' };
      if (q.topic === 'goal_monthly') {
        return plan.requiredMonthly !== null
          ? { key: 'ia.a.goalMonthly', params: { name: g.name, monthly: plan.requiredMonthly, date: g.targetDate ?? '' }, link: 'goals' }
          : { key: 'ia.a.goalMonthlyNoDate', params: { name: g.name, remaining: plan.remaining }, link: 'goals' };
      }
      if (q.topic === 'goal_eta') {
        // Audit C3 : sans rythme régulier, la date CIBLE est dite « date visée », jamais « au rythme actuel ».
        if (plan.estimatedDate) return { key: 'ia.a.goalEta', params: { name: g.name, date: plan.estimatedDate, remaining: plan.remaining } };
        if (g.targetDate) return { key: 'ia.a.goalTargetDate', params: { name: g.name, date: g.targetDate, remaining: plan.remaining }, link: 'goals' };
        return { key: 'ai.a.goalNoPlan', params: { name: g.name, remaining: plan.remaining }, link: 'goals' };
      }
      if (!(g.targetAmount > 0)) return { key: 'ia.a.goalNoTarget', params: { name: g.name, saved: plan.saved }, link: 'goals' };
      return { key: 'ia.a.goalStatus', params: { name: g.name, saved: plan.saved, target: plan.target, percent: plan.percent }, link: 'goals' };
    }
    case 'reserve_balance': {
      const g = data.goals.find((x) => x.id === id);
      if (!g) return { key: 'ia.a.noReserve', link: 'goals' };
      const s = reserveState(g, data.goalContributions);
      return { key: 'ia.a.reserve', params: { name: g.name, balance: s.balance, target: s.target }, link: 'goals' };
    }
    case 'season_status': {
      const g = data.goals.find((x) => x.id === id);
      if (!g) return { key: 'ia.a.noGoal', link: 'seasons' };
      const p = seasonPlanFor(g, data.goalContributions, now);
      if (!g.targetDate || p.weeksLeft === null) return { key: 'ia.a.seasonNoDate', params: { name: g.name, target: g.targetAmount, saved: p.plan.saved }, link: 'seasons' };
      return { key: 'ia.a.season', params: { name: g.name, date: g.targetDate, days: p.daysLeft ?? 0, target: g.targetAmount, saved: p.plan.saved, weekly: p.weekly ?? 0 }, link: 'seasons' };
    }

    // ─── Tontines ───────────────────────────────────────────
    case 'tontine_next':
    case 'tontine_amount':
    case 'tontine_turn':
    case 'tontine_paid':
    case 'tontine_late': {
      const t = data.tontines.find((x) => x.id === id && !x.deleted);
      if (!t) return { key: 'ia.a.noTontine', link: 'tontines' };
      const states = scheduleState(t, data.tontineEntries, now);
      const base = { name: t.name };
      if (q.topic === 'tontine_amount') return { key: 'ia.a.tontineAmount', params: { ...base, amount: myContribution(t) }, link: 'tontines' };
      if (q.topic === 'tontine_paid') {
        const done = data.tontineEntries.filter((e) => !e.deleted && e.tontineId === t.id && e.kind === 'contribution' && e.status === 'done');
        return { key: 'ia.a.tontinePaid', params: { ...base, amount: done.reduce((n, e) => n + e.amount, 0), count: done.length }, link: 'tontines' };
      }
      if (q.topic === 'tontine_late') {
        const late = states.filter((s) => s.status === 'late');
        return late.length ? { key: 'ia.a.tontineLate', params: { ...base, count: late.length, amount: late.reduce((n, s) => n + s.contribution, 0) }, link: 'tontines' } : { key: 'ia.a.tontineOnTime', params: base, link: 'tontines' };
      }
      if (q.topic === 'tontine_turn') {
        const next = nextPayout(states);
        return next ? { key: 'ia.a.tontineTurn', params: { ...base, date: next.date, amount: next.payout }, link: 'tontines' } : { key: 'ia.a.tontineTurnDone', params: base, link: 'tontines' };
      }
      const next = nextContribution(states);
      if (!next) return { key: 'ia.a.tontineNoNext', params: base, link: 'tontines' };
      return { key: next.status === 'late' ? 'ia.a.tontineNextLate' : 'ia.a.tontineNext', params: { ...base, date: next.dueDate, amount: next.contribution }, link: 'tontines' };
    }

    // ─── Dettes et crédits ──────────────────────────────────
    case 'debts_owe':
      return { key: 'ia.a.debtsOwe', params: { amount: debtTotals(data.debts, data.debtPayments, currency).iOwe }, link: 'debts' };
    case 'debts_owed':
      return { key: 'ia.a.debtsOwed', params: { amount: debtTotals(data.debts, data.debtPayments, currency).owedToMe }, link: 'debts' };
    case 'debt_with':
    case 'debt_next_due': {
      const d = data.debts.find((x) => x.id === id && !x.deleted);
      if (!d) return { key: 'ia.a.noDebt', link: 'debts' };
      const s = debtStatus(d, data.debtPayments, now);
      if (q.topic === 'debt_next_due') {
        return s.nextDue && !s.settled ? { key: 'ia.a.debtNextDue', params: { name: d.counterparty, date: s.nextDue, amount: Math.min(d.installment ?? s.remaining, s.remaining) }, link: 'debts' } : { key: 'ia.a.debtNoDue', params: { name: d.counterparty, remaining: s.remaining }, link: 'debts' };
      }
      return { key: d.direction === 'i_owe' ? 'ia.a.debtOwe' : 'ia.a.debtOwed', params: { name: d.counterparty, remaining: s.settled ? 0 : s.remaining, paid: s.paid }, link: 'debts' };
    }

    // ─── Famille, obligations, échéances ───────────────────
    case 'recurring_amount': {
      const r = data.recurring.find((x) => x.id === id && !x.deleted);
      if (!r) return { key: 'ia.a.noRecurring', link: 'recurring' };
      return { key: 'ia.a.recurringAmount', params: { name: r.label, amount: Math.round(yearlyAmount(r) / 12) }, link: 'obligations' };
    }
    case 'support_year': {
      const tot = obligationTotals(familyObligations(data, currency), null);
      return { key: 'ia.a.supportYear', params: { amount: tot.yearly, monthly: tot.monthly, count: tot.count }, link: 'obligations' };
    }
    case 'recurring_next': {
      const r = data.recurring.find((x) => x.id === id && !x.deleted);
      const date = r ? upcomingOccurrence(r, now) : null;
      if (!r || !date) return { key: 'ia.a.noRecurring', link: 'recurring' };
      // Audit I8 : une échéance passée non confirmée est citée d'abord (même lecture que l'accueil).
      const late = recurringToConfirm(data, now, ctx.payDay ?? null).filter((c) => c.ruleId === r.id);
      if (late.length) {
        const more = late.length > 1 ? { bullets: [{ key: 'ia.a.recurringLateCount', params: { count: late.length } }] } : {};
        return { key: 'ia.a.recurringLate', params: { name: r.label, late: late[late.length - 1].date, date, amount: r.amount }, ...more, link: 'home' };
      }
      return { key: 'ia.a.recurringNext', params: { name: r.label, date, amount: r.amount }, link: 'calendar' };
    }
    case 'next_payday': {
      // Audit I7 : le jour de paie du PROFIL fait foi (c'est celui du reste par jour) ; si la
      // récurrence du salaire tombe un autre jour, l'écart est signalé.
      const pd = nextPayday(now, ctx.payDay ?? null);
      if (pd) {
        const income = data.recurring.filter((r) => !r.deleted && r.active && r.type === 'income' && r.currency === currency && r.frequency === 'monthly');
        const salary = income.find((r) => r.categoryId === 'inc_salary') ?? income[0];
        const day = salary ? Number(salary.startDate.slice(8, 10)) : null;
        const mismatch = salary && day !== ctx.payDay ? [{ key: 'ia.a.paydayMismatch', params: { name: salary.label, day: day as number, payDay: ctx.payDay as number } }] : [];
        return { key: 'ia.a.nextPaydayDay', params: { date: pd }, ...(mismatch.length ? { bullets: mismatch } : {}), link: 'calendar' };
      }
      const dates = data.recurring.filter((r) => !r.deleted && r.active && r.type === 'income' && r.currency === currency).map((r) => ({ r, d: upcomingOccurrence(r, now) })).filter((x): x is { r: typeof x.r; d: ISODate } => !!x.d).sort((a, b) => a.d.localeCompare(b.d));
      return dates.length ? { key: 'ia.a.nextPayday', params: { name: dates[0].r.label, date: dates[0].d, amount: dates[0].r.amount }, link: 'calendar' } : { key: 'ia.a.noPayday', link: 'calendar' };
    }
    case 'due_week': {
      const events = financialCalendar(data, now, 7).filter((e) => e.kind !== 'income' && e.kind !== 'tontine_payout' && e.currency === currency);
      if (!events.length) return { key: 'ia.a.dueWeekNone', link: 'calendar' };
      return { key: 'ia.a.dueWeek', params: { count: events.length, amount: events.reduce((n, e) => n + (e.amount ?? 0), 0) }, bullets: events.slice(0, 6).map((e) => ({ key: 'ia.a.dueLine', params: { name: e.label, date: e.date, amount: e.amount ?? 0 } })), link: 'calendar' };
    }

    // ─── Patrimoine, historique, analyse ───────────────────
    case 'net_worth': {
      const n = netWorth(data, currency, now);
      return { key: 'ia.a.netWorth', params: { net: n.net, assets: n.assets, accounts: n.accounts, outside: n.outside, receivables: n.receivables, liabilities: n.liabilities }, link: 'assets' };
    }
    case 'asset_value': {
      const a = data.assets.find((x) => x.id === id && !x.deleted);
      return a ? { key: 'ia.a.assetValue', params: { name: a.name, amount: a.value }, link: 'assets' } : { key: 'ia.a.noAsset', link: 'assets' };
    }
    case 'last_expenses': {
      const last = data.transactions.filter((t) => isSpending(t) && t.currency === currency && t.date <= now).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5);
      if (!last.length) return { key: 'ai.a.noExpenseMonth', link: 'history' };
      return { key: 'ia.a.lastExpenses', params: { count: last.length }, bullets: last.map((t) => ({ key: 'ia.a.expenseLine', params: { name: t.payee || ctx.categoryName(t.subcategoryId ?? t.categoryId ?? ''), date: t.date, amount: t.amount } })), link: 'history' };
    }
    case 'biggest_expense': {
      const r = range('month', now);
      const top = data.transactions.filter((t) => isSpending(t) && t.currency === currency && t.date >= r.start && t.date <= r.end).sort((a, b) => b.amount - a.amount)[0];
      return top ? { key: 'ia.a.biggestExpense', params: { name: top.payee || ctx.categoryName(top.subcategoryId ?? top.categoryId ?? ''), date: top.date, amount: top.amount }, link: 'history' } : { key: 'ai.a.noExpenseMonth', link: 'history' };
    }
    case 'margin':
    case 'fixed_charges': {
      const s = financialSnapshot({ data, currency, now, available: 0 });
      if (s.monthsOfData === 0) return { key: 'ia.a.analysisNoData', link: 'analysis', lowData: true };
      if (q.topic === 'margin') return { key: s.savingsCapacity.value >= 0 ? 'ia.a.margin' : 'ia.a.marginNegative', params: { amount: Math.abs(s.savingsCapacity.value) }, link: 'analysis' };
      return { key: 'ia.a.fixedCharges', params: { amount: s.fixedCharges.value, percent: s.fixedRatio ?? 0 }, link: 'analysis' };
    }
    case 'last_month_summary': {
      const r = periodReport(data, range('last_month', now), currency);
      return {
        key: 'ia.a.lastMonth',
        bullets: [
          { key: 'ai.a.sumIncome', params: { amount: r.revenus } },
          { key: 'ai.a.sumExpense', params: { amount: r.depenses } },
          { key: 'ia.a.sumSaved', params: { amount: r.epargneNette } },
        ],
        link: 'reports',
      };
    }
    case 'independence':
      // Simulation (règle 11) : présentée comme telle, sur son écran.
      return { key: 'ia.a.independence', link: 'independence' };
    case 'score': {
      const month = closedMonths(now, 1)[0];
      const s = month ? scoreForMonth(data, currency, month, ctx.financial ?? null) : null;
      return s && s.score !== null ? { key: 'ia.a.score', params: { score: s.score, month: `${s.month}-01` }, link: 'score' } : { key: 'ia.a.scoreNone', link: 'score' };
    }
    case 'rewards':
      return { key: 'ia.a.rewards', params: { count: ctx.rewardsCount ?? 0 }, link: 'rewards' };
    case 'family_spent': {
      if (ctx.spaceKind !== 'family') return { key: 'ia.a.familyNotShared', link: 'family' };
      const f = monthFlows(data.transactions, monthKey(now), currency);
      return { key: 'ia.a.familySpent', params: { amount: f.expense }, link: 'family' };
    }
    default:
      return { key: 'ai.unknown' };
  }
}
