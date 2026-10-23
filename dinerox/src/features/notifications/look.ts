/**
 * Pastille d'un message « À lire » (couleur de l'étiquette + icône), module PUR testé
 * (tests/audit-2026-10-23-p2.test.ts).
 */
import type { FinalPalette } from '@/theme/finalPalette';
import type { ToReadItem } from './toRead';

export function look(x: Pick<ToReadItem, 'kind' | 'tone'>, p: FinalPalette): { bg: string; fg: string; icon: string } {
  // J4 : « Votre analyse » = graphique bleu de la maquette, quel que soit le ton.
  if (x.kind === 'analysis') return { bg: p.blueBg, fg: p.blueFg, icon: 'analytics' };
  if (x.tone === 'danger') return { bg: p.alertBg, fg: p.alertFg, icon: 'alert-circle' };
  if (x.tone === 'warning') return { bg: p.goldBg, fg: p.goldFg, icon: 'warning' };
  // L'ampoule violette est celle du « Conseil du jour » : elle suit l'ÉTIQUETTE, jamais le ton (fondateur, 23/10).
  if (x.kind === 'advice') return { bg: p.violetBg, fg: p.violetFg, icon: 'bulb' };
  return { bg: p.blueBg, fg: p.blueFg, icon: 'calendar' };
}
