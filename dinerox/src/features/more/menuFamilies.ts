/**
 * Couleur du rond de chaque rubrique de « Plus » (tableau du fondateur, 2026-10-21,
 * docs/design-pro-paves-plus/README.md). Une rubrique absente garde le vert.
 */
import type { CircleFamily } from '@/components/ui/circlePalette';

export const MORE_FAMILY: Record<string, CircleFamily> = {
  'history.menu': 'vert',
  'acc.title': 'vert',
  'sav.title': 'vert',
  'intel.title': 'vert',
  'score.cta': 'vert',
  'tontine.title': 'or',
  'nw.title': 'or',
  'fi.title': 'or',
  'reward.title': 'or',
  'notif.title': 'or',
  'more.review': 'or',
  'obl.title': 'rouge',
  'debt.title': 'rouge',
  'season.title': 'terre',
  'fam.title': 'terre',
  'ref.title': 'terre',
  'sim.title': 'bleu',
  'rec.title': 'bleu',
  'cal.title': 'bleu',
  'rep.title': 'bleu',
  'ai.title': 'violet',
  'cat.title': 'violet',
  'sub.title': 'violet',
  'more.whatsappChannel': 'whatsapp',
  'set.title': 'gris',
  'admin.title': 'gris',
};
