/**
 * Règles de mise en page liées au texte système agrandi — module pur (testé).
 * Voir docs/design-system.md §2.3 et §8.13.
 */
import { darkColorsV2, lightColorsV2 } from './tokens';

/**
 * Couleurs de la barre du bas, EXACTEMENT celles de la maquette finale (`.tab`) : fond = surface,
 * bordure = séparateur, onglet actif et pilule « Saisir » = couleur de la marque, inactif = texte
 * tertiaire, micro = texte posé sur la marque (blanc en clair, foncé en sombre). La barre est hors
 * de `DesignV2` : elle lit donc la palette v2 directement, jamais les anciennes couleurs du thème.
 */
export function tabBarColors(dark: boolean) {
  const c = dark ? darkColorsV2 : lightColorsV2;
  return { background: c.surface, border: c.border, active: c.primary, inactive: c.textSubtle, pill: c.primary, mic: c.onPrimary };
}

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

/** Le bouton central (micro) dépasse au-dessus de la barre d'onglets de cette hauteur au plus. */
export const MIC_LIFT = 23;

/**
 * Hauteur de la barre d'onglets : icône 24 + libellé (suivant le texte agrandi, sinon il
 * serait coupé) + marges, plus la marge basse du système (barre de gestes ou à 3 boutons).
 */
export function tabBarHeight(labelScale: number, fontScale: number, insetBottom: number): number {
  const labelLine = 16 * labelScale * Math.min(Math.max(fontScale, 1), TAB_CAP);
  return Math.round(46 + labelLine) + insetBottom;
}

/** Écart entre le message (toast) et le haut du micro central. */
const TOAST_GAP = 8;

/**
 * Bas du message (toast), depuis le bas de l'écran. Hors onglets : 90 dp au-dessus de la
 * marge du système. Barre d'onglets affichée : au-dessus du micro central, qui grandit avec
 * le texte agrandi (à 130 %, 90 dp ne suffisent plus).
 */
export function toastBottom(insetBottom: number, tabBar: number | null): number {
  const base = insetBottom + 90;
  return tabBar === null ? base : Math.max(base, tabBar + MIC_LIFT + TOAST_GAP);
}

/**
 * Marge basse du système (barre de gestes ou à 3 boutons) pour le pied d'un écran, gérée une
 * seule fois : par la zone sûre si l'écran la demande (`edges` avec 'bottom'), sinon par le pied ;
 * jamais sous les onglets (la barre d'onglets l'absorbe déjà).
 *  - `footerPad` : ajouté sous le pied (16 dp + cette marge) ;
 *  - `keyboardOffset` : clavier ouvert, le pied redescend d'autant (la hauteur du clavier
 *    comprend la barre du système qu'il recouvre) et colle au clavier, sans trou.
 */
export function footerInsets(insetBottom: number, safeAreaBottom: boolean, inTabs: boolean): { footerPad: number; keyboardOffset: number } {
  const system = inTabs ? 0 : insetBottom;
  return { footerPad: safeAreaBottom ? 0 : system, keyboardOffset: system };
}
