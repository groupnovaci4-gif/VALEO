/**
 * Cloche (décision du fondateur, 22/10) : la pastille affiche le MÊME nombre que « À lire · N » ;
 * un message regroupé (« 7 paiements réguliers détectés ») compte pour 1.
 * « À lire · N » = `homeToRead(items).total` = nombre de messages APRÈS regroupement.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupToRead, homeToRead, type ToReadItem } from '../src/features/notifications/toRead';

const read = (f: string) => readFileSync(f, 'utf8');
const rec = (id: string): ToReadItem => ({ id, kind: 'coach', tone: 'info', text: id, link: null, keys: [], origin: 'insight', insightKind: 'recurring_payment' }) as ToReadItem;

describe('cloche = « À lire · N »', () => {
  it('le hook rend pour la cloche le nombre de messages regroupés (comme « À lire · N »)', () => {
    const src = read('src/features/notifications/useToRead.ts');
    expect(src).toMatch(/unread: items\.length/);
    expect(src).not.toMatch(/unread: visible\.length/);
  });
  it('« À lire · N » compte les messages regroupés', () => {
    expect(read('src/features/notifications/ToReadList.tsx')).toMatch(/homeToRead\(items, 3\)/);
  });
  it('un message regroupé compte pour 1', () => {
    const items = groupToRead([rec('a'), rec('b'), rec('c')], (_k, n) => `${n} paiements réguliers détectés`);
    expect(items.length).toBeLessThan(3);
    expect(homeToRead(items, 3).total).toBe(items.length);
  });
});
