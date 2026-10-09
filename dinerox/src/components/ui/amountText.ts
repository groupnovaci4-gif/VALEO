/**
 * Découpage d'un montant formaté pour l'affichage — module pur (testé).
 * `formatMoney` (inchangé) place une espace insécable avant un symbole suffixé :
 * « 1 250 000 FCFA » → nombre « 1 250 000 » + devise « FCFA » (affichée plus petite).
 * Tout autre format (devise préfixée « $1,250 », texte sans devise) reste d'un bloc.
 */
export function splitAmount(text: string): { number: string; currency: string | null } {
  const i = text.lastIndexOf(' ');
  if (i <= 0) return { number: text, currency: null };
  const tail = text.slice(i + 1);
  if (!tail || /\d/.test(tail)) return { number: text, currency: null };
  return { number: text.slice(0, i), currency: tail };
}
