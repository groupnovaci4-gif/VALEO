import { describe, expect, it } from 'vitest';
import { linkedRemovals, type RemovalData, type RemovalTarget, type RemovedDoc } from '../src/core/removal';
import type { CollectionName } from '../src/core/types';

/**
 * Copie conforme de la cascade qui vivait dans `useActions().remove` avant son
 * extraction (commit 1fa1e92) : elle enregistre les appels `e.remove` dans
 * l'ordre. L'extraction doit produire EXACTEMENT la même suite.
 */
function legacyCascade(d: RemovalData, col: CollectionName, doc: RemovedDoc | undefined, id: string): RemovalTarget[] {
  const calls: RemovalTarget[] = [];
  const remove = (c: CollectionName, i: string) => calls.push({ col: c, id: i });
  if (col === 'transactions') {
    for (const p of d.debtPayments) if (p.transactionId === id) remove('debtPayments', p.id);
    for (const c of d.goalContributions) if (c.transferId === id) remove('goalContributions', c.id);
    for (const te of d.tontineEntries) if (te.transactionId === id) remove('tontineEntries', te.id);
    for (const c of d.goalContributions) {
      if (c.linkedTransactionId !== id) continue;
      remove('goalContributions', c.id);
      if (c.transferId) remove('transactions', c.transferId);
    }
  } else if (col === 'debtPayments' || col === 'goalContributions') {
    const txId = doc?.transactionId ?? doc?.transferId;
    const linked = txId ? d.transactions.find((t) => t.id === txId) : undefined;
    if (linked) remove('transactions', linked.id);
  }
  return calls;
}

const data: RemovalData = {
  transactions: [{ id: 'tx_exp' }, { id: 'tx_debt' }, { id: 'tx_tr' }, { id: 'tx_ton' }, { id: 'tx_res' }, { id: 'tx_res_tr' }],
  debtPayments: [{ id: 'dp1', transactionId: 'tx_debt' }, { id: 'dp2', transactionId: null }],
  goalContributions: [
    { id: 'gc_tr', transferId: 'tx_tr', linkedTransactionId: null },
    { id: 'gc_res', transferId: 'tx_res_tr', linkedTransactionId: 'tx_res' },
    { id: 'gc_plain', transferId: null, linkedTransactionId: null },
  ],
  tontineEntries: [{ id: 'tne1', transactionId: 'tx_ton' }],
};

describe('écritures liées à une suppression (core/removal)', () => {
  it('opération remboursant une dette : le remboursement part avec elle', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'tx_debt' }, 'tx_debt')).toEqual([{ col: 'debtPayments', id: 'dp1' }]);
  });
  it('transfert vers un objectif : la contribution part avec lui', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'tx_tr' }, 'tx_tr')).toEqual([{ col: 'goalContributions', id: 'gc_tr' }]);
  });
  it('cotisation de tontine : l’entrée part avec l’opération', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'tx_ton' }, 'tx_ton')).toEqual([{ col: 'tontineEntries', id: 'tne1' }]);
  });
  it('dépense prise sur une réserve : l’utilisation et son transfert partent avec elle', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'tx_res' }, 'tx_res')).toEqual([
      { col: 'goalContributions', id: 'gc_res' },
      { col: 'transactions', id: 'tx_res_tr' },
    ]);
  });
  it('dans l’autre sens : supprimer un remboursement ou une contribution retire son opération', () => {
    expect(linkedRemovals(data, 'debtPayments', { id: 'dp1', transactionId: 'tx_debt' }, 'dp1')).toEqual([{ col: 'transactions', id: 'tx_debt' }]);
    expect(linkedRemovals(data, 'goalContributions', { id: 'gc_tr', transferId: 'tx_tr' }, 'gc_tr')).toEqual([{ col: 'transactions', id: 'tx_tr' }]);
  });
  it('rien de lié : liste vide (opération simple, autre collection, opération liée déjà supprimée)', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'tx_exp' }, 'tx_exp')).toEqual([]);
    expect(linkedRemovals(data, 'goals', { id: 'g1' }, 'g1')).toEqual([]);
    expect(linkedRemovals({ ...data, transactions: [] }, 'debtPayments', { id: 'dp1', transactionId: 'tx_debt' }, 'dp1')).toEqual([]);
  });

  it('comportement IDENTIQUE à l’ancienne cascade de actions.ts (données aléatoires)', () => {
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const pick = (arr: string[]) => (rnd(3) === 0 ? null : arr[rnd(arr.length)]);
    const cols: CollectionName[] = ['transactions', 'debtPayments', 'goalContributions', 'tontineEntries', 'goals', 'accounts'];
    for (let round = 0; round < 500; round++) {
      const tx = ids('tx', 1 + rnd(6));
      const d: RemovalData = {
        transactions: tx.filter(() => rnd(5) !== 0).map((id) => ({ id })),
        debtPayments: ids('dp', rnd(4)).map((id) => ({ id, transactionId: pick(tx) })),
        goalContributions: ids('gc', rnd(5)).map((id) => ({ id, transferId: pick(tx), linkedTransactionId: pick(tx) })),
        tontineEntries: ids('te', rnd(3)).map((id) => ({ id, transactionId: pick(tx) })),
      };
      const col = cols[rnd(cols.length)];
      const id = col === 'transactions' ? tx[rnd(tx.length)] : `${col}_x`;
      const doc: RemovedDoc | undefined = rnd(6) === 0 ? undefined : { id, transactionId: pick(tx), transferId: pick(tx) };
      expect(linkedRemovals(d, col, doc, id)).toEqual(legacyCascade(d, col, doc, id));
    }
  });
});
