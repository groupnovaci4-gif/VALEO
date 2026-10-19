/**
 * Écritures LIÉES à retirer avec un document — logique PURE (testée).
 *
 * Une opération et le remboursement / la contribution qu'elle représente vont
 * ensemble : sinon une dette resterait « payée », un objectif garderait un
 * transfert fantôme ou une tontine une cotisation sans opération.
 *
 * Source unique utilisée par `useActions().remove` (application) et, en miroir,
 * par le back-office (`firebase/functions/src/removal.ts`, test de parité).
 * La liste rendue est l'ordre EXACT des suppressions logiques à appliquer après
 * celle du document lui-même (un même document peut y figurer deux fois : le
 * retirer à nouveau ne change rien).
 */
import type { CollectionName, DebtPayment, GoalContribution, TontineEntry, Transaction } from './types';

export interface RemovalTarget {
  col: CollectionName;
  id: string;
}

/** Données VISIBLES (sans les suppressions logiques) nécessaires au calcul. */
export interface RemovalData {
  transactions: Pick<Transaction, 'id' | 'linkedTransactionId'>[];
  debtPayments: Pick<DebtPayment, 'id' | 'transactionId'>[];
  goalContributions: Pick<GoalContribution, 'id' | 'transferId' | 'linkedTransactionId'>[];
  tontineEntries: Pick<TontineEntry, 'id' | 'transactionId'>[];
}

/** Champs de liaison du document retiré (document brut, même déjà marqué supprimé). */
export interface RemovedDoc {
  id: string;
  transactionId?: string | null;
  transferId?: string | null;
}

export function linkedRemovals(d: RemovalData, col: CollectionName, removed: RemovedDoc | undefined, id: string): RemovalTarget[] {
  const out: RemovalTarget[] = [];
  if (col === 'transactions') {
    // Opérations qui l'accompagnent (frais d'un transfert, intérêts d'un remboursement).
    for (const t of d.transactions) if (t.linkedTransactionId === id) out.push({ col: 'transactions', id: t.id });
    for (const p of d.debtPayments) if (p.transactionId === id) out.push({ col: 'debtPayments', id: p.id });
    for (const c of d.goalContributions) if (c.transferId === id) out.push({ col: 'goalContributions', id: c.id });
    // Tontine : l'entrée (cotisation ou cagnotte) part avec son opération.
    for (const te of d.tontineEntries) if (te.transactionId === id) out.push({ col: 'tontineEntries', id: te.id });
    // Utilisation de réserve liée : annulée avec l'opération (et son transfert éventuel).
    for (const c of d.goalContributions) {
      if (c.linkedTransactionId !== id) continue;
      out.push({ col: 'goalContributions', id: c.id });
      if (c.transferId) out.push({ col: 'transactions', id: c.transferId });
    }
  } else if (col === 'debtPayments' || col === 'goalContributions') {
    const txId = removed?.transactionId ?? removed?.transferId;
    const linked = txId ? d.transactions.find((t) => t.id === txId) : undefined;
    if (linked) {
      out.push({ col: 'transactions', id: linked.id });
      // …et les intérêts ou frais qui accompagnent cette opération.
      for (const t of d.transactions) if (t.linkedTransactionId === linked.id) out.push({ col: 'transactions', id: t.id });
    }
  }
  return out;
}
