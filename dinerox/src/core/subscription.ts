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
  | 'export'
  /** Voix premium du coach (Cloud Function `speak`). */
  | 'voice_premium'
  /** Saisie vocale sans limite quotidienne (la saisie au clavier et la phrase écrite restent illimitées pour tous). */
  | 'voice_entry_unlimited'
  /** Plusieurs réserves (famille, cérémonies…) ; la formule gratuite en a une. */
  | 'reserve_multiple'
  /** Simulateur « Puis-je contribuer ? » sans limite mensuelle. */
  | 'contribution_simulator'
  /** Moments forts de l'année sans limite (la formule gratuite en a un). */
  | 'seasonal_planning'
  /** Réserve partagée dans un espace familial. */
  | 'family_reserve';

export interface PlanDefinition {
  id: PlanId;
  /** Prix indicatif mensuel en FCFA (affichage). */
  priceXof: number;
  features: Feature[];
  /**
   * `voiceEntriesPerDay` : saisies vocales validées par jour. `reserves`, `simulationsPerMonth`
   * et `seasons` (1.6) : réserves, simulations « Puis-je contribuer ? » par mois et moments forts
   * — comptés à part, ils ne réduisent jamais la limite d'objectifs existante.
   */
  limits: { goals: number; accounts: number; envelopes: number; familyMembers: number; voiceEntriesPerDay: number; reserves: number; simulationsPerMonth: number; seasons: number };
}

const UNLIMITED = Number.POSITIVE_INFINITY;
/** Saisies vocales par jour en formule gratuite (constante facile à changer). */
export const FREE_VOICE_ENTRIES_PER_DAY = 5;
/** Formule gratuite, réserve famille (constantes faciles à changer). */
export const FREE_RESERVES = 1;
export const FREE_SIMULATIONS_PER_MONTH = 3;
export const FREE_SEASONS = 1;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    priceXof: 0,
    features: ['export'],
    limits: { goals: 2, accounts: 3, envelopes: 8, familyMembers: 0, voiceEntriesPerDay: FREE_VOICE_ENTRIES_PER_DAY, reserves: FREE_RESERVES, simulationsPerMonth: FREE_SIMULATIONS_PER_MONTH, seasons: FREE_SEASONS },
  },
  plus: {
    id: 'plus',
    priceXof: 1500,
    features: ['export', 'ai_assistant', 'auto_budget', 'multiple_goals', 'advanced_insights', 'family', 'multiple_accounts', 'voice_premium', 'voice_entry_unlimited', 'reserve_multiple', 'contribution_simulator', 'seasonal_planning'],
    limits: { goals: 20, accounts: 10, envelopes: 30, familyMembers: 2, voiceEntriesPerDay: UNLIMITED, reserves: UNLIMITED, simulationsPerMonth: UNLIMITED, seasons: UNLIMITED },
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
      'voice_premium',
      'voice_entry_unlimited',
      'reserve_multiple',
      'contribution_simulator',
      'seasonal_planning',
      'family_reserve',
    ],
    limits: { goals: UNLIMITED, accounts: UNLIMITED, envelopes: UNLIMITED, familyMembers: 8, voiceEntriesPerDay: UNLIMITED, reserves: UNLIMITED, simulationsPerMonth: UNLIMITED, seasons: UNLIMITED },
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
