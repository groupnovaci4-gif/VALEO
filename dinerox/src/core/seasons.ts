/**
 * Moments forts de l'année — module PUR.
 *
 * Rentrée scolaire, Tabaski, fin du Ramadan, Noël et fin d'année, Pâques, et
 * des moments personnels (mariage prévu, anniversaire de décès, dot…).
 * AUCUNE date codée en dur : Tabaski et le Ramadan suivent le calendrier
 * lunaire et varient selon les pays, la rentrée aussi. Les dates viennent d'un
 * catalogue distant publié par l'administrateur (`config/seasons/items`, lecture
 * pour tout utilisateur connecté, écriture administrateur) et l'utilisateur
 * peut toujours les corriger ; sans date connue : « date à préciser ».
 *
 * Un moment fort choisi est un OBJECTIF À DATE (`kind: 'goal'`, catégorie
 * `seasons`, `templateId` = l'événement) : son plan vient de `computeGoalPlan`.
 */
import type { Goal, GoalContribution, SpaceData, Transaction } from './types';
import { currencyInfo, type CurrencyCode } from './money';
import { addDays, diffDays, type ISODate } from './dates';
import { computeGoalPlan, type GoalPlan } from './goals';
import { goalSaved } from './balance';
import { NOT_CEREMONY_SUBCATEGORIES, SEASON_GOAL_CATEGORY, isSeason } from './reserve';

export type SeasonEventId = 'school_start' | 'tabaski' | 'ramadan_end' | 'christmas' | 'easter';

export interface SeasonEvent {
  id: SeasonEventId;
  icon: string;
  /** Catégories de dépense regardées pour préremplir le montant (même période l'an dernier). */
  categories: string[];
}

/** Catalogue des moments forts (sans date). */
export const SEASON_EVENTS: SeasonEvent[] = [
  { id: 'school_start', icon: '🎒', categories: ['cat_education'] },
  { id: 'tabaski', icon: '🐑', categories: ['cat_social', 'cat_family', 'cat_clothing'] },
  { id: 'ramadan_end', icon: '🌙', categories: ['cat_social', 'cat_family', 'cat_clothing'] },
  { id: 'christmas', icon: '🎄', categories: ['cat_social', 'cat_family', 'cat_clothing', 'cat_leisure'] },
  { id: 'easter', icon: '🕊️', categories: ['cat_social', 'cat_family', 'cat_clothing'] },
];
/** Moment personnel (mariage prévu, anniversaire de décès, dot…). */
export const PERSONAL_SEASON = 'personal';

/** Entrée du catalogue distant : une date par événement, année et pays (null = tous pays). */
export interface SeasonDate {
  eventId: string;
  date: ISODate;
  country?: string | null;
}

const isDate = (s: unknown): s is ISODate => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Nettoie ce qui vient du serveur (documents incomplets ou mal formés ignorés). */
export function sanitizeSeasonDates(items: unknown[]): SeasonDate[] {
  return items
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .filter((x) => typeof x.eventId === 'string' && isDate(x.date))
    .map((x) => ({ eventId: x.eventId as string, date: x.date as ISODate, country: typeof x.country === 'string' ? x.country : null }));
}

/**
 * Prochaine date connue d'un événement (aujourd'hui inclus) : celle du pays
 * de l'utilisateur en priorité, sinon une date valable pour tous les pays.
 * null : « date à préciser » (jamais de date inventée).
 */
export function nextSeasonDate(eventId: string, country: string | null | undefined, today: ISODate, catalog: SeasonDate[]): ISODate | null {
  const upcoming = catalog.filter((c) => c.eventId === eventId && c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const local = upcoming.find((c) => country && c.country === country);
  if (local) return local.date;
  return upcoming.find((c) => !c.country)?.date ?? null;
}

/** Date de l'an dernier pour le même événement (catalogue, sinon même jour il y a un an). */
export function lastYearDate(eventId: string, country: string | null | undefined, date: ISODate, catalog: SeasonDate[]): ISODate {
  const past = catalog
    .filter((c) => c.eventId === eventId && c.date < addDays(date, -300) && c.date > addDays(date, -430) && (!c.country || c.country === country))
    .sort((a, b) => Number(b.country === country) - Number(a.country === country));
  return past[0]?.date ?? addDays(date, -365);
}

/** Fenêtre « même période » : trois semaines avant le jour J jusqu'à trois jours après. */
export const SEASON_WINDOW = { before: 21, after: 3 };

/**
 * Montant dépensé à la même période l'an dernier (catégories de l'événement),
 * pour préremplir le montant prévu ; null s'il n'y a aucune donnée (rien d'inventé).
 */
export function lastYearSpending(data: Pick<SpaceData, 'transactions'>, event: SeasonEvent, lastDate: ISODate, currency: CurrencyCode): number | null {
  const from = addDays(lastDate, -SEASON_WINDOW.before);
  const to = addDays(lastDate, SEASON_WINDOW.after);
  const inWindow = (t: Transaction) => !t.deleted && t.type === 'expense' && t.currency === currency && t.date >= from && t.date <= to && !!t.categoryId && event.categories.includes(t.categoryId) && !(t.subcategoryId && NOT_CEREMONY_SUBCATEGORIES.includes(t.subcategoryId));
  const total = data.transactions.filter(inWindow).reduce((n, t) => n + t.amount, 0);
  return total > 0 ? total : null;
}

export interface SeasonPlan {
  plan: GoalPlan;
  /** Jours avant le moment (null : date à préciser). */
  daysLeft: number | null;
  /** Semaines restantes (au moins 1) ; null sans date. */
  weeksLeft: number | null;
  /** Mise de côté par semaine sur les semaines RÉELLES restantes, arrondie vers le haut. */
  weekly: number | null;
}

/** Arrondi vers le haut : 500 dans une devise sans décimales (FCFA), une unité sinon. */
function weeklyStep(currency: CurrencyCode): number {
  return currencyInfo(currency).decimals === 0 ? 500 : 10 ** currencyInfo(currency).decimals;
}

/**
 * Plan d'un moment fort : `computeGoalPlan` (reste, pourcentage, mensuel), et
 * rythme hebdomadaire calculé sur les semaines réelles (« Rentrée dans
 * 8 semaines : 120 000 prévus, soit 15 000 par semaine »).
 */
export function seasonPlan(input: { targetAmount: number; saved: number; date: ISODate | null; currency: CurrencyCode }, today: ISODate): SeasonPlan {
  const plan = computeGoalPlan({ targetAmount: input.targetAmount, saved: input.saved, targetDate: input.date }, today);
  if (!input.date) return { plan, daysLeft: null, weeksLeft: null, weekly: null };
  const daysLeft = Math.max(0, diffDays(today, input.date));
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  const step = weeklyStep(input.currency);
  const weekly = plan.remaining > 0 ? Math.ceil(plan.remaining / weeksLeft / step) * step : 0;
  return { plan, daysLeft, weeksLeft, weekly };
}

export function seasonPlanFor(g: Goal, contributions: GoalContribution[], today: ISODate): SeasonPlan {
  return seasonPlan({ targetAmount: g.targetAmount, saved: goalSaved(g, contributions), date: g.targetDate ?? null, currency: g.currency }, today);
}

/** Moments forts en cours de l'espace (les plus proches d'abord, « date à préciser » à la fin). */
export function activeSeasons(goals: Goal[]): Goal[] {
  return goals.filter((g) => !g.deleted && isSeason(g) && (g.status === 'active' || g.status === 'paused')).sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'));
}

/** Rappels avant un moment fort : J-60, J-30 et J-7. */
export const SEASON_REMINDER_DAYS = [60, 30, 7] as const;

/** Rappels à programmer (dates futures uniquement, moment non atteint). */
export function seasonReminders(data: Pick<SpaceData, 'goals' | 'goalContributions'>, today: ISODate): { goalId: string; date: ISODate; days: number }[] {
  const out: { goalId: string; date: ISODate; days: number }[] = [];
  for (const g of activeSeasons(data.goals)) {
    if (g.status !== 'active' || !g.targetDate) continue;
    if (g.targetAmount > 0 && goalSaved(g, data.goalContributions) >= g.targetAmount) continue;
    for (const days of SEASON_REMINDER_DAYS) {
      const date = addDays(g.targetDate, -days);
      if (date > today) out.push({ goalId: g.id, date, days });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Épargne en retard pour un moment fort : à 30 jours ou moins, ce qui est mis
 * de côté est sous le rythme linéaire attendu depuis la création du moment.
 */
export function seasonBehind(g: Goal, contributions: GoalContribution[], today: ISODate, createdOn: ISODate): boolean {
  if (!g.targetDate || g.targetAmount <= 0) return false;
  const left = diffDays(today, g.targetDate);
  if (left < 0 || left > 30) return false;
  const total = Math.max(1, diffDays(createdOn, g.targetDate));
  const expected = g.targetAmount * Math.min(1, Math.max(0, (total - left) / total));
  return goalSaved(g, contributions) < expected;
}

export { SEASON_GOAL_CATEGORY };
