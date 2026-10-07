/**
 * « Il vous reste X par jour jusqu'à la fin du mois » — module PUR.
 *
 *   disponible = revenus du mois (enregistrés ; à défaut, revenu déclaré)
 *              − dépenses du mois
 *              − récurrences de dépense restant à payer ce mois-ci
 *              − contributions d'objectifs prévues restantes ce mois-ci
 *   reste par jour = disponible / jours restants (aujourd'hui inclus), arrondi vers le bas.
 *
 * Aucun chiffre inventé : sans revenu (ni enregistré, ni déclaré), on invite
 * à le compléter. Un disponible négatif n'est jamais présenté « par jour ».
 * Une seule devise (celle de l'espace) : aucune conversion.
 */
import { endOfMonth, monthKey, parseISODate, type ISODate } from './dates';
import { goalPlanFor } from './goals';
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
  /** Contributions prévues aux objectifs, pas encore versées ce mois-ci. */
  goalsRemaining: number;
  daysLeft: number;
  until: ISODate;
}

export type DailyAllowance =
  | ({ status: 'ok'; available: number; perDay: number } & Breakdown)
  | ({ status: 'deficit'; deficit: number } & Breakdown)
  | { status: 'needs_income'; daysLeft: number; until: ISODate; expenses: number };

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

  let recordedIncome = 0;
  let expenses = 0;
  for (const t of data.transactions) {
    if (t.deleted || t.currency !== currency || monthKey(t.date) !== month) continue;
    if (t.type === 'income') recordedIncome += t.amount;
    else if (t.type === 'expense') expenses += t.amount;
  }

  const declared = financial?.monthlyIncome && financial.monthlyIncome > 0 ? financial.monthlyIncome : 0;
  if (recordedIncome <= 0 && declared <= 0) return { status: 'needs_income', daysLeft, until, expenses };
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

  // Objectifs : rythme prévu (contribution déclarée, sinon effort nécessaire pour la date),
  // moins ce qui a déjà été versé ce mois-ci, jamais au-delà de ce qu'il reste à épargner.
  let goalsRemaining = 0;
  for (const g of data.goals) {
    if (g.deleted || g.status !== 'active' || g.currency !== currency) continue;
    const plan = goalPlanFor(g, data.goalContributions, today);
    if (plan.reached) continue;
    const planned = plan.pace ?? plan.requiredMonthly ?? 0;
    if (planned <= 0) continue;
    const paid = data.goalContributions.filter((c) => !c.deleted && c.goalId === g.id && monthKey(c.date) === month && c.amount > 0).reduce((n, c) => n + c.amount, 0);
    goalsRemaining += Math.min(Math.max(0, planned - paid), plan.remaining);
  }

  const available = income - expenses - upcomingRecurring - goalsRemaining;
  const base = { income, incomeSource, expenses, upcomingRecurring, goalsRemaining, daysLeft, until };
  if (available < 0) return { status: 'deficit', deficit: -available, ...base };
  return { status: 'ok', available, perDay: Math.floor(available / daysLeft), ...base };
}
