/**
 * Vignette d'objectif (refonte finale D2 ; ecrans/objectifs-*.html) — module pur, testé :
 * famille de couleur selon la sorte (projet vert, moment fort bleu, réserve or) et voiles posés sur
 * la zone pastel (piste de l'anneau, fond de l'étiquette), valeurs exactes du HTML.
 */
import type { FinalPalette } from '@/theme/finalPalette';
import type { GoalPlan } from '@/core/goals';

/**
 * Ligne de rythme d'une vignette d'objectif (audit du 23/10, R7 : comme l'ancienne vignette, un
 * objectif dont la date est dépassée est signalé AVANT tout rythme ; atteint : rien).
 */
export function goalPaceKind(plan: Pick<GoalPlan, 'reached' | 'overdue' | 'requiredMonthly' | 'estimatedDate'>): 'overdue' | 'monthly' | 'atPace' | null {
  if (plan.reached) return null;
  if (plan.overdue) return 'overdue';
  if (plan.requiredMonthly) return 'monthly';
  if (plan.estimatedDate) return 'atPace';
  return null;
}

export type GoalTileKind = 'goal' | 'season' | 'reserve';
export type GoalTileFamily = 'green' | 'blue' | 'gold';

export function goalTileFamily(kind: GoalTileKind): GoalTileFamily {
  return kind === 'season' ? 'blue' : kind === 'reserve' ? 'gold' : 'green';
}

/** Fond pastel et couleur (anneau, étiquette, %) d'une famille. */
export function goalTileColors(family: GoalTileFamily, p: FinalPalette): { bg: string; fg: string } {
  if (family === 'blue') return { bg: p.blueBg, fg: p.blueFg };
  if (family === 'gold') return { bg: p.goldBg, fg: p.goldFg };
  return { bg: p.greenBg, fg: p.greenFg };
}

export const GOAL_TILE = {
  light: { track: 'rgba(255,255,255,0.7)', pill: 'rgba(255,255,255,0.75)' },
  dark: { track: 'rgba(0,0,0,0.25)', pill: 'rgba(0,0,0,0.35)' },
} as const;
