/**
 * Score de comportement financier — module PUR (testé).
 *
 * « Indicateur personnel de comportement financier. Ce n'est pas une note de
 * crédit ni une évaluation bancaire. » Calculé sur l'appareil, jamais envoyé
 * à un tiers ni partagé avec les autres membres d'un espace familial.
 *
 * Argent disponible v2 (§11.5) — composantes (poids) : taux d'épargne 30 · vivre selon
 * ses moyens 25 · épargne de précaution 20 · respect du budget 15 · dettes 10. Calculées par
 * `coachData.scoreForMonth` (R reçu, jamais le déclaré). Aucun score sans revenu reçu sur le
 * mois, sans argent renseigné ou avec moins de 10 opérations ; une composante sans données est
 * EXCLUE et les poids restants sont renormalisés. 1 F épargné ne compte pas comme épargner.
 */
import type { CurrencyCode } from '../money';
import type { FinancialProfile, SpaceData } from '../types';
import { monthKey, previousMonth, type ISODate, type MonthKey } from '../dates';
import { scoreForMonth } from '../coachData';
import type { ScoreV2Id } from '../coachMetrics';

export type ScoreComponentId = 'savings' | 'means' | 'emergency' | 'budgets' | 'debts';

export const SCORE_WEIGHTS: Record<ScoreComponentId, number> = { savings: 30, means: 25, emergency: 20, budgets: 15, debts: 10 };

/** Composante v2 → identifiant affiché (libellés `score.c.<id>`). */
const ID: Record<ScoreV2Id, ScoreComponentId> = { savings: 'savings', means: 'means', precaution: 'emergency', budget: 'budgets', debts: 'debts' };

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
  /** null : pas assez de données (pas de revenu reçu, argent non renseigné ou < 10 opérations). */
  score: number | null;
  components: ScoreComponent[];
}

export function behaviorScore(data: SpaceData, currency: CurrencyCode, month: MonthKey, financial?: Pick<FinancialProfile, 'incomeNature'> | null): BehaviorScore {
  const r = scoreForMonth(data, currency, month, financial);
  const byId = new Map(r.components.map((c) => [ID[c.id], c]));
  const total = r.components.reduce((n, c) => n + c.weight, 0);
  const components = (Object.keys(SCORE_WEIGHTS) as ScoreComponentId[]).map((id) => {
    const c = byId.get(id);
    return { id, weight: SCORE_WEIGHTS[id], value: c ? Math.round(c.value * 100) : null, effectiveWeight: c && total > 0 ? c.weight / total : 0 };
  });
  return { month, score: r.score, components };
}

/** Score du dernier mois COMPLET (jamais le mois en cours). */
export function latestScore(data: SpaceData, currency: CurrencyCode, today: ISODate, financial?: Pick<FinancialProfile, 'incomeNature'> | null): BehaviorScore {
  // Audit I4 : le profil (revenus irréguliers → 6 mois de précaution) compte, comme dans l'IA et le coach.
  return behaviorScore(data, currency, previousMonth(monthKey(today)), financial);
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
