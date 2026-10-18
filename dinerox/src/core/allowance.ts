/**
 * Reste par jour v2 et reste à répartir — argent disponible v2
 * (docs/argent-disponible.md §7, §9). Module PUR (testé : tests/argent-reste-par-jour.test.ts).
 *
 *   argent jamais renseigné → carte « Votre argent disponible aujourd'hui » (`needs_money`)
 *   D − E < 0               → « Vos engagements d'ici le {date} dépassent… de {E − D} » (`deficit`)
 *   sinon                   → ⌊(D − E) / jours restants⌋ (`ok`)
 *
 * D = argent disponible (`positionOf`). E = engagements restants sur [aujourd'hui ; H] :
 * récurrences de DÉPENSE non confirmées, cotisations de tontine non payées, mensualités
 * de dettes « je dois », dépenses saisies à une date future, et pour chaque objectif ou
 * réserve max(0, mise de côté prévue pour la période − déjà versé sur la période).
 * « En retard » = échue, non confirmée, dans la période en cours ou la précédente ; plus
 * ancienne, elle est « À régulariser » (`toRegularize`), hors de E.
 *
 * Le revenu déclaré n'y entre JAMAIS, pas plus que « revenus − dépenses du mois » ;
 * les revenus attendus (salaire, cagnotte, remboursement d'un prêt) ne réduisent jamais E.
 * H (D8) = veille de la prochaine paie si le jour de paie est connu, sinon fin du mois.
 */
import { addDays, addMonths, diffDays, monthKey, type ISODate } from './dates';
import { nextPayday, payDate, payHorizon, previousCycleStart, type Horizon } from './payPeriod';
import { firstSpendingAccountId } from './position';
import { computeGoalPlan } from './goals';
import { nextDueDate, debtStatus } from './debts';
import { activeTontines, countedByRecurring, scheduleState } from './tontine';
import { occurrencesBetween } from './recurring';
import { occurrenceConfirmed } from './recurringConfirm';
import { positionOf } from './position';
import { envelopeStatuses } from './budget';
import { budgetTransactions } from './reserve';
import type { CurrencyCode } from './money';
import type { GoalContribution, SpaceData, SpaceKind, Transaction } from './types';

export { payHorizon, type Horizon } from './payPeriod';

export type CommitmentKind = 'recurring' | 'tontine' | 'debt' | 'future' | 'goal';

export interface Commitment {
  kind: CommitmentKind;
  /** Règle, tontine, dette, opération ou objectif concerné. */
  id: string;
  date: ISODate;
  amount: number;
  /** Catégorie (reste à répartir : un engagement d'une enveloppe n'est pas compté deux fois). */
  categoryId: string | null;
}

type AllowanceData = Pick<SpaceData, 'accounts' | 'transactions' | 'recurring' | 'goals' | 'goalContributions'> &
  Partial<Pick<SpaceData, 'tontines' | 'tontineEntries' | 'debts' | 'debtPayments' | 'envelopes' | 'budgets' | 'assets'>>;

/** Échéances de récurrences de DÉPENSE non confirmées entre deux dates. */
function unconfirmedRecurring(d: AllowanceData, currency: CurrencyCode, from: ISODate, to: ISODate, txIds: Set<string>): Commitment[] {
  const out: Commitment[] = [];
  for (const r of d.recurring) {
    if (r.deleted || !r.active || r.type !== 'expense' || r.currency !== currency || to < from) continue;
    for (const date of occurrencesBetween(r, from, to)) {
      if (!occurrenceConfirmed(r, date, txIds)) out.push({ kind: 'recurring', id: r.id, date, amount: r.amount, categoryId: r.categoryId ?? null });
    }
  }
  return out;
}

/** Cotisations de tontine non payées entre deux dates (une récurrence convertie la compte déjà, D7). */
function unpaidTontines(d: AllowanceData, currency: CurrencyCode, today: ISODate, from: ISODate, to: ISODate): Commitment[] {
  const out: Commitment[] = [];
  for (const t of activeTontines(d.tontines ?? [], currency)) {
    if (countedByRecurring(t, d.recurring)) continue;
    for (const s of scheduleState(t, d.tontineEntries ?? [], today, { until: to })) {
      if (s.status === 'done' || s.contribution <= 0 || s.dueDate < from || s.dueDate > to) continue;
      out.push({ kind: 'tontine', id: t.id, date: s.dueDate, amount: s.contribution, categoryId: null });
    }
  }
  return out;
}

/** Une contribution vient-elle du DISPONIBLE ? Signe compris (un retrait vers un compte courant compte en moins). */
function fromAvailable(c: Pick<GoalContribution, 'amount' | 'accountId' | 'transferId'>, txById: Map<string, Pick<Transaction, 'accountId' | 'toAccountId' | 'deleted'>>, savings: Set<string>, firstCC: string | null): number {
  if (c.transferId) {
    const t = txById.get(c.transferId);
    if (!t || t.deleted) return 0;
    const ccSide = c.amount >= 0 ? t.accountId : t.toAccountId;
    return ccSide && !savings.has(ccSide) ? c.amount : 0;
  }
  const loc = c.accountId ?? firstCC;
  return loc && !savings.has(loc) ? c.amount : 0;
}

/** Période du reste par jour : horizon, période précédente, paie attendue (§7.1, §7.2). */
export interface AllowancePeriod {
  h: Horizon;
  /** Début de la période précédente : avant, une échéance non confirmée est « À régulariser ». */
  previousStart: ISODate;
  /** Paie attendue depuis cette date et pas encore confirmée (carte « Salaire attendu : reçu ? »). */
  salaryPending: ISODate | null;
}

/**
 * Paie confirmée (§7.1) : un revenu de catégorie salaire, ou venant d'une récurrence de revenu,
 * daté au plus tôt 7 jours avant le jour de paie de la période (le salaire de la période
 * précédente, même arrivé en retard, ne la confirme jamais). Reçue en avance, avant le jour de
 * paie : la nouvelle période commence le jour de la réception (horizon jusqu'à la paie suivante).
 */
export function allowancePeriod(d: Pick<SpaceData, 'transactions' | 'recurring'>, currency: CurrencyCode, today: ISODate, payDay: number | null | undefined): AllowancePeriod {
  let h = payHorizon(today, payDay);
  if (!h.lastPayday || !payDay) return { h, previousStart: previousCycleStart(h, payDay), salaryPending: null };
  const incomeRules = new Set(d.recurring.filter((r) => !r.deleted && r.type === 'income').map((r) => r.id));
  const salaries = d.transactions
    .filter((t) => !t.deleted && t.type === 'income' && t.currency === currency && t.date <= today && (t.categoryId === 'inc_salary' || (!!t.recurringId && incomeRules.has(t.recurringId))))
    .map((t) => t.date);
  const next = nextPayday(today, payDay);
  const early = next ? salaries.filter((x) => x >= addDays(next, -7)).sort()[0] : undefined;
  if (next && early) {
    const after = payHorizon(next, payDay);
    h = { until: after.until, daysLeft: diffDays(today, after.until) + 1, cycleStart: early, lastPayday: next };
    return { h, previousStart: previousCycleStart({ cycleStart: early, lastPayday: next }, payDay), salaryPending: null };
  }
  const confirmed = salaries.some((x) => x >= addDays(h.lastPayday!, -7));
  return { h, previousStart: previousCycleStart(h, payDay), salaryPending: confirmed ? null : h.lastPayday };
}

/** Engagements restants E sur [aujourd'hui ; H] (§7.2), retards de la période en cours et de la précédente compris. */
export function commitments(d: AllowanceData, currency: CurrencyCode, today: ISODate, p: Pick<AllowancePeriod, 'h' | 'previousStart'>): Commitment[] {
  const { h } = p;
  const txIds = new Set(d.transactions.filter((t) => !t.deleted).map((t) => t.id));
  const out: Commitment[] = [...unconfirmedRecurring(d, currency, p.previousStart, h.until, txIds), ...unpaidTontines(d, currency, today, p.previousStart, h.until)];

  // Mensualités des dettes « je dois » (échéance en retard du mois comprise).
  for (const x of d.debts ?? []) {
    if (x.deleted || x.direction !== 'i_owe' || x.currency !== currency || !(x.installment && x.installment > 0)) continue;
    const st = debtStatus(x, d.debtPayments ?? [], today);
    if (st.settled) continue;
    let left = st.remaining;
    let due = nextDueDate(x, today, d.debtPayments ?? []);
    for (let i = 0; due && due <= h.until && left > 0 && i < 24; i++) {
      const amount = Math.min(x.installment, left);
      out.push({ kind: 'debt', id: x.id, date: due, amount, categoryId: 'cat_debts' });
      left -= amount;
      if (!x.dueDay) break;
      due = payDate(due, 1, x.dueDay);
    }
  }

  // Dépenses déjà saisies à une date future dans l'horizon (un compte courant paie).
  const savings = new Set(d.accounts.filter((a) => a.isSavings).map((a) => a.id));
  for (const t of d.transactions) {
    if (t.deleted || t.type !== 'expense' || t.currency !== currency || savings.has(t.accountId) || t.date <= today || t.date > h.until) continue;
    out.push({ kind: 'future', id: t.id, date: t.date, amount: t.amount, categoryId: t.categoryId ?? null });
  }

  // Objectifs et réserves : mise de côté prévue pour la période − versé NET de la période venant
  // du disponible (transfert depuis un compte courant, mise de côté sur un compte courant),
  // retraits déduits, jamais moins que 0. Une affectation d'une épargne existante ne compte pas.
  const txById = new Map(d.transactions.map((t) => [t.id, t]));
  const firstCC = firstSpendingAccountId(d.accounts, currency);
  for (const g of d.goals) {
    if (g.deleted || g.status !== 'active' || g.currency !== currency) continue;
    let savedAtStart = g.initialAmount;
    let paidInPeriod = 0;
    for (const c of d.goalContributions) {
      if (c.deleted || c.goalId !== g.id) continue;
      if (c.date < h.cycleStart) savedAtStart += c.amount;
      else if (c.date <= today) paidInPeriod += fromAvailable(c, txById, savings, firstCC);
    }
    const plan = computeGoalPlan({ targetAmount: g.targetAmount, saved: Math.max(0, savedAtStart), targetDate: g.targetDate, monthlyContribution: g.monthlyContribution, planned: g.planned }, today);
    if (plan.reached) continue;
    const planned = Math.min(plan.pace ?? plan.requiredMonthly ?? 0, plan.remaining);
    const amount = Math.max(0, planned - Math.max(0, paidInPeriod));
    if (amount > 0) out.push({ kind: 'goal', id: g.id, date: h.until, amount, categoryId: null });
  }
  return out;
}

/**
 * « À régulariser » (§7.2) : échéances non confirmées plus anciennes que la période précédente.
 * Hors de E ; trois choix à l'écran : « Payée » (date), « Je la dois encore » (elle redevient
 * un engagement), « Pas due ». Une seule année en arrière au plus.
 */
export function toRegularize(d: AllowanceData, currency: CurrencyCode, today: ISODate, payDay?: number | null): Commitment[] {
  const p = allowancePeriod(d, currency, today, payDay);
  const to = addDays(p.previousStart, -1);
  const from = addMonths(today, -12);
  const txIds = new Set(d.transactions.filter((t) => !t.deleted).map((t) => t.id));
  return [...unconfirmedRecurring(d, currency, from, to, txIds), ...unpaidTontines(d, currency, today, from, to)].sort((a, b) => a.date.localeCompare(b.date));
}

export interface AllowanceV2Base {
  until: ISODate;
  daysLeft: number;
}
export interface AllowanceV2Detail extends AllowanceV2Base {
  /** D. */
  available: number;
  /** E. */
  commitments: number;
  items: Commitment[];
  /** Paie attendue depuis cette date et pas encore confirmée : carte « Salaire attendu : reçu ? ». */
  salaryPending: ISODate | null;
}

export type AllowanceV2 = ({ status: 'needs_money' } & AllowanceV2Base) | ({ status: 'deficit'; deficit: number } & AllowanceV2Detail) | ({ status: 'ok'; perDay: number } & AllowanceV2Detail);

export function dailyAllowanceV2(input: { data: AllowanceData; currency: CurrencyCode; today: ISODate; payDay?: number | null }): AllowanceV2 {
  const { data, currency, today } = input;
  const p = allowancePeriod(data, currency, today, input.payDay);
  const { h } = p;
  const position = positionOf(data, currency, today);
  if (!position.tracked) return { status: 'needs_money', until: h.until, daysLeft: h.daysLeft };
  const items = commitments(data, currency, today, p);
  const E = items.reduce((n, c) => n + c.amount, 0);
  const D = position.available;
  const detail: AllowanceV2Detail = { until: h.until, daysLeft: h.daysLeft, available: D, commitments: E, items, salaryPending: p.salaryPending };
  if (D - E < 0) return { status: 'deficit', deficit: E - D, ...detail };
  return { status: 'ok', perDay: Math.floor((D - E) / h.daysLeft), ...detail };
}

/**
 * Reste à répartir (§9) = D − Σ enveloppes max(0, budget − dépensé) − engagements hors enveloppes.
 * Un dépassement est déjà sorti de D ; un engagement d'une catégorie d'enveloppe est déjà
 * représenté par son budget. Négatif : « Vos enveloppes dépassent votre argent disponible de X ».
 */
export function unallocated(input: { data: AllowanceData; currency: CurrencyCode; today: ISODate; payDay?: number | null }) {
  const { data, currency, today } = input;
  const p = allowancePeriod(data, currency, today, input.payDay);
  const available = positionOf(data, currency, today).available;
  const envelopes = (data.envelopes ?? []).filter((e) => !e.deleted && e.active);
  const view = budgetTransactions(data.transactions, data.goalContributions);
  const statuses = envelopeStatuses(envelopes, view, data.budgets ?? [], monthKey(today), currency, data.accounts);
  const envelopesRemaining = statuses.reduce((n, s) => n + Math.max(0, s.budget - s.spent), 0);
  const inEnvelopes = new Set(envelopes.flatMap((e) => e.categoryIds));
  const outsideCommitments = commitments(data, currency, today, p)
    .filter((c) => !c.categoryId || !inEnvelopes.has(c.categoryId))
    .reduce((n, c) => n + c.amount, 0);
  return { available, envelopesRemaining, outsideCommitments, amount: available - envelopesRemaining - outsideCommitments };
}

/**
 * Part d'une enveloppe dans le revenu DÉCLARÉ, à deux décimales (arrondi vers le bas),
 * présentée comme une information. Jamais dans un espace familial (§6.5, §9).
 */
export function shareOfDeclared(amount: number, declared: number | null | undefined, kind: SpaceKind): number | null {
  if (kind === 'family' || !declared || declared <= 0) return null;
  return Math.floor((amount * 10_000) / declared) / 100;
}
