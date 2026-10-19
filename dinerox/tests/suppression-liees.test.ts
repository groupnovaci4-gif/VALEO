/**
 * Audit B1, B2 : supprimer une opération retire aussi les opérations qui l'accompagnent (frais d'un
 * transfert, intérêts d'un remboursement) — par l'opération comme par le remboursement.
 * Banc d'essai : VRAI `useActions` sur le VRAI moteur de synchronisation (voir ia-annuler.test.ts).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { iaData, TODAY } from './fixtures/ia-data';
import type { CollectionName, SpaceData, SyncedDoc } from '../src/core/types';

const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    getAllKeys: async () => [...mem.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => mem.delete(k)),
  },
}));
vi.mock('../src/services/sync/remote', () => ({}));
vi.mock('../src/services/firebase', () => ({}));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useCallback: (f: unknown) => f, useMemo: (f: () => unknown) => f() }));
vi.mock('../src/services/categoryCatalog', async () => {
  const { EMBEDDED_CATALOG } = await import('../src/core/categoryCatalog');
  return { currentCatalog: () => EMBEDDED_CATALOG };
});
vi.mock('../src/services/analytics', () => ({ analytics: { track: () => undefined } }));
vi.mock('../src/features/coach/bus', () => ({ notifyCoachWrite: () => undefined }));
vi.mock('../src/i18n', () => ({ useI18n: () => ({ t: (k: string) => k, lang: 'fr' }) }));
const session: { engine: unknown } = { engine: null };
vi.mock('../src/store/app', () => ({
  useApp: () => ({ engine: session.engine, activeSpace: { id: 'local', currency: 'XOF', kind: 'personal' }, role: 'admin', user: { uid: 'u1' }, plan: 'family' }),
}));

const { SyncEngine } = await import('../src/services/sync/engine');
const { useActions } = await import('../src/store/actions');
const { COLLECTIONS } = await import('../src/core/types');

let engine: InstanceType<typeof SyncEngine>;
function visible(d: SpaceData) {
  const strip = ({ updatedAt: _u, createdAt: _c, ...rest }: SyncedDoc & Record<string, unknown>) => rest;
  return Object.fromEntries(COLLECTIONS.map((c: CollectionName) => [c, (d[c] as SyncedDoc[]).filter((x) => !x.deleted).map((x) => strip(x as never)).sort((a, b) => String(a.id).localeCompare(String(b.id)))]));
}
beforeAll(async () => {
  engine = new SyncEngine('u1', null);
  await engine.open('local', 'admin');
  const data = iaData();
  engine.writeMany('local', COLLECTIONS.flatMap((c: CollectionName) => (data[c] as SyncedDoc[]).map((doc) => ({ col: c, doc }))));
  session.engine = engine;
});

describe('opérations liées supprimées avec leur opération', () => {
  it('B1 — transfert de 50 000 avec 500 de frais, puis suppression du transfert : tout revient (Banque 300 000)', () => {
    const before = visible(engine.getData('local'));
    const actions = useActions();
    const t = actions.saveTransaction({ type: 'transfer', amount: 50_000, currency: 'XOF', date: TODAY, accountId: 'bank', toAccountId: 'wave' } as never, { fee: 500 });
    expect(engine.getData('local').transactions.filter((x) => x.linkedTransactionId === t.id && !x.deleted)).toHaveLength(1);
    actions.remove('transactions', t.id);
    expect(visible(engine.getData('local'))).toEqual(before);
  });

  for (const via of ['transactions', 'debtPayments'] as const) {
    it(`B2 — remboursement de 110 000 dont 10 000 d’intérêts, supprimé par ${via === 'transactions' ? 'l’opération' : 'le remboursement'} : les intérêts partent aussi`, () => {
      const before = visible(engine.getData('local'));
      const actions = useActions();
      const p = actions.recordDebtPayment({ debtId: 'd_koffi', amount: 110_000, interest: 10_000, date: TODAY, accountId: 'bank', label: 'Remboursement' });
      expect(p).not.toBeNull();
      actions.remove(via, via === 'transactions' ? (p!.transactionId as string) : p!.id);
      expect(visible(engine.getData('local'))).toEqual(before);
    });
  }
});
