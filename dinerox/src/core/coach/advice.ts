/**
 * Conseil du jour — module PUR.
 * Le conseil est choisi parmi les recommandations DÉTERMINISTES existantes
 * (`intelligence.recommendations`) : l'IA ne décide ni du conseil ni d'aucun
 * chiffre ; elle peut seulement le reformuler (avec consentement).
 */
import type { Recommendation } from '../intelligence';
import type { ISODate } from '../dates';

/** Conseils sans valeur d'action quotidienne. */
const NOT_ADVICE = new Set(['fixed_ratio_ok']);

/** Même conseil toute la journée, rotation d'un jour à l'autre, priorité aux plus importants. */
export function adviceOfDay(recs: Recommendation[], day: ISODate): Recommendation | null {
  const pool = recs.filter((r) => !NOT_ADVICE.has(r.kind)).sort((a, b) => b.weight - a.weight || a.kind.localeCompare(b.kind));
  if (!pool.length) return null;
  // Les 3 plus importants tournent ; un conseil urgent (danger) reste en tête.
  if (pool[0].severity === 'danger') return pool[0];
  const top = pool.slice(0, 3);
  const n = Number(day.replace(/-/g, '')) % top.length;
  return top[n];
}

const PROMPT = {
  fr: (text: string) => `Explique simplement ce conseil calculé par l'application à partir de mes données, et ce que je pourrais faire concrètement. Reste prudent (estimation, pas de garantie) : « ${text} »`,
  en: (text: string) => `Explain simply this advice computed by the app from my data, and what I could concretely do. Stay cautious (estimate, no guarantee): "${text}"`,
};

/** Question envoyée à l'assistant distant (≤ 500 caractères, limite du serveur). */
export function reformulationQuestion(text: string, language: 'fr' | 'en'): string {
  const room = 500 - PROMPT[language]('').length;
  const clipped = text.length > room ? `${text.slice(0, room - 1)}…` : text;
  return PROMPT[language](clipped);
}
