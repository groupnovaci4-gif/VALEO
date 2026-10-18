/**
 * @deprecated Argent disponible v2 : les écrans lisent `core/allowance.ts › dailyAllowanceV2`
 * (UNE seule fonction). Gardé pour les anciens tests ; à retirer à l'étape 3.
 *
 * « Il vous reste X par jour jusqu'à la fin du mois » — module PUR.
 *
 *   disponible = revenus du mois ENREGISTRÉS (jamais le revenu déclaré : argent disponible v2, D1)
 *              − dépenses du mois (hors part prise sur une réserve)
 *              − récurrences de dépense restant à payer ce mois-ci
 *              − mise de côté prévue du mois (objectifs et réserves)
 *              − cotisations de tontine du mois pas encore versées
 *              − cotisations de tontine du mois payées DEPUIS LE DISPONIBLE
 *   Cercle fermé (fondateur, 2026-10-14) : une cotisation est de l'épargne, pas
 *   une dépense. Payée depuis un compte courant, elle fait baisser le reste par
 *   jour de son montant ENTIER (jamais fondue dans la mise de côté prévue) ;
 *   payée depuis l'épargne ou un objectif, elle ne le change pas (mouvement à
 *   l'intérieur du cercle). L'épargne de départ d'un compte d'épargne n'est PAS de
 *   l'épargne du mois : elle existait avant (argent disponible v2, §3.1).
 *   (une cagnotte de tontine attendue n'est JAMAIS comptée avant d'être reçue :
 *   elle devient alors un revenu enregistré)
 *   reste par jour = disponible / jours restants (aujourd'hui inclus), arrondi vers le bas.
 *
 * Mise de côté : le rythme prévu du mois est déduit TOUT le mois, qu'il soit
 * déjà versé ou non (verser ce qui était prévu ne change pas le reste par
 * jour), borné à ce qu'il restait à épargner au début du mois. Une dépense
 * prise sur une réserve ne fait pas baisser le reste par jour : l'argent avait
 * déjà été mis de côté. Seul le complément (réserve insuffisante) compte.
 *
 * Aucun chiffre inventé : sans revenu enregistré, on invite à le compléter
 * (le revenu déclaré est une information, jamais de l'argent). Un disponible négatif n'est jamais présenté « par jour ».
 * Une seule devise (celle de l'espace) : aucune conversion.
 */
import { endOfMonth, monthKey, parseISODate, type ISODate } from './dates';
import { computeGoalPlan } from './goals';
import { tontineDueThisMonth } from './tontine';
import { occurrencesBetween } from './recurring';
import type { CurrencyCode } from './money';
import type { FinancialProfile, SpaceData } from './types';
import { circlePaidFromAvailable, goalFundedIds, isSavingExpense, isSavingsDeposit, isSavingsWithdrawal, isTontineContribution, savingsAccountIds } from './savingsFlows';

export type IncomeSource = 'user' | 'declared';

interface Breakdown {
  income: number;
  incomeSource: IncomeSource;
  expenses: number;
  /** Cotisations de tontine du mois payées depuis un compte courant (déduites entières). */
  tontinePaid: number;
  /** Récurrences de dépense pas encore enregistrées d'ici la fin du mois (cotisations de tontine comprises). */
  upcomingRecurring: number;
  /** Dont : cotisations de tontine du mois pas encore versées. */
  upcomingTontines: number;
  /** Mise de côté prévue du mois (objectifs et réserves), versée ou non. */
  goalsRemaining: number;
  /** Part des dépenses du mois prise sur une réserve (déjà mise de côté : non déduite). */
  reserveCovered: number;
  /**
   * 1.8 — Épargne versée ce mois (versements vers les comptes d'épargne − retraits,
   * + anciennes « dépenses » Épargne). Cet argent n'est plus disponible : il est
   * déduit, sans double compte avec la mise de côté prévue (le plus grand des deux).
   */
  savedThisMonth: number;
  daysLeft: number;
  until: ISODate;
}

export type DailyAllowance =
  | ({ status: 'ok'; available: number; perDay: number } & Breakdown)
  | ({ status: 'deficit'; deficit: number } & Breakdown)
  | { status: 'needs_income'; daysLeft: number; until: ISODate; expenses: number; reserveCovered: number };

export interface AllowanceInput {
  data: Pick<SpaceData, 'transactions' | 'recurring' | 'goals' | 'goalContributions'> & Partial<Pick<SpaceData, 'tontines' | 'tontineEntries' | 'accounts'>>;
  currency: CurrencyCode;
  today: ISODate;
  financial?: Pick<FinancialProfile, 'monthlyIncome'> | null;
}

export function dailyAllowance({ data, currency, today, financial }: AllowanceInput): DailyAllowance {
  const month = monthKey(today);
  const until = endOfMonth(today);
  const daysLeft = parseISODate(until).getDate() - parseISODate(today).getDate() + 1;

  // Part de chaque dépense financée par une réserve (utilisation liée).
  const covered = new Map<string, number>();
  for (const c of data.goalContributions) {
    if (c.deleted || !c.linkedTransactionId || c.amount >= 0) continue;
    covered.set(c.linkedTransactionId, (covered.get(c.linkedTransactionId) ?? 0) - c.amount);
  }

  let recordedIncome = 0;
  let expenses = 0;
  let reserveCovered = 0;
  let savedThisMonth = 0;
  let tontinePaid = 0;
  const savings = savingsAccountIds(data.accounts ?? []);
  const goalFunded = goalFundedIds(data.goalContributions);
  for (const t of data.transactions) {
    if (t.deleted || t.currency !== currency || monthKey(t.date) !== month) continue;
    if (t.type === 'income') recordedIncome += t.amount;
    else if (isTontineContribution(t)) {
      if (circlePaidFromAvailable(t, savings, goalFunded)) tontinePaid += t.amount;
    } else if (isSavingExpense(t)) savedThisMonth += t.amount;
    else if (isSavingsDeposit(t, savings)) savedThisMonth += t.amount;
    else if (isSavingsWithdrawal(t, savings)) savedThisMonth -= t.amount;
    else if (t.type === 'expense') {
      const fromReserve = Math.min(t.amount, covered.get(t.id) ?? 0);
      reserveCovered += fromReserve;
      expenses += t.amount - fromReserve;
    }
  }

  // Argent disponible v2 (D1) : le revenu déclaré (`financial`) n'est jamais compté.
  void financial;
  if (recordedIncome <= 0) return { status: 'needs_income', daysLeft, until, expenses, reserveCovered };
  const income = recordedIncome;
  const incomeSource: IncomeSource = 'user';

  // Récurrences de dépense dont l'échéance tombe d'ici la fin du mois et qui
  // n'ont pas encore été enregistrées (sinon elles sont déjà des dépenses).
  let upcomingRecurring = 0;
  for (const r of data.recurring) {
    if (r.deleted || !r.active || r.type !== 'expense' || r.currency !== currency) continue;
    for (const d of occurrencesBetween(r, today, until)) {
      if (r.lastGenerated && d <= r.lastGenerated) continue;
      upcomingRecurring += r.amount;
    }
  }

  // Tontines : cotisations du mois pas encore versées, comme des récurrences à venir.
  const upcomingTontines = data.tontines ? tontineDueThisMonth({ tontines: data.tontines, tontineEntries: data.tontineEntries ?? [], recurring: data.recurring }, currency, today) : 0;
  upcomingRecurring += upcomingTontines;

  // Objectifs et réserves : rythme prévu du mois (contribution déclarée, sinon
  // effort nécessaire pour la date), calculé sur la situation au DÉBUT du mois
  // (versements et utilisations du mois exclus) : le chiffre reste stable
  // tout le mois et ne dépasse jamais ce qu'il restait à épargner.
  let goalsRemaining = 0;
  for (const g of data.goals) {
    if (g.deleted || g.status !== 'active' || g.currency !== currency) continue;
    let savedAtStart = g.initialAmount;
    for (const c of data.goalContributions) if (!c.deleted && c.goalId === g.id && monthKey(c.date) < month) savedAtStart += c.amount;
    const plan = computeGoalPlan({ targetAmount: g.targetAmount, saved: Math.max(0, savedAtStart), targetDate: g.targetDate, monthlyContribution: g.monthlyContribution, planned: g.planned }, today);
    if (plan.reached) continue;
    const planned = plan.pace ?? plan.requiredMonthly ?? 0;
    if (planned <= 0) continue;
    goalsRemaining += Math.min(planned, plan.remaining);
  }

  // Mise de côté du mois : la prévue (objectifs, réserves) ou celle déjà versée si elle est plus grande.
  const setAside = Math.max(goalsRemaining, savedThisMonth);
  const available = income - expenses - upcomingRecurring - setAside - tontinePaid;
  const base = { income, incomeSource, expenses, tontinePaid, upcomingRecurring, upcomingTontines, goalsRemaining, reserveCovered, savedThisMonth: Math.max(0, savedThisMonth), daysLeft, until };
  if (available < 0) return { status: 'deficit', deficit: -available, ...base };
  return { status: 'ok', available, perDay: Math.floor(available / daysLeft), ...base };
}

/**
 * Tout ce qui est déduit en plus des dépenses (« à venir » du détail affiché) :
 * récurrences et cotisations à venir, mise de côté du mois (prévue ou déjà
 * versée, épargne de départ comprise : la plus grande), cotisations payées
 * depuis le disponible. revenus − dépenses − ceci = disponible, toujours.
 */
export function allowanceDeductions(r: Pick<Breakdown, 'upcomingRecurring' | 'goalsRemaining' | 'savedThisMonth' | 'tontinePaid'>): number {
  return r.upcomingRecurring + Math.max(r.goalsRemaining, r.savedThisMonth) + r.tontinePaid;
}
