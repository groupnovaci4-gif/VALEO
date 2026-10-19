/**
 * IA — « Valider » puis « Annuler » (toast, 5 s) laisse les données IDENTIQUES à l'état de départ,
 * pour CHAQUE action de docs/ia-comprend-tout.md §2.2 : aucun document orphelin (opération, entrée
 * de tontine, versement d'objectif, paiement ou création de dette, récurrence, enveloppe).
 *
 * Banc d'essai : le VRAI `useActions` (store/actions.ts) sur le VRAI moteur de synchronisation
 * (services/sync/engine.ts, en mémoire). React est réduit à `useCallback` / `useMemo` (identité) ;
 * la session (`useApp`) est simulée : administrateur, formule Famille, espace local.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { iaData, TODAY } from './fixtures/ia-data';
import type { ActionIntent } from '../src/core/ai/intent';
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
const { runAction } = await import('../src/core/ai/actionCard');
const { intentContext, understand, complete } = await import('../src/core/ai/intent');
const { COLLECTIONS } = await import('../src/core/types');

let engine: InstanceType<typeof SyncEngine>;

/** Documents VISIBLES de l'espace, sans horodatage (seul le contenu compte). */
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

/** L'intention d'une phrase, choix « Lequel ? » complétés par le premier compte proposé. */
function intentOf(text: string): ActionIntent {
  const ctx = intentContext(engine.getData('local'), { today: TODAY, currency: 'XOF' });
  let i = understand(text, ctx);
  for (let n = 0; n < 3 && i.kind === 'ask'; n++) {
    const opt = i.options[0];
    const inner = i.intent as ActionIntent;
    i = complete(i.field === 'to' ? { ...inner, to: opt } : i.field === 'from' || (i.field === 'account' && !(inner.action === 'debt_create' && inner.direction === 'i_owe')) ? { ...inner, from: opt } : i.field === 'account' ? { ...inner, to: opt } : { ...inner, ref: opt }, ctx);
  }
  if (i.kind !== 'action') throw new Error(`${text} → ${JSON.stringify(i)}`);
  return i;
}

const PHRASES: [string, string][] = [
  ['save', 'Retire 100 000 de l’argent disponible pour le mettre en épargne'],
  ['withdraw_savings', 'Sors 30 000 de mon épargne vers Wave'],
  ['transfer', 'Envoie 10 000 de Wave vers Orange Money'],
  ['goal_contribute', 'Ajoute 25 000 à ma moto'],
  ['goal_create', 'Je veux économiser pour un frigo à 300 000'],
  ['debt_repayment', 'J’ai remboursé 50 000 à Koffi avec Orange Money'],
  ['debt_create (je dois)', 'Koffi m’a prêté 100 000'],
  ['debt_create (on me doit)', 'J’ai prêté 20 000 à Awa par Wave'],
  ['recurring_confirm', 'J’ai payé le loyer'],
  ['reserve_use', 'Prends 40 000 sur la réserve famille pour les funérailles'],
  ['envelope_budget', 'Mets le transport à 50 000 ce mois-ci'],
  ['recurring_create', 'Chaque mois j’envoie 50 000 à Maman'],
];

describe('« Valider » puis « Annuler » : données identiques à l’état de départ', () => {
  for (const [name, text] of PHRASES) {
    it(`${name} — « ${text} »`, () => {
      const before = visible(engine.getData('local'));
      const intent = intentOf(text);
      const actions = { ...useActions(), currentTransactions: () => engine.getData('local').transactions } as never;
      const r = runAction(intent, actions, { data: engine.getData('local'), currency: 'XOF', today: TODAY }, []);
      const during = visible(engine.getData('local'));
      expect(during, 'l’action a bien écrit quelque chose').not.toEqual(before);
      r.undo();
      expect(visible(engine.getData('local'))).toEqual(before);
    });
  }
});
