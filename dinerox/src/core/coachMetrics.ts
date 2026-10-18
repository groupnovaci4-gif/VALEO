/**
 * Définitions du coach, règle des 10 %, indicateurs et score — argent disponible v2
 * (docs/argent-disponible.md §11). Module PUR (testé : tests/argent-comptes-coach.test.ts).
 *
 * Une seule fonction par notion. R = revenus REÇUS (nature `revenu`) : jamais le revenu
 * déclaré, jamais une cagnotte, un emprunt ou un remboursement. Les seuils sont des
 * repères prudents de l'application (provenance `estimate`), pour informer, jamais juger.
 *
 * Arrondis : un montant proposé (dépenser, mettre de côté) vers le bas ; un montant qui
 * manque vers le haut ; un pourcentage affiché vers le bas, à l'unité.
 */
import type { FinancialProfile } from './types';

/** Taux d'épargne τ = S / R en % (vers le bas), seulement si R > 0. */
export function savingsRate(saved: number, received: number): number | null {
  if (!(received > 0)) return null;
  return Math.max(0, Math.floor((saved * 100) / received));
}

/** Marge = R − C − Rb − S : l'argent non affecté (remplace la « capacité d'épargne »). */
export function margin(m: { received: number; spent: number; repaid: number; saved: number }): number {
  return m.received - m.spent - m.repaid - m.saved;
}

export interface TenPercent {
  /** ⌊10 % × R⌋. */
  advice: number | null;
  /** min(conseil − déjà épargné, max(0, D − E)) : ce qu'on peut mettre de côté aujourd'hui sans toucher aux engagements. */
  feasible: number | null;
  /** Déjà épargné, en % de R (vers le bas). */
  savedPercent: number | null;
  /** Encore à mettre de côté pour atteindre 10 %. */
  toReach: number | null;
}

/** Règle des 10 % (§11.2). R = 0 (même avec un revenu déclaré) : aucun montant. */
export function tenPercent(m: { received: number; available: number; commitments: number; saved: number }): TenPercent {
  if (!(m.received > 0)) return { advice: null, feasible: null, savedPercent: null, toReach: null };
  const advice = Math.floor(m.received / 10);
  const toReach = Math.max(0, Math.ceil(advice - Math.max(0, m.saved)));
  return { advice, feasible: Math.floor(Math.min(toReach, Math.max(0, m.available - m.commitments))), savedPercent: savingsRate(m.saved, m.received), toReach };
}

/** Revenus irréguliers : à CHAQUE revenu reçu, proposer d'en mettre 10 % de côté (épargne à la source). */
export function sourceSavingSuggestion(received: number, irregular: boolean): number | null {
  if (!irregular || !(received > 0)) return null;
  return Math.floor(received / 10);
}

/** Revenus irréguliers : le profil le dit, ou l'écart-type de R sur 6 mois dépasse 30 % de sa moyenne. */
export function isIrregularIncome(profile: Pick<FinancialProfile, 'incomeNature'> | null | undefined, monthlyReceived: number[]): boolean {
  if (profile?.incomeNature === 'variable' || profile?.incomeNature === 'irregular') return true;
  const r = monthlyReceived.slice(-6);
  if (r.length < 3) return false;
  const mean = r.reduce((n, x) => n + x, 0) / r.length;
  if (mean <= 0) return false;
  const sd = Math.sqrt(r.reduce((n, x) => n + (x - mean) ** 2, 0) / r.length);
  return sd > 0.3 * mean;
}

/** Épargne de précaution (§11.3) : 3 mois de dépenses essentielles, 6 si les revenus sont irréguliers. */
export function precaution(m: { fund: number; essentials: number; irregular: boolean }): { months: number; targetMonths: number; target: number; missing: number } | null {
  if (!(m.essentials > 0)) return null;
  const targetMonths = m.irregular ? 6 : 3;
  const target = m.essentials * targetMonths;
  return { months: Math.floor(m.fund / m.essentials), targetMonths, target, missing: Math.max(0, Math.ceil(target - m.fund)) };
}

export type ScoreV2Id = 'savings' | 'means' | 'precaution' | 'budget' | 'debts';
export const SCORE_V2_WEIGHTS: Record<ScoreV2Id, number> = { savings: 30, means: 25, precaution: 20, budget: 15, debts: 10 };

export interface ScoreV2Input {
  received: number;
  spent: number;
  repaid: number;
  saved: number;
  tracked: boolean;
  /** Opérations saisies sur le mois. */
  operations: number;
  /** Mois couverts par l'épargne de précaution (null : pas de données). */
  monthsCovered: number | null;
  irregular: boolean;
  /** Enveloppes du mois (cercle exclu). Vide : composante exclue. */
  budgets: { budget: number; spent: number }[];
  /** null : aucune dette, composante exclue. */
  debts: { late: boolean; debtShare: number } | null;
}

/**
 * Score de comportement sur 100, sur un mois clos (§11.5). Pas de score sans revenu reçu,
 * sans argent renseigné ou avec moins de 10 opérations. Une composante sans données est
 * exclue et les poids restants sont recalculés. 1 F épargné ne compte pas comme épargner.
 */
export function behaviorScoreV2(m: ScoreV2Input): { score: number | null; components: { id: ScoreV2Id; weight: number; value: number; points: number }[] } {
  if (!(m.received > 0) || !m.tracked || m.operations < 10) return { score: null, components: [] };
  const values: Partial<Record<ScoreV2Id, number>> = {};
  values.savings = Math.min(1, (savingsRate(m.saved, m.received) ?? 0) / 10);
  const out = m.spent + m.repaid;
  values.means = out <= m.received ? 1 : Math.max(0, 1 - (out - m.received) / m.received);
  if (m.monthsCovered !== null) values.precaution = Math.min(1, Math.max(0, m.monthsCovered) / (m.irregular ? 6 : 3));
  const totalBudget = m.budgets.reduce((n, b) => n + Math.max(0, b.budget), 0);
  if (totalBudget > 0) values.budget = Math.max(0, 1 - m.budgets.reduce((n, b) => n + Math.max(0, b.spent - b.budget), 0) / totalBudget);
  if (m.debts) values.debts = 0.5 * (m.debts.late ? 0 : 1) + 0.5 * (m.debts.debtShare <= 33 ? 1 : 0);
  const components = (Object.keys(values) as ScoreV2Id[]).map((id) => ({ id, weight: SCORE_V2_WEIGHTS[id], value: values[id]!, points: SCORE_V2_WEIGHTS[id] * values[id]! }));
  const weights = components.reduce((n, c) => n + c.weight, 0);
  return { score: Math.round((components.reduce((n, c) => n + c.points, 0) * 100) / weights), components };
}

export type AdviceKey =
  | 'money_unknown'
  | 'commitments_over_available'
  | 'overdue'
  | 'precaution_low'
  | 'living_beyond_means'
  | 'ten_percent'
  | 'fixed_charges'
  | 'debt_load'
  | 'goals_effort'
  | 'congrats';

/** UN seul producteur par conseil, dans l'ordre du §11.4. */
export function nextAdvice(m: {
  tracked: boolean;
  available: number;
  commitments: number;
  overdue: boolean;
  monthsCovered: number | null;
  /** Mois clos (sur les trois derniers) où C + Rb > R. */
  overspentMonths: number;
  savingsRate: number | null;
  /** Part des charges fixes dans R, en %. */
  fixedShare: number | null;
  /** Taux d'endettement (mensualités / R), en %. */
  debtShare: number | null;
  goalsBehind: boolean;
}): AdviceKey {
  if (!m.tracked) return 'money_unknown';
  if (m.commitments > m.available) return 'commitments_over_available';
  if (m.overdue) return 'overdue';
  if (m.monthsCovered !== null && m.monthsCovered < 1) return 'precaution_low';
  if (m.overspentMonths >= 2) return 'living_beyond_means';
  if (m.savingsRate !== null && m.savingsRate < 10) return 'ten_percent';
  if (m.fixedShare !== null && m.fixedShare > 60) return 'fixed_charges';
  if (m.debtShare !== null && m.debtShare >= 33) return 'debt_load';
  if (m.goalsBehind) return 'goals_effort';
  return 'congrats';
}
