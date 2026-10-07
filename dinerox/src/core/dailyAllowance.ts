/**
 * « Il vous reste X par jour jusqu'à la fin du mois » — module PUR.
 *
 *   disponible = revenus du mois (enregistrés ; à défaut, revenu déclaré)
 *              − dépenses du mois (hors part prise sur une réserve)
 *              − récurrences de dépense restant à payer ce mois-ci
 *              − mise de côté prévue du mois (objectifs et réserves)
 *   reste par jour = disponible / jours restants (aujourd'hui inclus), arrondi vers le bas.
 *
 * Mise de côté : le rythme prévu du mois est déduit TOUT le mois, qu'il soit
 * déjà versé ou non (verser ce qui était prévu ne change pas le reste par
 * jour), borné à ce qu'il restait à épargner au début du mois. Une dépense
 * prise sur une réserve ne fait pas baisser le reste par jour : l'argent avait
 * déjà été mis de côté. Seul le complément (réserve insuffisante) compte.
 *
 * Aucun chiffre inventé : sans revenu (ni enregistré, ni déclaré), on invite
 * à le compléter. Un disponible négatif n'est jamais présenté « par jour ».
 * Une seule devise (celle de l'espace) : aucune conversion.
 */
import { endOfMonth, monthKey, parseISODate, type ISODate } from './dates';
import { computeGoalPlan } from './goals';
import { occurrencesBetween } from './recurring';
import type { CurrencyCode } from './money';
import type { FinancialProfile, SpaceData } from './types';

export type IncomeSource = 'user' | 'declared';

interface Breakdown {
  income: number;
  incomeSource: IncomeSource;
  expenses: number;
  /** Récurrences de dépense pas encore enregistrées d'ici la fin du mois. */
  upcomingRecurring: number;
  /** Mise de côté prévue du mois (objectifs et réserves), versée ou non. */
  goalsRemaining: number;
  /** Part des dépenses du mois prise sur une réserve (déjà mise de côté : non déduite). */
  reserveCovered: number;
  daysLeft: number;
  until: ISODate;
}

export type DailyAllowance =
  | ({ status: 'ok'; available: number; perDay: number } & Breakdown)
  | ({ status: 'deficit'; deficit: number } & Breakdown)
  | { status: 'needs_income'; daysLeft: number; until: ISODate; expenses: number; reserveCovered: number };

export interface AllowanceInput {
  data: Pick<SpaceData, 'transactions' | 'recurring' | 'goals' | 'goalContributions'>;
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
  for (const t of data.transactions) {
    if (t.deleted || t.currency !== currency || monthKey(t.date) !== month) continue;
    if (t.type === 'income') recordedIncome += t.amount;
    else if (t.type === 'expense') {
      const fromReserve = Math.min(t.amount, covered.get(t.id) ?? 0);
      reserveCovered += fromReserve;
      expenses += t.amount - fromReserve;
    }
  }

  const declared = financial?.monthlyIncome && financial.monthlyIncome > 0 ? financial.monthlyIncome : 0;
  if (recordedIncome <= 0 && declared <= 0) return { status: 'needs_income', daysLeft, until, expenses, reserveCovered };
  const income = recordedIncome > 0 ? recordedIncome : declared;
  const incomeSource: IncomeSource = recordedIncome > 0 ? 'user' : 'declared';

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

  const available = income - expenses - upcomingRecurring - goalsRemaining;
  const base = { income, incomeSource, expenses, upcomingRecurring, goalsRemaining, reserveCovered, daysLeft, until };
  if (available < 0) return { status: 'deficit', deficit: -available, ...base };
  return { status: 'ok', available, perDay: Math.floor(available / daysLeft), ...base };
}
