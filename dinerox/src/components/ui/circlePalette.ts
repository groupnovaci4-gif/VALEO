/**
 * Ronds de couleur PLEINE (étape 4 ; palette exacte du fondateur, docs/design-pro-paves-plus,
 * 2026-10-21) : menus et accès (Plus, Budget, Accueil). Icône Ionicons PLEINE, blanche en clair,
 * `#13120F` en sombre. Module pur (testé).
 */
import { BIG_TEXT } from '@/theme/tokens';

export const CIRCLE_PALETTE = {
  vert: ['#1E6B52', '#7FD1B0'],
  or: ['#9A6400', '#E8B85A'],
  rouge: ['#B3261E', '#F08A82'],
  terre: ['#B0502A', '#F09A75'],
  bleu: ['#2D5F8F', '#8DB8E3'],
  violet: ['#7B3F70', '#D79CCB'],
  whatsapp: ['#178A45', '#5FD38E'],
  gris: ['#55606A', '#B5BEC6'],
} as const;

export type CircleFamily = keyof typeof CIRCLE_PALETTE;

export function circleColors(family: CircleFamily, dark: boolean): { bg: string; fg: string } {
  return { bg: CIRCLE_PALETTE[family][dark ? 1 : 0], fg: dark ? '#13120F' : '#FFFFFF' };
}

/** Largeur sous laquelle la grille passe à deux colonnes (comme les pavés). */
export const CIRCLE_THREE_COLUMNS_MIN_WIDTH = 340;

/** 3 colonnes ; 2 si le texte est agrandi ou si l'écran fait moins de 340 dp. */
export function circleColumns(width: number, fontScale: number): 2 | 3 {
  return width < CIRCLE_THREE_COLUMNS_MIN_WIDTH || fontScale >= BIG_TEXT ? 2 : 3;
}
