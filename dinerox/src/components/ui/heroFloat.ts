/**
 * Carte verte FLOTTANTE (Accueil, Objectifs, Plus ; maquette validée, CSS `f4`, fondateur 2026-10-21) :
 * marges 8 dp, rayon 22 ; clair : ombre verte marquée ; sombre : liseré clair 1 dp + ombre noire +
 * léger halo vert. `boxShadow` (nouvelle architecture, Android et web) : valeurs exactes de la maquette.
 * Style FIXE (ne dépend d'aucun état) : la carte n'englobe aucun champ de saisie (règle 13).
 */
export function heroFloat(dark: boolean) {
  return {
    marginHorizontal: 8,
    borderRadius: 22,
    boxShadow: dark
      ? '0px 0px 0px 1px rgba(255,255,255,0.09), 0px 26px 44px -10px rgba(0,0,0,0.95), 0px 0px 36px rgba(79,176,143,0.16)'
      : '0px 26px 44px -14px rgba(15,74,58,0.62), 0px 12px 22px -8px rgba(15,74,58,0.34), 0px 2px 5px rgba(15,74,58,0.18)',
  } as const;
}
