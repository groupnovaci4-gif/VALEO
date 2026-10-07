/**
 * Catégories proposées dans la saisie rapide — PUR : les plus récemment
 * utilisées d'abord, complétées par l'ordre habituel, uniquement parmi les
 * catégories qui existent encore chez l'utilisateur.
 */
import type { Category } from '../types';

export function recentCategories(recent: string[], ordered: string[], categories: Pick<Category, 'id' | 'deleted'>[], max = 6): string[] {
  const alive = new Set(categories.filter((c) => !c.deleted).map((c) => c.id));
  const out: string[] = [];
  for (const id of [...recent, ...ordered]) {
    if (out.length >= max) break;
    if (alive.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
