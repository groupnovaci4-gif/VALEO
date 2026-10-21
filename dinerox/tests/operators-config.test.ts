/**
 * Réglage des opérateurs (logo ou pastille) : il ne doit JAMAIS retarder ni bloquer le démarrage
 * ou l'accueil (fondateur, 2026-10-21). L'application part tout de suite avec
 * `src/config/operators.json` ; la version publiée s'applique ensuite, en arrière-plan, si elle
 * arrive avant le délai maximum — sinon, en cas d'erreur ou hors ligne, rien ne change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bundled from '../src/config/operators.json';

const remote = vi.hoisted(() => ({ getDoc: (): Promise<unknown> => new Promise(() => undefined) }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: () => remote.getDoc() }));
vi.mock('../src/services/firebase', () => ({ firebase: () => ({ db: {} }) }));
vi.mock('../src/config/env', () => ({ isFirebaseConfigured: true }));
vi.mock('../src/services/storage', () => ({ readJSON: async () => null, writeJSON: async () => undefined }));

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

async function fresh() {
  vi.resetModules();
  return import('../src/services/operatorsConfig');
}

/** Laisse filer les minuteurs et les promesses ; renvoie si le chargement est terminé. */
async function settledAfter(p: Promise<unknown>, ms: number) {
  let done = false;
  void p.then(() => (done = true));
  await vi.advanceTimersByTimeAsync(ms);
  return done;
}

describe('réglage des opérateurs : jamais bloquant', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lecture distante qui ne répond jamais : le chargement se termine au délai maximum, réglage embarqué', async () => {
    remote.getDoc = () => new Promise(() => undefined);
    const m = await fresh();
    expect(m.currentOperators()).toEqual(bundled);
    const p = m.loadOperatorsConfig(true);
    // Pendant l'attente, l'accueil lit déjà le réglage embarqué.
    expect(m.currentOperators()).toEqual(bundled);
    expect(await settledAfter(p, m.OPERATORS_REMOTE_TIMEOUT_MS + 1)).toBe(true);
    expect(m.currentOperators()).toEqual(bundled);
  });

  it('délai maximum court (quelques secondes)', async () => {
    const m = await fresh();
    expect(m.OPERATORS_REMOTE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(m.OPERATORS_REMOTE_TIMEOUT_MS).toBeLessThanOrEqual(8000);
  });

  it('réponse arrivée APRÈS le délai : ignorée, sans erreur', async () => {
    let answer: (v: unknown) => void = () => undefined;
    remote.getDoc = () => new Promise((r) => (answer = r));
    const m = await fresh();
    const p = m.loadOperatorsConfig(true);
    expect(await settledAfter(p, m.OPERATORS_REMOTE_TIMEOUT_MS + 1)).toBe(true);
    answer({ exists: () => true, data: () => ({ affichage: { orange: 'pastille' } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.currentOperators()).toEqual(bundled);
  });

  it('réponse à temps : appliquée en arrière-plan', async () => {
    remote.getDoc = async () => ({ exists: () => true, data: () => ({ affichage: { orange: 'pastille' } }) });
    const m = await fresh();
    await m.loadOperatorsConfig(true);
    expect(m.currentOperators()).not.toEqual(bundled);
    expect(m.currentOperators().operateurs.find((o) => o.id === 'orange')?.affichage).toBe('pastille');
  });

  it('erreur ou hors ligne : silencieux, réglage embarqué', async () => {
    remote.getDoc = async () => {
      throw new Error('unavailable');
    };
    const m = await fresh();
    await expect(m.loadOperatorsConfig(true)).resolves.toBeUndefined();
    await expect(m.loadOperatorsConfig(false)).resolves.toBeUndefined();
    expect(m.currentOperators()).toEqual(bundled);
  });

  it('le démarrage n’attend jamais le réglage (lancé sans await, après l’affichage)', () => {
    const src = read('src/components/Bootstrap.tsx');
    expect(src).toMatch(/void loadOperatorsConfig\(/);
    expect(src).not.toMatch(/await loadOperatorsConfig/);
  });
});
