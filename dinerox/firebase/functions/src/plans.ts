/**
 * Droits des formules, côté serveur. Doit rester identique à
 * src/core/subscription.ts de l'application (le serveur fait foi).
 */
export type PlanId = 'free' | 'plus' | 'family';

interface Subscription {
  plan?: string;
  status?: string;
  expiresAt?: number | null;
}

export const FAMILY_MEMBER_LIMIT: Record<PlanId, number> = { free: 0, plus: 2, family: 8 };
const AI_PLANS: PlanId[] = ['plus', 'family'];

export function effectivePlan(sub: Subscription | undefined, now = Date.now()): PlanId {
  if (!sub) return 'free';
  if (sub.status !== 'active' && sub.status !== 'trialing') return 'free';
  if (sub.expiresAt && sub.expiresAt < now) return 'free';
  return sub.plan === 'plus' || sub.plan === 'family' ? sub.plan : 'free';
}

export function hasAiAssistant(plan: PlanId): boolean {
  return AI_PLANS.includes(plan);
}

/** Voix premium : mêmes formules que l'assistant (feature `voice_premium` côté application). */
export function hasVoicePremium(plan: PlanId): boolean {
  return plan === 'plus' || plan === 'family';
}
