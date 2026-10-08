/**
 * Score de comportement financier — module PUR (testé).
 *
 * « Indicateur personnel de comportement financier. Ce n'est pas une note de
 * crédit ni une évaluation bancaire. » Calculé sur l'appareil, jamais envoyé
 * à un tiers ni partagé avec les autres membres d'un espace familial.
 *
 * Composantes (poids) : budgets 30 · épargne 25 · objectifs 20 · dettes 15 ·
 * fonds d'urgence 10. Une composante sans données est EXCLUE et les poids
 * restants sont renormalisés. Aucun score avant un mois complet comptant au
 * moins 10 opérations.
 */
import type { CurrencyCode } from '../money';
import type { SpaceData } from '../types';
import { envelopeStatuses } from '../budget';
import { debtStatus } from '../debts';
import { goalPlanFor, hasEmergencyFund } from '../goals';
import { goalSaved } from '../balance';
import { monthKey, previousMonth, type ISODate, type MonthKey } from '../dates';
import { MIN_OPERATIONS, operationsInMonth, savedInMonth } from './events';
import { hasDefinedBudget } from './envelopeAlerts';
import { budgetTransactions } from '../reserve';

export type ScoreComponentId = 'budgets' | 'savings' | 'goals' | 'debts' | 'emergency';

export const SCORE_WEIGHTS: Record<ScoreComponentId, number> = { budgets: 30, savings: 25, goals: 20, debts: 15, emergency: 10 };

export interface ScoreComponent {
  id: ScoreComponentId;
  weight: number;
  /** 0 à 100 ; null : pas de données (composante exclue). */
  value: number | null;
  /** Poids effectif après renormalisation (0 si exclue). */
  effectiveWeight: number;
}

export interface BehaviorScore {
  month: MonthKey;
  /** null : pas assez de données (mois incomplet ou < 10 opérations). */
  score: number | null;
  components: ScoreComponent[];
}

const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);
const lastDay = (m: MonthKey): ISODate => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
};

/** Respect des budgets : moyenne par enveloppe budgétée de min(1, budget / dépensé). */
function budgets(data: SpaceData, m: MonthKey, cur: CurrencyCode): number | null {
  const s = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, m, cur, data.accounts).filter((x) => x.budget > 0 && hasDefinedBudget(x.envelope, m, data.budgets));
  if (!s.length) return null;
  return pct(s.reduce((n, x) => n + (x.spent <= x.budget ? 1 : x.budget / x.spent), 0) / s.length);
}

/** Régularité de l'épargne sur les 3 derniers mois (mois avec des opérations seulement). */
function savings(data: SpaceData, m: MonthKey, cur: CurrencyCode): number | null {
  const months = [m, previousMonth(m), previousMonth(previousMonth(m))].filter((x) => operationsInMonth(data, x, cur) > 0);
  if (!months.length) return null;
  return pct(months.filter((x) => savedInMonth(data, x, cur)).length / months.length);
}

/** Progression des objectifs : effort du mois rapporté à l'effort nécessaire. */
function goals(data: SpaceData, m: MonthKey, cur: CurrencyCode): number | null {
  const active = data.goals.filter((g) => !g.deleted && g.status === 'active' && g.targetAmount > 0 && g.currency === cur);
  if (!active.length) return null;
  const end = lastDay(m);
  const parts = active.map((g) => {
    const plan = goalPlanFor(g, data.goalContributions, end);
    if (plan.reached) return 1;
    const put = data.goalContributions.filter((c) => !c.deleted && c.goalId === g.id && monthKey(c.date) === m).reduce((n, c) => n + c.amount, 0);
    const need = plan.requiredMonthly ?? plan.pace;
    if (need && need > 0) return Math.min(1, Math.max(0, put) / need);
    return put > 0 ? 1 : 0;
  });
  return pct(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Dettes : part des dettes sans échéance en retard à la fin du mois. */
function debts(data: SpaceData, m: MonthKey, cur: CurrencyCode): number | null {
  const list = data.debts.filter((d) => !d.deleted && d.direction === 'i_owe' && d.currency === cur && d.status === 'active');
  if (!list.length) return null;
  const end = lastDay(m);
  const ok = list.filter((d) => {
    const s = debtStatus(d, data.debtPayments, end);
    return s.settled || s.daysToDue === null || s.daysToDue >= 0;
  });
  return pct(ok.length / list.length);
}

/** Fonds d'urgence : avancement vers la cible (absent : 0, c'est une donnée). */
function emergency(data: SpaceData): number | null {
  if (!hasEmergencyFund(data.goals)) return 0;
  const g = data.goals.find((x) => !x.deleted && x.templateId === 'emergency_fund')!;
  return g.targetAmount > 0 ? pct(goalSaved(g, data.goalContributions) / g.targetAmount) : 0;
}

export function behaviorScore(data: SpaceData, currency: CurrencyCode, month: MonthKey): BehaviorScore {
  const raw: Record<ScoreComponentId, number | null> = {
    budgets: budgets(data, month, currency),
    savings: savings(data, month, currency),
    goals: goals(data, month, currency),
    debts: debts(data, month, currency),
    emergency: emergency(data),
  };
  const ids = Object.keys(SCORE_WEIGHTS) as ScoreComponentId[];
  const total = ids.reduce((n, id) => n + (raw[id] === null ? 0 : SCORE_WEIGHTS[id]), 0);
  const components = ids.map((id) => ({ id, weight: SCORE_WEIGHTS[id], value: raw[id], effectiveWeight: raw[id] === null || total === 0 ? 0 : SCORE_WEIGHTS[id] / total }));
  const eligible = operationsInMonth(data, month, currency) >= MIN_OPERATIONS && total > 0;
  const score = eligible ? Math.round(components.reduce((n, c) => n + (c.value ?? 0) * c.effectiveWeight, 0)) : null;
  return { month, score, components };
}

/** Score du dernier mois COMPLET (jamais le mois en cours). */
export function latestScore(data: SpaceData, currency: CurrencyCode, today: ISODate): BehaviorScore {
  return behaviorScore(data, currency, previousMonth(monthKey(today)));
}

export interface ScoreChange {
  id: ScoreComponentId;
  before: number | null;
  after: number | null;
  /** Points de score apportés par la composante (après − avant). */
  points: number;
}

/** « Pourquoi mon score a changé » : contribution de chaque composante, de la plus influente à la moins influente. */
export function explainChange(before: BehaviorScore, after: BehaviorScore): { delta: number | null; changes: ScoreChange[] } {
  const delta = before.score !== null && after.score !== null ? after.score - before.score : null;
  const changes = after.components.map((c) => {
    const b = before.components.find((x) => x.id === c.id)!;
    const points = (c.value ?? 0) * c.effectiveWeight - (b.value ?? 0) * b.effectiveWeight;
    return { id: c.id, before: b.value, after: c.value, points: Math.round(points * 10) / 10 };
  });
  return { delta, changes: changes.filter((c) => c.points !== 0 || c.before !== c.after).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)) };
}
