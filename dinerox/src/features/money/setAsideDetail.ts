/**
 * Détail de « Mis de côté » (accueil, carte compacte ; fondateur, 2026-10-21, point 8 de la
 * maquette validée). AUCUN calcul nouveau : chaque ligne vient des fonctions de `core/position`
 * (`goalBacking`, comptes de `positionOf`) et de `core/tontineLedger` (`tontineLedgerPositions`,
 * appelé tontine par tontine). La somme des lignes = `position.setAside`
 * (comptes d'épargne + mises de côté sur des comptes courants + hors comptes + créances de tontine).
 */
import type { SpaceData } from '@/core/types';
import type { ISODate } from '@/core/dates';
import { goalBacking, type Position } from '@/core/position';
import { tontineLedgerPositions } from '@/core/tontineLedger';

export type SetAsideLine =
  /** Compte d'épargne : son solde, avec les objectifs ou réserves qui y sont posés. */
  | { kind: 'savings'; id: string; account: string; goals: string[]; amount: number }
  /** Objectif ou réserve mis de côté sur un compte courant. */
  | { kind: 'onAccount'; id: string; goal: string; account: string; amount: number }
  /** Objectif ou réserve « déclaré au départ » (hors de vos comptes). */
  | { kind: 'declared'; id: string; goal: string; amount: number }
  /** Tontine : versé, à recevoir à votre tour. */
  | { kind: 'tontine'; id: string; name: string; amount: number };

type DetailData = Pick<SpaceData, 'accounts' | 'transactions' | 'goals' | 'goalContributions'> & Partial<Pick<SpaceData, 'tontines' | 'tontineEntries'>>;

export function setAsideDetail(d: DetailData, position: Position, today: ISODate): { inAccounts: SetAsideLine[]; elsewhere: SetAsideLine[] } {
  const currency = position.currency;
  const backing = goalBacking(d, currency, today);
  const goalName = new Map(d.goals.map((g) => [g.id, g.name]));
  const inAccounts: SetAsideLine[] = [];
  // Comptes d'épargne d'abord (comme la maquette), puis les comptes courants, dans l'ordre d'affichage.
  const accounts = [...d.accounts].filter((a) => position.accounts[a.id]).sort((a, b) => Number(b.isSavings) - Number(a.isSavings) || a.order - b.order);
  for (const a of accounts) {
    const pos = position.accounts[a.id];
    const goalsHere = [...backing.entries()].filter(([, b]) => (b.byAccount[a.id] ?? 0) > 0);
    if (pos.isSavings) {
      const amount = Math.max(0, pos.balance);
      if (amount > 0) inAccounts.push({ kind: 'savings', id: a.id, account: a.name, goals: goalsHere.map(([id]) => goalName.get(id) ?? ''), amount });
    } else if (pos.setAside > 0) {
      for (const [id, b] of goalsHere) inAccounts.push({ kind: 'onAccount', id: `${id}@${a.id}`, goal: goalName.get(id) ?? '', account: a.name, amount: b.byAccount[a.id] });
    }
  }
  const elsewhere: SetAsideLine[] = [];
  for (const [id, b] of backing) if (b.outside > 0) elsewhere.push({ kind: 'declared', id, goal: goalName.get(id) ?? '', amount: b.outside });
  for (const t of d.tontines ?? []) {
    const amount = tontineLedgerPositions({ tontines: [t], tontineEntries: d.tontineEntries ?? [] }, currency, today).receivable;
    if (amount > 0) elsewhere.push({ kind: 'tontine', id: t.id, name: t.name, amount });
  }
  return { inAccounts, elsewhere };
}
