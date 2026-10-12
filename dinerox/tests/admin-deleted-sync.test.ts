/// <reference types="node" />
/**
 * D2 — Une opération supprimée par le back-office (`adminDeleted`) ne revient
 * jamais, et l'app ACCEPTE calmement le refus des règles :
 *  - la synchronisation n'est pas bloquée (les autres écritures partent) ;
 *  - aucun nouvel essai en boucle (une seule tentative pour l'écriture refusée) ;
 *  - aucun message incompréhensible (le refus reste interne au moteur).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/services/sync/engine';
import type { PendingOp } from '../src/core/sync';
import type { SyncedDoc } from '../src/core/types';

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

/** Faux serveur qui applique les deux règles utiles de firestore.rules. */
function fakeServer() {
  const server = new Map<string, SyncedDoc & { adminDeleted?: boolean }>();
  const pushes: string[] = [];
  const subs: ((docs: { doc: SyncedDoc; syncedAt: number }[]) => void)[] = [];
  let clock = 1000;
  return {
    server,
    pushes,
    /** Écriture faite par le back-office (Admin SDK, hors règles). */
    adminDelete(id: string) {
      const cur = server.get(id)!;
      const doc = { ...cur, deleted: true, adminDeleted: true, updatedAt: Math.max(Date.now(), cur.updatedAt + 1) };
      server.set(id, doc);
      subs.forEach((s) => s([{ doc, syncedAt: ++clock }]));
    },
    remote: {
      async push(op: PendingOp) {
        pushes.push(op.id);
        const cur = server.get(op.id);
        // Règles : marqueur back-office → toute mise à jour refusée ; version plus ancienne → refusée.
        if (cur?.adminDeleted) return 'rejected' as const;
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

const tick = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('suppression par le back-office (adminDeleted) vue par l’app', () => {
  beforeEach(() => mem.clear());

  it('téléphone resté hors ligne avec une modification plus récente : refus accepté, l’opération ne revient pas', async () => {
    const f = fakeServer();
    const phone = new SyncEngine('u1', f.remote as never);
    await phone.open('s1', 'admin');
    phone.write('s1', 'transactions', { id: 't1', type: 'expense', amount: 5000 } as never);
    await tick();
    expect(f.server.get('t1')).toBeTruthy();

    // Le téléphone passe hors ligne et modifie l'opération (horloge en avance : updatedAt très grand).
    phone.setOnline(false);
    vi.setSystemTime(Date.now() + 3600_000);
    phone.write('s1', 'transactions', { ...phone.getDoc('s1', 'transactions', 't1')!, amount: 7000 } as never);
    phone.write('s1', 'transactions', { id: 't2', type: 'expense', amount: 100 } as never);
    vi.useRealTimers();
    // Pendant ce temps, le back-office supprime t1 (le téléphone ne reçoit rien : hors ligne).
    const saved = f.server.get('t1')!;
    f.server.set('t1', { ...saved, deleted: true, adminDeleted: true, updatedAt: saved.updatedAt + 1 });

    phone.setOnline(true);
    await tick(6);
    // Une seule tentative pour t1 : refusée, puis version serveur appliquée — pas de boucle.
    expect(f.pushes.filter((id) => id === 't1')).toEqual(['t1', 't1']); // création, puis l'unique essai refusé
    expect(phone.getStatus().pending).toBe(0);
    // La synchronisation n'est pas bloquée : t2 est bien parti.
    expect(f.server.get('t2')).toBeTruthy();
    // L'opération a disparu et ne revient pas ; le serveur garde la marque.
    expect(phone.getData('s1').transactions.map((t) => t.id)).toEqual(['t2']);
    expect(f.server.get('t1')).toMatchObject({ deleted: true, adminDeleted: true, amount: 5000 });
    await tick(6);
    expect(f.pushes.filter((id) => id === 't1')).toHaveLength(2);
  });

  it('téléphone en ligne : la marque arrive par l’écoute et l’opération disparaît', async () => {
    const f = fakeServer();
    const phone = new SyncEngine('u1', f.remote as never);
    await phone.open('s1', 'admin');
    phone.write('s1', 'transactions', { id: 't1', type: 'expense', amount: 5000 } as never);
    await tick();
    f.adminDelete('t1');
    await tick();
    expect(phone.getData('s1').transactions).toHaveLength(0);
    expect(phone.getStatus().pending).toBe(0);
  });

  it('le refus reste interne : aucun écran n’affiche l’erreur de synchronisation brute', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) files.push(p);
      }
    };
    walk('src');
    const readers = files.filter((p) => !p.includes(join('services', 'sync')) && /lastError/.test(readFileSync(p, 'utf8')) && !/EMPTY_STATUS = \{[^}]*lastError/.test(readFileSync(p, 'utf8')));
    expect(readers).toEqual([]);
  });
});
