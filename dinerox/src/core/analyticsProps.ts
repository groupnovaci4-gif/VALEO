/**
 * Propriétés des événements analytiques — module PUR (liste blanche).
 * Aucune donnée personnelle ni financière : ni montant, ni texte prononcé ou
 * écrit, ni bénéficiaire, ni catégorie, ni nom, ni e-mail.
 */
export type Props = Record<string, string | number | boolean>;

/** Seules ces propriétés, non identifiantes, peuvent être transmises. */
export const ALLOWED_PROPS = new Set(['method', 'plan', 'intent', 'source', 'step', 'kind', 'count', 'reason', 'to']);

export function sanitize(props: Record<string, unknown> = {}): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return out;
}
