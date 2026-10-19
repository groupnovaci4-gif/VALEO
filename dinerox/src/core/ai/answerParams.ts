/**
 * Paramètres des réponses de l'IA (docs/ia-comprend-tout.md §2.1) : lesquels sont des montants
 * (unités mineures → `formatMoney`), des dates (jour) ou des mois. Module PUR, partagé par les
 * écrans (feuille de saisie et « Parler à DineroX »).
 */
import { MONEY_PARAM_KEYS } from '../coach/voice';

export const IA_MONEY_PARAMS: ReadonlySet<string> = new Set([
  ...MONEY_PARAM_KEYS,
  'setAside', 'outside', 'perDay', 'deficit', 'commitments', 'saved', 'advice', 'feasible', 'toReach', 'paid', 'net', 'assets', 'accounts', 'liabilities', 'availableAfter', 'receivables', 'received',
]);
/** Dates affichées au jour (« 5 nov. »). */
export const IA_DATE_PARAMS: ReadonlySet<string> = new Set(['date', 'until', 'late']);
/** Dates affichées au mois (« octobre 2026 »). */
export const IA_MONTH_PARAMS: ReadonlySet<string> = new Set(['month']);

export type ParamKind = 'money' | 'date' | 'month' | 'plain';
export function paramKind(name: string, value: unknown): ParamKind {
  if (typeof value === 'number' && IA_MONEY_PARAMS.has(name)) return 'money';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return IA_MONTH_PARAMS.has(name) ? 'month' : IA_DATE_PARAMS.has(name) ? 'date' : 'plain';
  return 'plain';
}
