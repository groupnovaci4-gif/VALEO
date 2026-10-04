/**
 * Objectifs : calculs de plan, progression, priorités et cycle de vie.
 *
 * Exemple de référence (spécification) :
 *   cible 8 000 000, déjà 1 500 000, échéance déc. 2028 vue d'oct. 2026
 *   → reste 6 500 000, 26 mois, ≈ 250 000/mois ;
 *   à 200 000/mois → ≈ 33 mois ; écart à combler ≈ 50 000/mois.
 */
import type { Goal, GoalChange, GoalContribution, GoalPriority, GoalStatus, PlannedContribution } from './types';
import { addMonths, monthsUntil, today, type ISODate } from './dates';
import { goalSaved } from './balance';

export interface GoalPlan {
  target: number;
  saved: number;
  remaining: number;
  /** 0–100, borné. */
  percent: number;
  reached: boolean;
  /** Mois restants jusqu'à la date cible (null si pas de date). */
  monthsToTarget: number | null;
  /** Date cible dépassée sans que l'objectif soit atteint. */
  overdue: boolean;
  /** Épargne mensuelle nécessaire pour tenir la date (null si pas de date). */
  requiredMonthly: number | null;
  /** Épargne hebdomadaire nécessaire (≈ mensuel × 12 / 52). */
  requiredWeekly: number | null;
  /** Rythme retenu : contribution déclarée, sinon somme des contributions prévues. */
  pace: number | null;
  /** Mois nécessaires au rythme actuel. */
  monthsAtPace: number | null;
  /** Date estimée d'atteinte au rythme actuel. */
  estimatedDate: ISODate | null;
  /** Hausse mensuelle nécessaire pour tenir la date (0 si le rythme suffit). */
  monthlyGap: number | null;
}

/** Arrondi « humain » vers le haut au millier (XOF) pour ne jamais sous-estimer l'effort. */
function ceilTo(amount: number, step: number): number {
  if (step <= 1) return Math.ceil(amount);
  return Math.ceil(amount / step) * step;
}

/** Somme des contributions mensuelles prévues (objectif partagé). */
export function plannedMonthly(planned: PlannedContribution[] | undefined): number {
  return (planned ?? []).reduce((s, p) => s + Math.max(0, p.monthly || 0), 0);
}

export function goalPace(goal: Pick<Goal, 'monthlyContribution' | 'planned'>): number | null {
  const declared = goal.monthlyContribution ?? 0;
  const pace = declared > 0 ? declared : plannedMonthly(goal.planned);
  return pace > 0 ? pace : null;
}

/**
 * Calcule le plan d'un objectif. `step` arrondit les montants recommandés
 * (1 000 par défaut pour le FCFA ; passer 1 pour des centimes).
 */
export function computeGoalPlan(
  input: {
    targetAmount: number;
    saved: number;
    targetDate?: ISODate | null;
    monthlyContribution?: number | null;
    planned?: PlannedContribution[];
  },
  now: ISODate = today(),
  step = 1000,
): GoalPlan {
  const target = Math.max(0, input.targetAmount);
  const saved = Math.max(0, input.saved);
  const remaining = Math.max(0, target - saved);
  const reached = target > 0 && saved >= target;
  // Arrondi usuel, mais jamais « 100 % » tant que l'objectif n'est pas atteint.
  const percent = target <= 0 ? 0 : reached ? 100 : Math.min(99, Math.round((saved / target) * 100));

  let monthsToTarget: number | null = null;
  let requiredMonthly: number | null = null;
  let requiredWeekly: number | null = null;
  let overdue = false;
  if (input.targetDate) {
    monthsToTarget = monthsUntil(now, input.targetDate);
    if (monthsToTarget === 0) {
      overdue = !reached;
      requiredMonthly = remaining;
    } else {
      requiredMonthly = ceilTo(remaining / monthsToTarget, step);
    }
    requiredWeekly = ceilTo((requiredMonthly * 12) / 52, step >= 1000 ? 500 : step);
    if (remaining === 0) {
      requiredMonthly = 0;
      requiredWeekly = 0;
    }
  }

  const pace = goalPace({ monthlyContribution: input.monthlyContribution, planned: input.planned });
  let monthsAtPace: number | null = null;
  let estimatedDate: ISODate | null = null;
  if (remaining === 0) {
    monthsAtPace = 0;
    estimatedDate = now;
  } else if (pace) {
    monthsAtPace = Math.ceil(remaining / pace);
    estimatedDate = addMonths(now, monthsAtPace);
  }

  let monthlyGap: number | null = null;
  if (requiredMonthly !== null && pace !== null) monthlyGap = Math.max(0, requiredMonthly - pace);

  return {
    target,
    saved,
    remaining,
    percent,
    reached,
    monthsToTarget,
    overdue,
    requiredMonthly,
    requiredWeekly,
    pace,
    monthsAtPace,
    estimatedDate,
    monthlyGap,
  };
}

export function goalPlanFor(goal: Goal, contributions: GoalContribution[], now?: ISODate, step?: number): GoalPlan {
  return computeGoalPlan(
    {
      targetAmount: goal.targetAmount,
      saved: goalSaved(goal, contributions),
      targetDate: goal.targetDate,
      monthlyContribution: goal.monthlyContribution,
      planned: goal.planned,
    },
    now,
    step,
  );
}

/** Mois nécessaires pour constituer `target` à `monthly` par mois. */
export function monthsToSave(target: number, monthly: number): number | null {
  if (monthly <= 0) return null;
  if (target <= 0) return 0;
  return Math.ceil(target / monthly);
}

// ─── Priorités & répartition ──────────────────────────────────────────

const PRIORITY_WEIGHT: Record<GoalPriority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };

/** Objectifs actifs triés : rang choisi par l'utilisateur, puis priorité, puis échéance. */
export function sortGoals<T extends Pick<Goal, 'rank' | 'priority' | 'targetDate' | 'createdAt'>>(goals: T[]): T[] {
  return [...goals].sort(
    (a, b) =>
      a.rank - b.rank ||
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') ||
      a.createdAt - b.createdAt,
  );
}

export interface AllocationLine {
  goalId: string;
  amount: number;
  /** Besoin mensuel de l'objectif (nécessaire pour la date, ou rythme déclaré). */
  need: number;
}

/**
 * Répartit une capacité d'épargne mensuelle entre objectifs, PAR ORDRE DE
 * PRIORITÉ : on finance d'abord le besoin du premier, puis du suivant, etc.
 * Un objectif sans date ni rythme reçoit ce qui reste (partagé à égalité).
 */
export function allocateCapacity(
  capacity: number,
  goals: Goal[],
  contributions: GoalContribution[],
  now: ISODate = today(),
  step = 1000,
): AllocationLine[] {
  const active = sortGoals(goals.filter((g) => !g.deleted && g.status === 'active'));
  let left = Math.max(0, capacity);
  const lines: AllocationLine[] = [];
  const open: { goalId: string; remaining: number }[] = [];
  for (const g of active) {
    const plan = goalPlanFor(g, contributions, now, step);
    if (plan.reached) continue;
    const need = Math.min(plan.remaining, plan.requiredMonthly ?? plan.pace ?? 0);
    if (need > 0) {
      const amount = Math.min(left, need);
      left -= amount;
      lines.push({ goalId: g.id, amount, need });
    } else {
      lines.push({ goalId: g.id, amount: 0, need: 0 });
      open.push({ goalId: g.id, remaining: plan.remaining });
    }
  }
  if (left > 0 && open.length) {
    const share = Math.floor(left / open.length);
    for (const o of open) {
      const line = lines.find((l) => l.goalId === o.goalId)!;
      line.amount = Math.min(o.remaining, share);
    }
  }
  return lines;
}

// ─── Cycle de vie ─────────────────────────────────────────────────────

const ALLOWED: Record<GoalStatus, GoalStatus[]> = {
  active: ['paused', 'completed', 'abandoned', 'archived'],
  paused: ['active', 'abandoned', 'archived'],
  completed: ['archived', 'active'],
  abandoned: ['active', 'archived'],
  archived: ['active'],
};

export function canTransition(from: GoalStatus, to: GoalStatus): boolean {
  return ALLOWED[from].includes(to);
}

type Editable = Pick<Goal, 'name' | 'targetAmount' | 'targetDate' | 'priority' | 'status' | 'monthlyContribution'>;

/**
 * Applique une modification à un objectif en conservant l'historique des
 * changements significatifs (montant, date, priorité, statut…).
 */
export function applyGoalChanges(goal: Goal, patch: Partial<Editable>, by: string, at: number): Goal {
  if (patch.status && patch.status !== goal.status && !canTransition(goal.status, patch.status)) {
    throw new Error(`goal.invalidTransition:${goal.status}->${patch.status}`);
  }
  const history: GoalChange[] = [...(goal.history ?? [])];
  const fields: (keyof Editable)[] = ['name', 'targetAmount', 'targetDate', 'priority', 'status', 'monthlyContribution'];
  for (const f of fields) {
    if (!(f in patch)) continue;
    const from = (goal[f] ?? null) as string | number | null;
    const to = (patch[f] ?? null) as string | number | null;
    if (from !== to) history.push({ at, by, field: f, from, to });
  }
  const next: Goal = { ...goal, ...patch, history };
  if (patch.status === 'completed' && goal.status !== 'completed') next.completedAt = at;
  if (patch.status === 'active') next.completedAt = null;
  return next;
}

/** Vrai quand un objectif actif vient d'atteindre 100 % : déclenche la célébration. */
export function shouldCelebrate(goal: Goal, contributions: GoalContribution[]): boolean {
  return goal.status === 'active' && goal.targetAmount > 0 && goalSaved(goal, contributions) >= goal.targetAmount;
}
