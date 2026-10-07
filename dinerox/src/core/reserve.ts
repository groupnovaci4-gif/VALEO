/**
 * Réserve famille et cérémonies — module PUR.
 *
 * Une réserve est un objectif SANS date de fin et rechargeable
 * (`Goal.kind === 'reserve'`) :
 *   solde = montant initial + apports − utilisations − retraits (`goalSaved`)
 *   plafond cible = `targetAmount` ; mise de côté mensuelle = `monthlyContribution`.
 * Une UTILISATION est une contribution négative liée à la dépense qu'elle
 * finance (`linkedTransactionId`) : elle ne dépasse jamais le solde ; le reste
 * (complément) est pris sur le budget du mois — montré, jamais bloqué.
 * Aucun chiffre inventé : l'aide au plafond ne part que des opérations
 * enregistrées, sinon elle pose une question.
 */
import type { Goal, GoalContribution, GoalKind, SpaceData, Transaction } from './types';
import type { CurrencyCode } from './money';
import { addMonths, lastMonths, monthKey, type ISODate, type MonthKey } from './dates';
import { goalSaved } from './balance';

/** Catégories pour lesquelles la réserve est proposée (sous-catégories comprises). */
export const RESERVE_CATEGORY_IDS: readonly string[] = ['cat_family', 'cat_social'];
/** Catégorie d'objectif des moments forts de l'année (phase 4). */
export const SEASON_GOAL_CATEGORY = 'seasons';
/** Seuil « réserve basse » : solde sous 25 % du plafond. */
export const RESERVE_LOW_RATIO = 0.25;

type KindOf = Pick<Goal, 'kind'>;

export function goalKind(g: KindOf): GoalKind {
  return g.kind === 'reserve' ? 'reserve' : 'goal';
}

export function isReserve(g: KindOf): boolean {
  return goalKind(g) === 'reserve';
}

export function isSeason(g: KindOf & Pick<Goal, 'categoryId'>): boolean {
  return goalKind(g) === 'goal' && g.categoryId === SEASON_GOAL_CATEGORY;
}

/** Objectif « classique » : seul compté dans la limite d'objectifs de la formule. */
export function isClassicGoal(g: KindOf & Pick<Goal, 'categoryId'>): boolean {
  return !isReserve(g) && !isSeason(g);
}

/** La réserve peut-elle financer une dépense de cette catégorie ? */
export function reserveEligible(categoryId: string | null | undefined): boolean {
  return !!categoryId && RESERVE_CATEGORY_IDS.includes(categoryId);
}

/** Réserves utilisables (actives, non supprimées), dans la devise donnée. */
export function activeReserves(goals: Goal[], currency?: CurrencyCode): Goal[] {
  return goals.filter((g) => !g.deleted && isReserve(g) && g.status === 'active' && (!currency || g.currency === currency));
}

export function reserveBalance(g: Goal, contributions: GoalContribution[]): number {
  return goalSaved(g, contributions);
}

/** Répartition d'une dépense : part prise sur la réserve (≤ solde) et complément. */
export function splitReserveUse(amount: number, balance: number): { fromReserve: number; complement: number } {
  const fromReserve = Math.max(0, Math.min(amount, balance));
  return { fromReserve, complement: Math.max(0, amount - fromReserve) };
}

/** Utilisation liée à une opération (au plus une). */
export function reserveUseOf(transactionId: string, contributions: GoalContribution[]): GoalContribution | undefined {
  return contributions.find((c) => !c.deleted && c.linkedTransactionId === transactionId);
}

export interface ReserveState {
  balance: number;
  target: number;
  /** 0–100, borné ; 0 si aucun plafond. */
  percent: number;
  full: boolean;
  /** Solde sous 25 % du plafond. */
  low: boolean;
  monthly: number;
}

export function reserveState(g: Goal, contributions: GoalContribution[]): ReserveState {
  const balance = reserveBalance(g, contributions);
  const target = Math.max(0, g.targetAmount);
  const full = target > 0 && balance >= target;
  return {
    balance,
    target,
    percent: target > 0 ? (full ? 100 : Math.min(99, Math.round((balance / target) * 100))) : 0,
    full,
    low: target > 0 && balance < target * RESERVE_LOW_RATIO,
    monthly: Math.max(0, g.monthlyContribution ?? 0),
  };
}

/** Apports (positifs) du mois, utilisations et retraits exclus. */
export function contributedInMonth(goalId: string, contributions: GoalContribution[], month: MonthKey): number {
  return contributions.filter((c) => !c.deleted && c.goalId === goalId && c.amount > 0 && monthKey(c.date) === month).reduce((n, c) => n + c.amount, 0);
}

/** Montant proposé par le rappel « Mettre X de côté » : reste de la mise de côté du mois, sans dépasser le plafond. */
export function refillAmount(g: Goal, contributions: GoalContribution[], today: ISODate): number {
  const s = reserveState(g, contributions);
  if (!s.monthly || s.full) return 0;
  const left = s.monthly - contributedInMonth(g.id, contributions, monthKey(today));
  return Math.max(0, Math.min(left, s.target > 0 ? s.target - s.balance : left));
}

/**
 * Date du rappel mensuel « Mettre X de côté » : le lendemain du jour de paie
 * (au plus le 28), ce mois-ci s'il n'est pas passé et qu'il reste quelque
 * chose à mettre de côté, sinon le mois suivant ; sans jour de paie connu, le
 * 1er du mois suivant.
 */
export function refillReminderDate(input: { payDay: number | null | undefined; today: ISODate; pendingThisMonth: number }): ISODate {
  const { today } = input;
  const day = input.payDay ? Math.min(28, Math.max(1, input.payDay) + 1) : 1;
  const thisMonth = `${today.slice(0, 7)}-${String(day).padStart(2, '0')}`;
  if (input.payDay && thisMonth > today && input.pendingThisMonth > 0) return thisMonth;
  return addMonths(thisMonth, 1);
}

export type ReserveMove = { contribution: GoalContribution; type: 'deposit' | 'use' | 'withdraw' };

/** Historique (plus récent d'abord) : apports, utilisations (liées à une dépense) et retraits. */
export function reserveHistory(goalId: string, contributions: GoalContribution[]): ReserveMove[] {
  return contributions
    .filter((c) => !c.deleted && c.goalId === goalId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .map((c) => ({ contribution: c, type: c.amount > 0 ? 'deposit' : c.linkedTransactionId ? 'use' : 'withdraw' }));
}

export type CeilingHelp =
  | { kind: 'history'; months: number; total: number; monthly: number }
  /** Pas assez d'historique : on demande, on n'invente rien. */
  | { kind: 'ask' };

/** Nombre minimal de mois d'historique pour proposer un chiffre. */
export const CEILING_MIN_MONTHS = 3;

/**
 * Aide au réglage du plafond : dépenses famille et cérémonies des 12 derniers
 * mois COMPLETS (au plus), si l'historique couvre au moins 3 mois. La moyenne
 * mensuelle est calculée sur les mois réellement couverts par l'historique.
 */
export function ceilingHelp(data: Pick<SpaceData, 'transactions'>, currency: CurrencyCode, today: ISODate): CeilingHelp {
  const window = lastMonths(13, today).slice(0, 12);
  const inWindow = (t: Transaction) => !t.deleted && t.currency === currency && window.includes(monthKey(t.date));
  const tx = data.transactions.filter(inWindow);
  if (!tx.length) return { kind: 'ask' };
  const first = tx.reduce((m, t) => (monthKey(t.date) < m ? monthKey(t.date) : m), window[window.length - 1]);
  const months = window.length - window.indexOf(first);
  const total = tx.filter((t) => t.type === 'expense' && reserveEligible(t.categoryId)).reduce((n, t) => n + t.amount, 0);
  if (months < CEILING_MIN_MONTHS || total <= 0) return { kind: 'ask' };
  return { kind: 'history', months, total, monthly: Math.round(total / months) };
}

/** Rappels « Mettre X de côté » à programmer : une date par réserve active ayant une mise de côté mensuelle. */
export function reserveReminders(data: Pick<SpaceData, 'goals' | 'goalContributions'>, input: { payDay: number | null | undefined; today: ISODate }): { reserveId: string; date: ISODate }[] {
  return activeReserves(data.goals)
    .filter((g) => (g.monthlyContribution ?? 0) > 0)
    .map((g) => ({ reserveId: g.id, date: refillReminderDate({ payDay: input.payDay, today: input.today, pendingThisMonth: refillAmount(g, data.goalContributions, input.today) }) }));
}
