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

/**
 * Refonte finale F1 (ecrans/plus-*.html) : icônes PASTEL — carré de fond doux, icône de la couleur
 * de la famille. Mêmes familles que les ronds (tableau du fondateur), valeurs exactes du HTML,
 * [clair, sombre].
 */
export const PASTEL_PALETTE: Record<CircleFamily, { bg: readonly [string, string]; fg: readonly [string, string] }> = {
  vert: { bg: ['#DCEBE3', '#1E3A31'], fg: ['#1E6B52', '#7FD1B0'] },
  or: { bg: ['#F5E6C4', '#3D3018'], fg: ['#9A6400', '#E8B85A'] },
  rouge: { bg: ['#F6DAD7', '#42201D'], fg: ['#B3261E', '#F08A82'] },
  terre: { bg: ['#F5DDD1', '#43271C'], fg: ['#B0502A', '#F09A75'] },
  bleu: { bg: ['#DBE6F2', '#1E2D3D'], fg: ['#2D5F8F', '#8DB8E3'] },
  violet: { bg: ['#EEDDEA', '#37223A'], fg: ['#7B3F70', '#D79CCB'] },
  whatsapp: { bg: ['#D8F0E0', '#173A25'], fg: ['#178A45', '#178A45'] },
  gris: { bg: ['#E6E8EA', '#2A2F33'], fg: ['#55606A', '#B5BEC6'] },
};

export function pastelColors(family: CircleFamily, dark: boolean): { bg: string; fg: string } {
  const p = PASTEL_PALETTE[family];
  return { bg: p.bg[dark ? 1 : 0], fg: p.fg[dark ? 1 : 0] };
}

/** Grille pastel : 4 colonnes ; 3 si le texte est agrandi ou si l'écran fait moins de 340 dp (A8). */
export function pastelColumns(width: number, fontScale: number): 3 | 4 {
  return width < CIRCLE_THREE_COLUMNS_MIN_WIDTH || fontScale >= BIG_TEXT ? 3 : 4;
}
