/**
 * Abonnements : niveaux, droits et limites.
 *
 * Aucun paiement n'est intégré ici. Le plan de l'utilisateur est écrit par le
 * SERVEUR (Cloud Function de vérification d'achat) ; le client ne fait que
 * lire ses droits. Les fournisseurs (Google Play, App Store, Stripe, Mobile
 * Money) se brancheront derrière `services/billing.ts`.
 */
import type { PlanId, Subscription } from './types';

export type Feature =
  | 'ai_assistant'
  | 'auto_budget'
  | 'multiple_goals'
  | 'advanced_insights'
  | 'family'
  | 'family_advanced'
  | 'multiple_accounts'
  | 'net_worth'
  | 'advanced_reports'
  | 'export';

export interface PlanDefinition {
  id: PlanId;
  /** Prix indicatif mensuel en FCFA (affichage). */
  priceXof: number;
  features: Feature[];
  limits: { goals: number; accounts: number; envelopes: number; familyMembers: number };
}

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    priceXof: 0,
    features: ['export'],
    limits: { goals: 2, accounts: 3, envelopes: 8, familyMembers: 0 },
  },
  plus: {
    id: 'plus',
    priceXof: 1500,
    features: ['export', 'ai_assistant', 'auto_budget', 'multiple_goals', 'advanced_insights', 'family', 'multiple_accounts'],
    limits: { goals: 20, accounts: 10, envelopes: 30, familyMembers: 2 },
  },
  family: {
    id: 'family',
    priceXof: 3000,
    features: [
      'export',
      'ai_assistant',
      'auto_budget',
      'multiple_goals',
      'advanced_insights',
      'family',
      'family_advanced',
      'multiple_accounts',
      'net_worth',
      'advanced_reports',
    ],
    limits: { goals: UNLIMITED, accounts: UNLIMITED, envelopes: UNLIMITED, familyMembers: 8 },
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'plus', 'family'];

/** Plan effectif : un abonnement expiré ou annulé retombe sur « free ». */
export function effectivePlan(sub: Subscription | null | undefined, now: number = Date.now()): PlanId {
  if (!sub) return 'free';
  if (sub.status !== 'active' && sub.status !== 'trialing') return 'free';
  if (sub.expiresAt && sub.expiresAt < now) return 'free';
  return sub.plan in PLANS ? sub.plan : 'free';
}

export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

export type LimitKey = keyof PlanDefinition['limits'];

/** Vrai si l'on peut ajouter un élément de plus (count = nombre actuel). */
export function withinLimit(plan: PlanId, key: LimitKey, count: number): boolean {
  return count < PLANS[plan].limits[key];
}

/** Plus petit plan qui débloque une fonctionnalité (pour l'écran d'offre). */
export function minimumPlanFor(feature: Feature): PlanId {
  return PLAN_ORDER.find((p) => hasFeature(p, feature)) ?? 'family';
}

export function defaultSubscription(now: number = Date.now()): Subscription {
  return { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: now };
}
