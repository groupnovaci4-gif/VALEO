/**
 * MIROIR de src/core/removal.ts (application) : écritures liées à retirer avec
 * un document. Le tsconfig des Functions ne peut pas importer le code de l'app
 * (rootDir) : ce fichier en est une copie conforme, vérifiée par le test de
 * parité tests/backoffice-parity.test.ts. Modifier les deux ensemble.
 */
export type CollectionName = string;

export interface RemovalTarget {
  col: CollectionName;
  id: string;
}

export interface RemovalData {
  transactions: { id: string }[];
  debtPayments: { id: string; transactionId?: string | null }[];
  goalContributions: { id: string; transferId?: string | null; linkedTransactionId?: string | null }[];
  tontineEntries: { id: string; transactionId?: string | null }[];
}

export interface RemovedDoc {
  id: string;
  transactionId?: string | null;
  transferId?: string | null;
}

export function linkedRemovals(d: RemovalData, col: CollectionName, removed: RemovedDoc | undefined, id: string): RemovalTarget[] {
  const out: RemovalTarget[] = [];
  if (col === 'transactions') {
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
    if (linked) out.push({ col: 'transactions', id: linked.id });
  }
  return out;
}

/** Les mêmes cibles sans doublon, dans l'ordre (le serveur écrit chaque document une fois). */
export function uniqueTargets(targets: RemovalTarget[]): RemovalTarget[] {
  const seen = new Set<string>();
  return targets.filter((t) => {
    const k = `${t.col}/${t.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Tombe logique, exactement comme SyncEngine.remove + stamp() de l'app, plus le marqueur back-office. */
export function tombstoneUpdatedAt(previous: unknown, now: number): number {
  const prev = typeof previous === 'number' && Number.isFinite(previous) ? previous : 0;
  return Math.max(now, prev + 1);
}
