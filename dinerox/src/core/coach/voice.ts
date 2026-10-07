/**
 * Texte lu à voix haute — module PUR.
 * Par défaut (`speakAmounts` faux), aucun montant n'est prononcé : la voix
 * utilise une variante sans montant (`<clé>.voice`) ou, à défaut, une phrase
 * générique qui renvoie à l'écran. Le montant reste toujours affiché.
 */
import type { CoachEvent } from './events';

/** Paramètres qui sont des montants (unités mineures) — source unique (affichage et voix). */
export const MONEY_PARAM_KEYS: ReadonlySet<string> = new Set([
  'amount', 'over', 'left', 'remaining', 'before', 'monthly', 'total', 'income', 'budget', 'free', 'available', 'savings', 'goals',
  'committed', 'after', 'capacity', 'needed', 'gap', 'spent', 'saving', 'expense', 'incomeBefore', 'planned', 'need', 'target', 'outflows', 'shortfall',
]);

export function hasMoneyParams(params: Record<string, unknown>): boolean {
  return Object.keys(params).some((k) => MONEY_PARAM_KEYS.has(k));
}

export function voiceMessage(e: Pick<CoachEvent, 'textKey' | 'params' | 'severity'>, speakAmounts: boolean, hasKey: (k: string) => boolean): { key: string; params: Record<string, string | number> } {
  if (speakAmounts || !hasMoneyParams(e.params)) return { key: e.textKey, params: e.params };
  const variant = `${e.textKey}.voice`;
  if (hasKey(variant)) return { key: variant, params: e.params };
  return { key: `coach.voice.generic.${e.severity}`, params: {} };
}

/**
 * Texte prêt à être prononcé : retire pictogrammes et émojis (la synthèse les
 * lirait, « cercle rouge ») et assemble les lignes affichées en phrases — un
 * point seulement si la ligne ne se termine pas déjà par une ponctuation.
 * Aucun mot n'est ajouté ni retiré : on lit ce qui est affiché.
 */
export function speakable(parts: string | readonly string[]): string {
  const clean = (s: string) =>
    s
      .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
      .replace(/^\s*[•·\-–]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  const lines = (typeof parts === 'string' ? [parts] : parts).map(clean).filter(Boolean);
  return lines.reduce((acc, l) => (!acc ? l : /[.!?…:;]$/.test(acc) ? `${acc} ${l}` : `${acc}. ${l}`), '');
}
