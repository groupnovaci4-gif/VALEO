/**
 * Règles de mise en page liées au texte système agrandi — module pur (testé).
 * Voir docs/design-system.md §2.3 et §8.13.
 */

/** Plafond d'agrandissement des libellés d'onglets. */
export const TAB_CAP = 1.6;

/**
 * Facteur des libellés d'onglets. Ils suivent le texte système jusqu'à 160 % ; sur un
 * écran étroit à très grande taille, les 5 libellés ne tiennent plus : ils passent TOUS
 * à 85 % (repli validé). Mesure : à 320 dp, tout tient jusqu'à 130 % ; à 360 dp, jusqu'à 160 %.
 */
export function tabLabelScale(width: number, fontScale: number): number {
  const scale = Math.min(Math.max(fontScale, 1), TAB_CAP);
  return width / scale < 215 ? 0.85 : 1;
}

/** Marge horizontale d'un emplacement d'onglet (2 dp de chaque côté). */
const TAB_PAD = 4;

/**
 * Largeur relative de chaque emplacement de la barre d'onglets, à partir de la largeur
 * MESURÉE de chaque libellé sur l'appareil (police, langue et taille de texte réelles) :
 * un libellé long (« Objectifs ») reçoit plus de place qu'un court (« Plus »). Si les
 * libellés ne tiennent pas à pleine taille, ils passent tous à 85 % (repli validé).
 * `minWidths` : largeur minimale de chaque emplacement (icône, bouton central).
 */
export function tabLayout(labelWidths: number[], minWidths: number[], available: number): { weights: number[]; scale: number } {
  const slot = (factor: number) => labelWidths.map((w, i) => Math.max(w * factor, minWidths[i] ?? 0) + TAB_PAD);
  const full = slot(1);
  const sum = full.reduce((a, b) => a + b, 0);
  if (sum <= available) return { weights: full, scale: 1 };
  return { weights: slot(0.85), scale: 0.85 };
}
