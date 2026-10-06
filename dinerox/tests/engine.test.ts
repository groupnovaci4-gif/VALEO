import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/services/sync/engine';
import type { PendingOp } from '../src/core/sync';
import type { SyncedDoc } from '../src/core/types';

// AsyncStorage en mémoire.
const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    getAllKeys: async () => [...mem.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => mem.delete(k)),
  },
}));
// remote.ts importe firebase : inutile ici, on fournit un faux distant.
vi.mock('../src/services/sync/remote', () => ({}));
vi.mock('../src/services/firebase', () => ({}));


function fakeRemote() {
  const server = new Map<string, SyncedDoc>();
  const subs: ((docs: { doc: SyncedDoc; syncedAt: number }[]) => void)[] = [];
  let reachable = true;
  let clock = 1000;
  return {
    server,
    setReachable: (v: boolean) => (reachable = v),
    /** Simule une écriture faite par un autre appareil. */
    externalWrite(doc: SyncedDoc) {
      server.set(doc.id, doc);
      subs.forEach((s) => s([{ doc, syncedAt: ++clock }]));
    },
    remote: {
      async push(op: PendingOp) {
        if (!reachable) return 'retry' as const;
        const cur = server.get(op.id);
        // Même règle que firestore.rules : refus d'une version plus ancienne.
        if (cur && cur.updatedAt > op.doc.updatedAt) return 'rejected' as const;
        server.set(op.id, op.doc);
        return 'ok' as const;
      },
      async fetchOne(_s: string, _c: string, id: string) {
        return server.get(id) ?? null;
      },
      subscribe(_s: string, col: string, _since: number, onDocs: (d: { doc: SyncedDoc; syncedAt: number }[]) => void) {
        if (col === 'transactions') subs.push(onDocs);
        return () => undefined;
      },
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('moteur de synchronisation', () => {
  beforeEach(() => mem.clear());

  it('une saisie hors-ligne est visible tout de suite puis synchronisée au retour du réseau', async () => {
    const f = fakeRemote();
    const engine = new SyncEngine('u1', f.remote as never);
    await engine.open('s1', 'admin');
    f.setReachable(false);
    engine.setOnline(false);
    engine.write('s1', 'transactions', { id: 't1', type: 'expense', amount: 5000 } as never);
    expect(engine.getData('s1').transactions).toHaveLength(1);
    expect(engine.getStatus().pending).toBe(1);
    expect(f.server.size).toBe(0);
    f.setReachable(true);
    engine.setOnline(true);
    await tick();
    await tick();
    expect(f.server.get('t1')).toBeTruthy();
    expect(engine.getStatus().pending).toBe(0);
  });

  it('horodate lui-même les écritures (updatedAt, createdAt, createdBy)', async () => {
    const engine = new SyncEngine('u1', null);
    await engine.open('local', 'admin');
    const d = engine.write('local', 'goals', { id: 'g1', name: 'Moto' } as never);
    expect(d.createdBy).toBe('u1');
    expect(d.updatedAt).toBeGreaterThan(0);
    const d2 = engine.patch('local', 'goals', 'g1', { name: 'Moto 2' } as never)!;
    expect(d2.updatedAt).toBeGreaterThan(d.updatedAt - 1);
    expect(d2.createdAt).toBe(d.createdAt);
  });

  it('un brouillon sans auteur ni date reçoit ceux de la session (budget automatique)', async () => {
    const engine = new SyncEngine('u1', null);
    await engine.open('local', 'admin');
    engine.writeMany('local', [{ col: 'envelopes', doc: { id: 'e1', createdAt: 0, updatedAt: 0, createdBy: '' } as never }]);
    const e = engine.getData('local').envelopes[0];
    expect(e.createdBy).toBe('u1');
    expect(e.createdAt).toBeGreaterThan(0);
  });

  it('suppression logique : masquée localement, propagée au serveur', async () => {
    const f = fakeRemote();
    const engine = new SyncEngine('u1', f.remote as never);
    await engine.open('s1', 'admin');
    engine.write('s1', 'transactions', { id: 't1', amount: 1 } as never);
    await tick();
    engine.remove('s1', 'transactions', 't1');
    await tick();
    await tick();
    expect(engine.getData('s1').transactions).toHaveLength(0);
    expect(f.server.get('t1')?.deleted).toBe(true);
  });

  it('une écriture distante plus récente remplace la locale', async () => {
    const f = fakeRemote();
    const engine = new SyncEngine('u1', f.remote as never);
    await engine.open('s1', 'admin');
    const local = engine.write('s1', 'transactions', { id: 't1', amount: 1 } as never);
    await tick();
    f.externalWrite({ ...local, amount: 2, updatedAt: local.updatedAt + 10_000 } as never);
    expect((engine.getData('s1').transactions[0] as unknown as { amount: number }).amount).toBe(2);
  });

  it('écriture refusée (version serveur plus récente) : la version serveur est restaurée', async () => {
    const f = fakeRemote();
    const engine = new SyncEngine('u1', f.remote as never);
    await engine.open('s1', 'admin');
    f.server.set('t1', { id: 't1', amount: 99, updatedAt: Date.now() + 1e9, createdAt: 0, createdBy: 'other' } as never);
    engine.write('s1', 'transactions', { id: 't1', amount: 1 } as never);
    await tick();
    await tick();
    await tick();
    expect((engine.getData('s1').transactions[0] as unknown as { amount: number }).amount).toBe(99);
    expect(engine.getStatus().pending).toBe(0);
  });

  it('le cache local survit au redémarrage', async () => {
    const engine = new SyncEngine('u1', null);
    await engine.open('local', 'admin');
    engine.write('local', 'accounts', { id: 'a1', name: 'Cash' } as never);
    engine.destroy(); // vide l'écriture différée
    await tick();
    const again = new SyncEngine('u1', null);
    await again.open('local', 'admin');
    expect(again.getData('local').accounts).toHaveLength(1);
  });

  it('un enfant ne s abonne pas aux dettes ni au patrimoine', async () => {
    const f = fakeRemote();
    const cols: string[] = [];
    const remote = { ...f.remote, subscribe: (_s: string, col: string) => (cols.push(col), () => undefined) };
    const engine = new SyncEngine('kid', remote as never);
    await engine.open('fam', 'child');
    expect(cols).not.toContain('debts');
    expect(cols).not.toContain('assets');
    expect(cols).toContain('transactions');
  });
  it('deux ouvertures simultanées du même espace : un seul jeu d écouteurs actif', async () => {
    const f = fakeRemote();
    let active = 0;
    let opened = 0;
    const remote = { ...f.remote, subscribe: () => (active++, opened++, () => void active--) };
    // Référence : une ouverture seule.
    let single = 0;
    await new SyncEngine('u0', { ...f.remote, subscribe: () => (single++, () => undefined) } as never).open('s0', 'admin');
    const engine = new SyncEngine('u1', remote as never);
    await Promise.all([engine.open('s1', 'admin'), engine.open('s1', 'admin')]);
    const perOpen = opened;
    expect(perOpen).toBe(single);
    await engine.open('s1', 'admin');
    expect(opened).toBe(perOpen); // déjà ouvert : rien de relancé
    expect(active).toBe(perOpen);
    // Changement de rôle : les anciens écouteurs sont fermés avant d'ouvrir les nouveaux.
    await engine.open('s1', 'child');
    expect(active).toBeLessThan(perOpen);
    expect(active).toBeGreaterThan(0);
  });
});
