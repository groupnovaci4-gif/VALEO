import { describe, expect, it } from 'vitest';
import { docKey, enqueue, mergeRemote, stamp, visible, winner, retryDelay } from '../src/core/sync';
import type { SyncedDoc } from '../src/core/types';

const d = (id: string, updatedAt: number, extra: Partial<SyncedDoc> & Record<string, unknown> = {}) => ({ id, updatedAt, createdAt: 0, createdBy: 'u', ...extra });

describe('résolution des conflits', () => {
  it('le plus récent gagne, égalité → serveur', () => {
    expect(winner(d('a', 2), d('a', 1))).toBe('local');
    expect(winner(d('a', 1), d('a', 2))).toBe('remote');
    expect(winner(d('a', 1), d('a', 1))).toBe('remote');
    expect(winner(undefined, d('a', 1))).toBe('remote');
  });
  it('une écriture locale plus récente en attente est conservée', () => {
    const key = (id: string) => docKey('s', 'transactions', id);
    const r = mergeRemote({ a: d('a', 5, { amount: 2 }) }, [d('a', 3, { amount: 1 })], new Set([key('a')]), key);
    expect((r.docs.a as unknown as { amount: number }).amount).toBe(2);
    expect(r.obsoletePending).toEqual([]);
  });
  it('une version distante plus récente rend l écriture locale obsolète', () => {
    const key = (id: string) => docKey('s', 'transactions', id);
    const r = mergeRemote({ a: d('a', 3) }, [d('a', 5)], new Set([key('a')]), key);
    expect(r.docs.a.updatedAt).toBe(5);
    expect(r.obsoletePending).toEqual([key('a')]);
    expect(r.changed).toBe(true);
  });
  it('suppression logique : propagée et masquée', () => {
    const key = (id: string) => id;
    const r = mergeRemote({ a: d('a', 1) }, [d('a', 2, { deleted: true })], new Set(), key);
    expect(visible(r.docs)).toHaveLength(0);
  });
  it('deux saisies hors-ligne concurrentes (documents distincts) coexistent', () => {
    const key = (id: string) => id;
    const r = mergeRemote({ mine: d('mine', 10) }, [d('theirs', 5)], new Set(['mine']), key);
    expect(Object.keys(r.docs).sort()).toEqual(['mine', 'theirs']);
  });
});

describe('outbox', () => {
  it('fusionne les écritures en attente d un même document', () => {
    let o = enqueue([], { spaceId: 's', collection: 'transactions', id: 'a', doc: d('a', 1) }, 1);
    o = enqueue(o, { spaceId: 's', collection: 'transactions', id: 'a', doc: d('a', 2) }, 2);
    o = enqueue(o, { spaceId: 's', collection: 'transactions', id: 'b', doc: d('b', 2) }, 2);
    expect(o).toHaveLength(2);
    expect(o.find((p) => p.id === 'a')!.doc.updatedAt).toBe(2);
  });
  it('horodatage strictement croissant même si l horloge recule', () => {
    const prev = d('a', 1000);
    expect(stamp(d('a', 0), 500, prev).updatedAt).toBe(1001);
    expect(stamp(d('a', 0), 2000, prev).updatedAt).toBe(2000);
    expect(stamp(d('a', 0, { createdAt: 7 }), 2000, prev).createdAt).toBe(0);
  });
  it('backoff plafonné', () => {
    expect(retryDelay(0)).toBe(2000);
    expect(retryDelay(20)).toBe(300_000);
  });
});
