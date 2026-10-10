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

/**
 * 1.9 — Compréhension des notes vocales complexes par l'IA (`parseVoiceEntry`),
 * appels par utilisateur et par jour (validés par le fondateur le 2026-10-10).
 * Famille : par membre. Au-delà : le parseur local de l'application reste seul.
 * Miroir : `AI_VOICE_PARSE_PER_DAY` dans src/core/subscription.ts.
 */
export const VOICE_PARSE_DAILY_LIMIT: Record<PlanId, number> = { free: 3, plus: 20, family: 20 };

const RANK: Record<PlanId, number> = { free: 0, plus: 1, family: 2 };
/** Meilleure des deux formules (membre d'un espace familial : formule du propriétaire). */
export function bestPlan(a: PlanId, b: PlanId): PlanId {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Compteur du jour : autorisé ? et nouvelles valeurs à écrire. PUR. */
export function nextVoiceParseUsage(prev: { day?: unknown; count?: unknown }, day: string, plan: PlanId): { allowed: boolean; patch: { voiceParseDay: string; voiceParse: number } } {
  const count = prev.day === day ? Number(prev.count ?? 0) : 0;
  if (count >= VOICE_PARSE_DAILY_LIMIT[plan]) return { allowed: false, patch: { voiceParseDay: day, voiceParse: count } };
  return { allowed: true, patch: { voiceParseDay: day, voiceParse: count + 1 } };
}
