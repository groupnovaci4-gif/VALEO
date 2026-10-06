/**
 * Récompenses — catalogue DÉCLARATIF et évaluation PURE (testée).
 *
 * Ajouter une récompense = ajouter une entrée à `REWARDS` (clés i18n, icône,
 * niveau, fonction `evaluate`). Règles communes :
 *  - anti-triche : rien sur un mois avec moins de 10 opérations enregistrées ;
 *  - idempotence : identifiant `${rewardId}_${période}` ; jamais deux fois la
 *    même récompense pour la même période ;
 *  - mois évalué une fois CLOS (le mois précédent, au premier lancement du
 *    nouveau mois) ; le mois en cours n'affiche qu'une progression.
 */
import type { CurrencyCode } from '../money';
import type { Goal, SpaceData } from '../types';
import { envelopeStatuses } from '../budget';
import { debtStatus } from '../debts';
import { goalSaved } from '../balance';
import { hasEmergencyFund } from '../goals';
import { monthKey, previousMonth, type ISODate, type MonthKey } from '../dates';
import { MIN_OPERATIONS, operationsInMonth, savedInMonth } from './events';
import { hasDefinedBudget } from './envelopeAlerts';

export interface RewardRecord {
  rewardId: string;
  /** Mois (AAAA-MM) ou identifiant de l'objet récompensé (objectif). */
  period: string;
  earnedAt: number;
}

export interface RewardContext {
  data: SpaceData;
  currency: CurrencyCode;
  /** Mois évalué. */
  month: MonthKey;
  /** Récompenses déjà obtenues (séries, idempotence). */
  history: RewardRecord[];
}

export interface RewardProgress {
  earned: boolean;
  /** 0 à 1. */
  progress: number;
  /** Période de l'attribution (par défaut : le mois évalué). */
  period?: string;
}

export interface RewardDefinition {
  id: string;
  nameKey: string;
  descKey: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  /** `month` : une fois par mois clos ; `item` : une fois par objet (objectif…). */
  scope: 'month' | 'item';
  /** Message de félicitation (écran et voix si activée). */
  messageKey: string;
  evaluate(ctx: RewardContext): RewardProgress[];
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const enoughOps = (ctx: RewardContext) => operationsInMonth(ctx.data, ctx.month, ctx.currency) >= MIN_OPERATIONS;
const opsProgress = (ctx: RewardContext) => clamp(operationsInMonth(ctx.data, ctx.month, ctx.currency) / MIN_OPERATIONS);

/** Part des enveloppes budgétées tenues dans le mois (null : aucun budget fixé). */
function budgetRespect(ctx: RewardContext): number | null {
  const s = envelopeStatuses(ctx.data.envelopes, ctx.data.transactions, ctx.data.budgets, ctx.month, ctx.currency).filter((x) => x.budget > 0 && hasDefinedBudget(x.envelope, ctx.month, ctx.data.budgets));
  if (!s.length) return null;
  return s.filter((x) => x.spent <= x.budget).length / s.length;
}

const earnedIn = (history: RewardRecord[], id: string, month: MonthKey) => history.some((r) => r.rewardId === id && r.period === month);

export const REWARDS: RewardDefinition[] = [
  {
    id: 'budget_master',
    nameKey: 'reward.budget_master.name',
    descKey: 'reward.budget_master.desc',
    icon: 'ribbon',
    tier: 'silver',
    scope: 'month',
    messageKey: 'reward.budget_master.message',
    evaluate(ctx) {
      const r = budgetRespect(ctx);
      if (r === null) return [{ earned: false, progress: 0 }];
      return [{ earned: enoughOps(ctx) && r === 1, progress: Math.min(r, opsProgress(ctx)) }];
    },
  },
  {
    id: 'regular_saver',
    nameKey: 'reward.regular_saver.name',
    descKey: 'reward.regular_saver.desc',
    icon: 'wallet',
    tier: 'bronze',
    scope: 'month',
    messageKey: 'reward.regular_saver.message',
    evaluate(ctx) {
      const saved = savedInMonth(ctx.data, ctx.month, ctx.currency);
      return [{ earned: enoughOps(ctx) && saved, progress: saved ? opsProgress(ctx) : 0 }];
    },
  },
  {
    id: 'goal_achieved',
    nameKey: 'reward.goal_achieved.name',
    descKey: 'reward.goal_achieved.desc',
    icon: 'trophy',
    tier: 'gold',
    scope: 'item',
    messageKey: 'reward.goal_achieved.message',
    evaluate(ctx) {
      // Même critère que la célébration de l'objectif (shouldCelebrate) : montant cible atteint.
      // Anti-triche : au moins une contribution enregistrée (un objectif créé « déjà rempli » ne compte pas).
      const contributed = (g: Goal) => ctx.data.goalContributions.some((c) => !c.deleted && c.goalId === g.id && c.amount > 0);
      const reached = ctx.data.goals.filter((g: Goal) => !g.deleted && g.status !== 'abandoned' && g.targetAmount > 0 && g.currency === ctx.currency && contributed(g) && goalSaved(g, ctx.data.goalContributions) >= g.targetAmount);
      return reached.map((g) => ({ earned: true, progress: 1, period: g.id }));
    },
  },
  {
    id: 'emergency_fund',
    nameKey: 'reward.emergency_fund.name',
    descKey: 'reward.emergency_fund.desc',
    icon: 'shield-checkmark',
    tier: 'silver',
    scope: 'item',
    messageKey: 'reward.emergency_fund.message',
    evaluate(ctx) {
      if (!hasEmergencyFund(ctx.data.goals)) return [{ earned: false, progress: 0 }];
      const g = ctx.data.goals.find((x) => !x.deleted && x.templateId === 'emergency_fund')!;
      // Seules les contributions enregistrées comptent (pas le montant de départ déclaré).
      const saved = ctx.data.goalContributions.filter((c) => !c.deleted && c.goalId === g.id).reduce((n, c) => n + c.amount, 0);
      // Fonds d'urgence « constitué » : au moins un tiers de la cible (≈ 1 mois de dépenses sur 3).
      const p = g.targetAmount > 0 ? clamp(saved / (g.targetAmount / 3)) : saved > 0 ? 1 : 0;
      return [{ earned: p >= 1, progress: p, period: g.id }];
    },
  },
  {
    id: 'debt_master',
    nameKey: 'reward.debt_master.name',
    descKey: 'reward.debt_master.desc',
    icon: 'checkmark-done',
    tier: 'silver',
    scope: 'month',
    messageKey: 'reward.debt_master.message',
    evaluate(ctx) {
      const debts = ctx.data.debts.filter((d) => !d.deleted && d.direction === 'i_owe' && d.currency === ctx.currency && d.status === 'active');
      const paidThisMonth = ctx.data.debtPayments.some((p) => !p.deleted && monthKey(p.date) === ctx.month && debts.some((d) => d.id === p.debtId));
      if (!debts.length || !paidThisMonth) return [{ earned: false, progress: 0 }];
      // Fin du mois évalué : aucune échéance en retard.
      const end = `${ctx.month}-28` as ISODate;
      const late = debts.some((d) => {
        const s = debtStatus(d, ctx.data.debtPayments, end);
        return !s.settled && s.daysToDue !== null && s.daysToDue < 0;
      });
      return [{ earned: enoughOps(ctx) && !late, progress: late ? 0.5 : opsProgress(ctx) }];
    },
  },
  {
    id: 'discipline',
    nameKey: 'reward.discipline.name',
    descKey: 'reward.discipline.desc',
    icon: 'flame',
    tier: 'gold',
    scope: 'month',
    messageKey: 'reward.discipline.message',
    evaluate(ctx) {
      // Série : budgets tenus 3 mois d'affilée (mois évalué + 2 précédents déjà récompensés).
      const thisMonth = REWARDS[0].evaluate(ctx)[0].earned;
      const m1 = previousMonth(ctx.month);
      const m2 = previousMonth(m1);
      const streak = (thisMonth ? 1 : 0) + (thisMonth && earnedIn(ctx.history, 'budget_master', m1) ? 1 : 0) + (thisMonth && earnedIn(ctx.history, 'budget_master', m1) && earnedIn(ctx.history, 'budget_master', m2) ? 1 : 0);
      return [{ earned: streak >= 3, progress: streak / 3 }];
    },
  },
  {
    id: 'excellent',
    nameKey: 'reward.excellent.name',
    descKey: 'reward.excellent.desc',
    icon: 'star',
    tier: 'gold',
    scope: 'month',
    messageKey: 'reward.excellent.message',
    evaluate(ctx) {
      const b = REWARDS[0].evaluate(ctx)[0];
      const s = REWARDS[1].evaluate(ctx)[0];
      return [{ earned: b.earned && s.earned, progress: (b.progress + s.progress) / 2 }];
    },
  },
];

export const rewardKey = (rewardId: string, period: string) => `${rewardId}_${period}`;

/**
 * Récompenses NOUVELLEMENT obtenues pour le mois évalué (mois clos), jamais
 * celles déjà présentes dans l'historique. Mois sous le seuil d'opérations :
 * aucune récompense « mensuelle ».
 */
export function evaluateRewards(ctx: RewardContext, now: number): RewardRecord[] {
  const have = new Set(ctx.history.map((r) => rewardKey(r.rewardId, r.period)));
  const out: RewardRecord[] = [];
  const history = [...ctx.history];
  for (const def of REWARDS) {
    for (const r of def.evaluate({ ...ctx, history })) {
      if (!r.earned) continue;
      if (def.scope === 'month' && !enoughOps(ctx)) continue;
      const period = r.period ?? ctx.month;
      const key = rewardKey(def.id, period);
      if (have.has(key)) continue;
      have.add(key);
      const rec = { rewardId: def.id, period, earnedAt: now };
      out.push(rec);
      history.push(rec);
    }
  }
  return out;
}

/** Progression du mois en cours (affichage seulement : rien n'est attribué avant la fin du mois). */
export function rewardProgress(ctx: RewardContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of REWARDS) out[def.id] = Math.max(0, ...def.evaluate(ctx).map((r) => r.progress));
  return out;
}

/** Mois à évaluer au lancement : le mois précédent (clos). */
export function monthToEvaluate(today: ISODate): MonthKey {
  return previousMonth(monthKey(today));
}
