/**
 * Supprimer une dette depuis son écran (fondateur, 2026-10-19) : la dette ET l'opération créée
 * avec elle (emprunt reçu ou prêt versé, `debtId`) disparaissent ensemble — comme « Annuler » de
 * l'IA. Une dette qui a déjà des remboursements ne se supprime pas (comportement inchangé : on la
 * clôture) ; ses remboursements ne sont jamais touchés.
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
const { debtDeletion } = await import('../src/core/debts');
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

const draft = (direction: 'i_owe' | 'owed_to_me', who: string) => ({ direction, kind: 'personal', counterparty: who, principal: 70_000, currency: 'XOF', startDate: TODAY, status: 'active' }) as never;

describe('supprimer une dette depuis son écran', () => {
  for (const [direction, who] of [['i_owe', 'Fatou'], ['owed_to_me', 'Ibrahim']] as const) {
    it(`${direction === 'i_owe' ? 'emprunt reçu' : 'prêt versé'} : la dette et son opération disparaissent ensemble (aucun orphelin)`, () => {
      const before = visible(engine.getData('local'));
      const actions = useActions();
      const debt = actions.saveDebt(draft(direction, who), { accountId: 'bank', date: TODAY });
      const opening = engine.getData('local').transactions.filter((t) => t.debtId === debt.id && !t.deleted);
      expect(opening).toHaveLength(1);
      expect(debtDeletion(engine.getData('local'), debt.id)).toEqual({ allowed: true, openingIds: [opening[0].id] });
      actions.deleteDebt(debt.id);
      expect(visible(engine.getData('local'))).toEqual(before);
    });
  }

  it('dette d’avant l’application (« Hors de mes comptes ») : seule la dette est supprimée', () => {
    const before = visible(engine.getData('local'));
    const actions = useActions();
    const debt = actions.saveDebt(draft('i_owe', 'Moussa'), {});
    expect(debtDeletion(engine.getData('local'), debt.id)).toEqual({ allowed: true, openingIds: [] });
    actions.deleteDebt(debt.id);
    expect(visible(engine.getData('local'))).toEqual(before);
  });

  it('une dette avec des remboursements : suppression refusée, rien n’est touché (comportement inchangé)', () => {
    const before = visible(engine.getData('local'));
    expect(debtDeletion(engine.getData('local'), 'd_koffi')).toEqual({ allowed: false, openingIds: [] });
    expect(() => useActions().deleteDebt('d_koffi')).toThrow();
    expect(visible(engine.getData('local'))).toEqual(before);
  });
});
