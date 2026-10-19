/**
 * Pavés (« Effet vert », validé par le fondateur) — module pur (testé : tests/avant-1-6.test.ts).
 *
 * Un pavé est blanc au repos ; tant que le doigt est posé, il passe en fondu à la couleur
 * primaire du thème, texte et icône en `onPrimary` (blanc en clair). Seules des COULEURS
 * varient : jamais d'opacité ni de transform sur le conteneur (règle 13).
 */
import { BIG_TEXT } from '@/theme/tokens';

export const TILE_RADIUS = 18;
export const TILE_FADE_MS = 240;
/** En dessous de cette largeur d'écran, une seule colonne (aucun texte coupé). */
export const TILE_TWO_COLUMNS_MIN_WIDTH = 340;
export const TILE_GAP = 12;

/** Nombre de colonnes de la grille : 2, ou 1 sous 340 px ou avec un texte agrandi. */
export function tileColumns(width: number, fontScale: number): 1 | 2 {
  return width < TILE_TWO_COLUMNS_MIN_WIDTH || fontScale >= BIG_TEXT ? 1 : 2;
}

export interface TileColorInput {
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
}

/** Couleurs du pavé au repos et pendant le toucher. */
export function tileColors(c: TileColorInput) {
  return {
    rest: { background: c.surface, border: c.border, text: c.text, muted: c.textMuted },
    pressed: { background: c.primary, border: c.primary, text: c.onPrimary, muted: c.onPrimary },
  };
}

/** Découpe une liste en rangées de `columns` éléments (la dernière peut être incomplète). */
export function tileRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}

/** Colonnes d'une section de `count` pavés : un pavé seul prend toute la largeur. */
export function gridColumns(count: number, width: number, fontScale: number): 1 | 2 {
  return count <= 1 ? 1 : tileColumns(width, fontScale);
}

/**
 * Glyphe (caractère de la police Ionicons) de l'icône d'un pavé ; « ellipse » pour un nom
 * inconnu. L'icône est un `Animated.Text` : animer `Ionicons` lui-même plante sur Android
 * (pas de `setNativeProps` sur l'icône interne → application figée, tests/defilement.test.ts).
 */
export function tileGlyph(glyphMap: Record<string, number>, name: string): string {
  return String.fromCodePoint(glyphMap[name] ?? glyphMap.ellipse);
}
