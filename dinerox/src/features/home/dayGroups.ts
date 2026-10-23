/**
 * Accueil, refonte finale B6 : dernières opérations GROUPÉES PAR JOUR (module pur, testé).
 * Aucun calcul d'argent : regroupement d'affichage seulement, dans l'ordre reçu.
 */
import type { Language } from '@/core/types';

/**
 * Sens d'un montant dans une liste d'opérations (audit du 23/10, R9) : `out` = « − », `in` = « + »
 * (revenu, ajustement à la hausse), `none` = sans signe (transfert…). Le même pour l'Accueil et
 * l'historique.
 */
export function amountDirection(tx: { type: string; direction?: 'in' | 'out' | null }): 'in' | 'out' | 'none' {
  if (tx.type === 'expense' || (tx.type === 'adjustment' && tx.direction === 'out')) return 'out';
  if (tx.type === 'income' || tx.type === 'adjustment') return 'in';
  return 'none';
}

/** Un groupe par jour, dans l'ordre des opérations reçues (déjà triées, la plus récente d'abord). */
export function groupByDay<T extends { id: string; date: string }>(txs: T[]): { date: string; items: T[] }[] {
  const out: { date: string; items: T[] }[] = [];
  for (const tx of txs) {
    const last = out[out.length - 1];
    if (last && last.date === tx.date) last.items.push(tx);
    else out.push({ date: tx.date, items: [tx] });
  }
  return out;
}

const SHORT: Record<Language, string[]> = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** En-tête d'un jour : « 20 oct. » / « Oct 20 » (mis en capitales à l'affichage, comme la maquette). */
export function dayLabel(lang: Language, date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const month = (SHORT[lang] ?? SHORT.fr)[m - 1];
  return lang === 'en' ? `${month} ${d}` : `${d} ${month}`;
}
