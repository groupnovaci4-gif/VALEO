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
 * « En retard » = échue depuis le début de la période en cours (dernière paie, sinon
 * début du mois) et non confirmée.
 *
 * Le revenu déclaré n'y entre JAMAIS, pas plus que « revenus − dépenses du mois » ;
 * les revenus attendus (salaire, cagnotte, remboursement d'un prêt) ne réduisent jamais E.
 * H (D8) = veille de la prochaine paie si le jour de paie est connu, sinon fin du mois.
 */
import { addDays, addMonths, diffDays, endOfMonth, monthKey, parseISODate, startOfMonth, toISODate, type ISODate } from './dates';
import { computeGoalPlan } from './goals';
import { nextDueDate, debtStatus } from './debts';
import { activeTontines, countedByRecurring, scheduleState } from './tontine';
import { occurrencesBetween } from './recurring';
import { occurrenceConfirmed } from './recurringConfirm';
import { positionOf } from './position';
import { envelopeStatuses } from './budget';
import { budgetTransactions } from './reserve';
import type { CurrencyCode } from './money';
import type { SpaceData, SpaceKind } from './types';

/** Date du jour de paie dans un mois : le jour réel vaut min(jour, dernier jour du mois). */
function payDate(ref: ISODate, monthOffset: number, payDay: number): ISODate {
  const d = parseISODate(startOfMonth(ref));
  const first = new Date(d.getFullYear(), d.getMonth() + monthOffset, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toISODate(new Date(first.getFullYear(), first.getMonth(), Math.min(Math.max(1, Math.floor(payDay)), last), 12));
}

export interface Horizon {
  /** H : dernier jour compté. */
  until: ISODate;
  /** H − aujourd'hui + 1. */
  daysLeft: number;
  /** Début de la période en cours (dernière paie, sinon 1er du mois). */
  cycleStart: ISODate;
  /** Dernière paie prévue ≤ aujourd'hui (null sans jour de paie). */
  lastPayday: ISODate | null;
}

/** Horizon du reste par jour (D8). Aucune valeur par défaut : sans jour de paie, la fin du mois. */
export function payHorizon(today: ISODate, payDay: number | null | undefined): Horizon {
  if (!payDay || payDay < 1) {
    const until = endOfMonth(today);
    return { until, daysLeft: diffDays(today, until) + 1, cycleStart: startOfMonth(today), lastPayday: null };
  }
  const thisMonth = payDate(today, 0, payDay);
  const next = thisMonth > today ? thisMonth : payDate(today, 1, payDay);
  const lastPayday = thisMonth <= today ? thisMonth : payDate(today, -1, payDay);
  const until = addDays(next, -1);
  return { until, daysLeft: diffDays(today, until) + 1, cycleStart: lastPayday, lastPayday };
}

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

/** Engagements restants E sur [aujourd'hui ; H] (§7.2), retards de la période compris. */
export function commitments(d: AllowanceData, currency: CurrencyCode, today: ISODate, h: Horizon): Commitment[] {
  const out: Commitment[] = [];
  const txIds = new Set(d.transactions.filter((t) => !t.deleted).map((t) => t.id));

  for (const r of d.recurring) {
    if (r.deleted || !r.active || r.type !== 'expense' || r.currency !== currency) continue;
    for (const date of occurrencesBetween(r, h.cycleStart, h.until)) {
      if (!occurrenceConfirmed(r, date, txIds)) out.push({ kind: 'recurring', id: r.id, date, amount: r.amount, categoryId: r.categoryId ?? null });
    }
  }

  // Cotisations de tontine dues dans l'horizon ou en retard, non payées. Une récurrence
  // convertie compte déjà la cotisation de la période (D7) : jamais deux fois.
  for (const t of activeTontines(d.tontines ?? [], currency)) {
    if (countedByRecurring(t, d.recurring)) continue;
    for (const s of scheduleState(t, d.tontineEntries ?? [], today, { until: h.until })) {
      if (s.status === 'done' || s.contribution <= 0 || s.dueDate < h.cycleStart || s.dueDate > h.until) continue;
      out.push({ kind: 'tontine', id: t.id, date: s.dueDate, amount: s.contribution, categoryId: null });
    }
  }

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

  // Objectifs et réserves : mise de côté prévue pour la période − déjà versé sur la période.
  for (const g of d.goals) {
    if (g.deleted || g.status !== 'active' || g.currency !== currency) continue;
    let savedAtStart = g.initialAmount;
    let paidInPeriod = 0;
    for (const c of d.goalContributions) {
      if (c.deleted || c.goalId !== g.id) continue;
      if (c.date < h.cycleStart) savedAtStart += c.amount;
      else if (c.date <= today && c.amount > 0) paidInPeriod += c.amount;
    }
    const plan = computeGoalPlan({ targetAmount: g.targetAmount, saved: Math.max(0, savedAtStart), targetDate: g.targetDate, monthlyContribution: g.monthlyContribution, planned: g.planned }, today);
    if (plan.reached) continue;
    const planned = Math.min(plan.pace ?? plan.requiredMonthly ?? 0, plan.remaining);
    const amount = Math.max(0, planned - paidInPeriod);
    if (amount > 0) out.push({ kind: 'goal', id: g.id, date: h.until, amount, categoryId: null });
  }
  return out;
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

/** La paie de la période a-t-elle été confirmée reçue ? (revenu de salaire, ou d'une récurrence de revenu, depuis la paie précédente). */
function salaryPendingSince(d: AllowanceData, currency: CurrencyCode, today: ISODate, h: Horizon): ISODate | null {
  if (!h.lastPayday) return null;
  const incomeRules = new Set(d.recurring.filter((r) => !r.deleted && r.type === 'income').map((r) => r.id));
  const from = addMonths(h.lastPayday, -1);
  const received = d.transactions.some(
    (t) => !t.deleted && t.type === 'income' && t.currency === currency && t.date > from && t.date <= today && (t.categoryId === 'inc_salary' || (!!t.recurringId && incomeRules.has(t.recurringId))),
  );
  return received ? null : h.lastPayday;
}

export function dailyAllowanceV2(input: { data: AllowanceData; currency: CurrencyCode; today: ISODate; payDay?: number | null }): AllowanceV2 {
  const { data, currency, today } = input;
  const h = payHorizon(today, input.payDay);
  const position = positionOf(data, currency, today);
  if (!position.tracked) return { status: 'needs_money', until: h.until, daysLeft: h.daysLeft };
  const items = commitments(data, currency, today, h);
  const E = items.reduce((n, c) => n + c.amount, 0);
  const D = position.available;
  const detail: AllowanceV2Detail = { until: h.until, daysLeft: h.daysLeft, available: D, commitments: E, items, salaryPending: salaryPendingSince(data, currency, today, h) };
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
  const h = payHorizon(today, input.payDay);
  const available = positionOf(data, currency, today).available;
  const envelopes = (data.envelopes ?? []).filter((e) => !e.deleted && e.active);
  const view = budgetTransactions(data.transactions, data.goalContributions);
  const statuses = envelopeStatuses(envelopes, view, data.budgets ?? [], monthKey(today), currency, data.accounts);
  const envelopesRemaining = statuses.reduce((n, s) => n + Math.max(0, s.budget - s.spent), 0);
  const inEnvelopes = new Set(envelopes.flatMap((e) => e.categoryIds));
  const outsideCommitments = commitments(data, currency, today, h)
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
