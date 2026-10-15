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

/** Droits offerts, écrits par le serveur seul (parrainage : « Plus offert jusqu'au … »). */
export interface Grants {
  plusUntil?: number | null;
}

function subscriptionPlan(sub: Subscription | undefined, now: number): PlanId {
  if (!sub) return 'free';
  if (sub.status !== 'active' && sub.status !== 'trialing') return 'free';
  if (sub.expiresAt && sub.expiresAt < now) return 'free';
  return sub.plan === 'plus' || sub.plan === 'family' ? sub.plan : 'free';
}

/**
 * Formule effective : celle de l'abonnement ; une période « Plus offert » non
 * échue relève une formule gratuite à Plus (jamais une formule supérieure à la baisse).
 */
export function effectivePlan(sub: Subscription | undefined, now = Date.now(), grants?: Grants | null): PlanId {
  const plan = subscriptionPlan(sub, now);
  if (plan === 'free' && typeof grants?.plusUntil === 'number' && grants.plusUntil > now) return 'plus';
  return plan;
}

export function hasAiAssistant(plan: PlanId): boolean {
  return AI_PLANS.includes(plan);
}

/** Voix premium : mêmes formules que l'assistant (feature `voice_premium` côté application). */
/**
 * Créer et organiser une tontine PARTAGÉE (Lot T2) : Plus et Famille. Rejoindre
 * reste gratuit pour tous. Miroir : feature `tontine_group_create` de src/core/subscription.ts.
 */
export function canCreateTontineGroup(plan: PlanId): boolean {
  return plan === 'plus' || plan === 'family';
}

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

/**
 * Essai RENDU quand l'appel au modèle échoue (erreur, délai dépassé, refus, réponse
 * illisible) : seul un appel réussi compte dans le quota. null = rien à rendre
 * (compteur déjà à zéro, ou jour changé entre-temps). PUR.
 */
export function refundVoiceParseUsage(prev: { day?: unknown; count?: unknown }, day: string): { voiceParseDay: string; voiceParse: number } | null {
  const count = prev.day === day ? Number(prev.count ?? 0) : 0;
  return count > 0 ? { voiceParseDay: day, voiceParse: count - 1 } : null;
}

/**
 * Plafond ANTI-ABUS, en plus du quota : 50 tentatives par utilisateur et par jour,
 * échecs compris (jamais rendues), toutes formules.
 */
export const VOICE_PARSE_DAILY_ATTEMPTS = 50;

/** Tentative du jour : autorisée ? et nouvelles valeurs à écrire. PUR. */
export function nextVoiceParseAttempt(prev: { day?: unknown; tries?: unknown }, day: string): { allowed: boolean; patch: { voiceParseTriesDay: string; voiceParseTries: number } } {
  const tries = prev.day === day ? Number(prev.tries ?? 0) : 0;
  if (tries >= VOICE_PARSE_DAILY_ATTEMPTS) return { allowed: false, patch: { voiceParseTriesDay: day, voiceParseTries: tries } };
  return { allowed: true, patch: { voiceParseTriesDay: day, voiceParseTries: tries + 1 } };
}

/**
 * Audit 2026-10 (F5) : plafond quotidien d'essais de codes par compte (aperçu et demande
 * d'une tontine partagée, code de parrainage), sur le modèle de `nextVoiceParseAttempt`.
 */
export const CODE_DAILY_ATTEMPTS = 50;
export function nextCodeAttempt(prev: { day?: unknown; tries?: unknown }, day: string): { allowed: boolean; patch: { codeTriesDay: string; codeTries: number } } {
  const tries = prev.day === day ? Number(prev.tries ?? 0) : 0;
  if (tries >= CODE_DAILY_ATTEMPTS) return { allowed: false, patch: { codeTriesDay: day, codeTries: tries } };
  return { allowed: true, patch: { codeTriesDay: day, codeTries: tries + 1 } };
}
