/**
 * Enveloppe en BULLE (refonte finale B7 accueil, C2 budget) — module pur, testé : couleur de
 * l'anneau et texte de l'état, à partir de l'état CALCULÉ par core/budget (aucun calcul ici).
 * Dépassée : rouge « Dépassé de … » ; épuisée : or « Épuisée » ; presque épuisée : or « Reste … » ;
 * sinon vert « Reste … ». Le mot est toujours écrit (jamais la couleur seule).
 */
import type { EnvelopeStatus } from '@/core/budget';
import type { FinalPalette } from '@/theme/finalPalette';

/** Tailles exactes du HTML : accueil (`normal`, anneau 76/6, icône 34) ; Budget (`large`, 84/7, 38). */
export const BUBBLE_SIZES = {
  normal: { ring: 76, stroke: 6, icon: 34, rowGap: 16, padV: 16 },
  large: { ring: 84, stroke: 7, icon: 38, rowGap: 18, padV: 18 },
} as const;

export function bubbleLook(s: Pick<EnvelopeStatus, 'remaining' | 'level' | 'percent'>): { ring: keyof Pick<FinalPalette, 'ringOk' | 'ringFull' | 'ringOver'>; text: 'over' | 'reached' | 'left' } {
  if (s.remaining < 0) return { ring: 'ringOver', text: 'over' };
  if (s.level === 'reached') return { ring: 'ringFull', text: 'reached' };
  if (s.level === 'warning' || s.level === 'critical') return { ring: 'ringFull', text: 'left' };
  return { ring: 'ringOk', text: 'left' };
}
