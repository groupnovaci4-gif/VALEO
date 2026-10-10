/** 1.9 — Mini-conversation vocale, phase 1 : compréhension locale, confiance, garde-fous de l'IA. */
import { describe, expect, it } from 'vitest';
import { applySelfCorrections, needsAi, overallConfidence, parseEntryText, stripFillers, type EntryContext, type EntryDraft } from '../src/core/entry/parse';
import { aiLinesToDrafts, amountWasSpoken, chooseUnderstanding, spokenAmounts, validateAiOutput, type AiLine } from '../src/core/entry/aiGuard';
import { catalogStarterDocs } from '../src/core/categoryCatalog';
import { systemCategories } from '../src/core/defaults';
import { subcategoryDocs } from '../src/core/catalog';
import { normalizeText } from '../src/core/ai/parser';
import type { Category } from '../src/core/types';
import { account } from './helpers';

const TODAY = '2026-10-07';
/** Nouvel utilisateur en Côte d'Ivoire : catalogue 1.8 + catégories de revenus. */
const v2: Category[] = [...systemCategories({ now: 1, uid: 'u', zone: 'africa' }).filter((c) => c.kind === 'income' || c.id === 'cat_other'), ...catalogStarterDocs('CI', { now: 1, uid: 'u' })];
/** Utilisateur plus ancien (catégories d'avant le catalogue). */
const parents = systemCategories({ now: 1, uid: 'u', zone: 'africa' });
const legacy: Category[] = [...parents, ...subcategoryDocs('CI', 'africa', { now: 1, uid: 'u', lang: 'fr', parents: new Set(parents.map((c) => c.id)) })];
const wave = account({ id: 'wave', type: 'mobile_money', provider: 'wave', name: 'Wave' });
const bank = account({ id: 'bank', type: 'bank', name: 'Ma banque' });
const savings = account({ id: 'sav', type: 'bank', name: 'Mon épargne', isSavings: true });
const ctx = (p: Partial<EntryContext> = {}): EntryContext => ({ today: TODAY, currency: 'XOF', accounts: [wave, bank, savings], categories: v2, defaultAccountId: 'wave', ...p });

const items = (text: string, c = ctx()): EntryDraft[] => {
  const r = parseEntryText(text, c);
  if (r.kind !== 'entries') throw new Error(`« ${text} » → ${r.kind}`);
  return r.items;
};
const row = (d: EntryDraft) => [d.type, d.amount, d.subcategoryId ?? d.categoryId];

const REFERENCE = "J'ai dépensé 30 000 en facture d'électricité, 30 000 en facture d'eau, 30 000 au marché, et 100 000 en loyer, 10 000 en transport, 5 000 en santé, ainsi de suite.";

describe('exemple de référence du fondateur', () => {
  it('exactement 6 lignes, bonnes catégories, total 205 000, aucune question', () => {
    const d = items(REFERENCE);
    expect(d.map((x) => [x.type, x.amount, x.categoryId, x.subcategoryId])).toEqual([
      ['expense', 30_000, 'cat_housing', 'sub_housing_electricity'],
      ['expense', 30_000, 'cat_housing', 'sub_housing_water'],
      ['expense', 30_000, 'cat_food', 'sub_food_market'],
      ['expense', 100_000, 'cat_housing', 'sub_housing_rent'],
      ['expense', 10_000, 'cat_transport', null],
      ['expense', 5_000, 'cat_health', null],
    ]);
    expect(d.reduce((s, x) => s + (x.amount ?? 0), 0)).toBe(205_000);
    expect(d.every((x) => !x.question && x.uncertain.length === 0 && x.confidence === 1)).toBe(true);
    expect(d.every((x) => x.accountId === 'wave' && x.date === TODAY)).toBe(true);
    // Assez sûr : aucun appel à l'IA.
    expect(needsAi(parseEntryText(REFERENCE, ctx()), REFERENCE)).toBe(false);
  });
  it('« ainsi de suite » ne crée aucune ligne', () => {
    expect(stripFillers(normalizeText('5 000 en santé, ainsi de suite.'))).toBe('5 000 en sante,');
    expect(items('5 000 en santé, ainsi de suite, etc., euh, voilà')).toHaveLength(1);
  });
  it('anciennes catégories : mêmes 6 lignes, sans question', () => {
    const d = items(REFERENCE, ctx({ categories: legacy }));
    expect(d).toHaveLength(6);
    expect(d.map((x) => x.categoryId)).toEqual(['cat_housing', 'cat_housing', 'cat_food', 'cat_housing', 'cat_transport', 'cat_health']);
    expect(d.every((x) => !x.question && !x.uncertain.includes('category'))).toBe(true);
  });
});

describe('ambiguïtés : demander plutôt que deviner', () => {
  it('« 30 000 en eau » → UNE question : facture d’eau ou eau à boire', () => {
    const [d, ...rest] = items('30 000 en eau');
    expect(rest).toEqual([]);
    expect(d.categoryId).toBeNull();
    expect(d.uncertain).toContain('category');
    expect(d.question).toEqual({
      id: 'water',
      word: 'eau',
      options: [
        { id: 'bill', categoryId: 'cat_housing', subcategoryId: 'sub_housing_water' },
        { id: 'drink', categoryId: 'cat_food', subcategoryId: 'sub_food_water' },
      ],
    });
  });
  it('« facture d’eau » ou « eau minérale » : aucune question', () => {
    expect(items("30 000 en facture d'eau")[0].question).toBeNull();
    expect(row(items('500 eau minérale')[0])).toEqual(['expense', 500, 'sub_food_water']);
  });
  it('choix déjà tranché une fois (mot appris) : appliqué sans redemander', () => {
    const learned = v2.map((c) => (c.id === 'sub_food_water' ? { ...c, learnedWords: ['eau'] } : c));
    const [d] = items('30 000 en eau', ctx({ categories: learned }));
    expect(d.question).toBeNull();
    expect([d.categoryId, d.subcategoryId]).toEqual(['cat_food', 'sub_food_water']);
  });
});

describe('listes, corrections, montants, dates, comptes', () => {
  it('auto-correction « 30 000, non pardon 35 000 »', () => {
    expect(applySelfCorrections('30 000, non pardon 35 000 en electricite')).toBe('35 000 en electricite');
    expect(items("30 000, non pardon 35 000 en électricité").map(row)).toEqual([['expense', 35_000, 'sub_housing_electricity']]);
    expect(items('loyer 100 000 plutôt 120 000').map(row)).toEqual([['expense', 120_000, 'sub_housing_rent']]);
  });
  it('liste de 10 lignes', () => {
    const t = 'taxi 1 000, garba 500, crédit 1 000, loyer 100 000, pharmacie 2 000, marché 15 000, essence 5 000, école 20 000, coiffure 3 000 et facture d’électricité 12 000';
    const d = items(t);
    expect(d).toHaveLength(10);
    expect(d.every((x) => x.amount && x.categoryId && !x.question)).toBe(true);
    expect(d.reduce((s, x) => s + (x.amount ?? 0), 0)).toBe(159_500);
  });
  it('montants en lettres', () => {
    expect(items('trente mille au marché et deux mille cinq cents de crédit').map(row)).toEqual([
      ['expense', 30_000, 'sub_food_market'],
      ['expense', 2_500, 'sub_comm_airtime'],
    ]);
  });
  it('« aussi » et « puis » séparent les opérations', () => {
    expect(items('taxi 1 000 puis garba 500 aussi crédit 1 000')).toHaveLength(3);
  });
  it('mélange revenu + épargne + dépense (date et compte cités)', () => {
    const d = items("J'ai reçu mon salaire 250 000, j'ai mis 50 000 de côté et payé 10 000 de transport hier par la banque");
    expect(d.map((x) => [x.type, x.amount, x.categoryId, x.accountId, x.date])).toEqual([
      ['income', 250_000, 'inc_salary', 'wave', TODAY],
      ['savings', 50_000, null, 'wave', TODAY],
      ['expense', 10_000, 'cat_transport', 'bank', '2026-10-06'],
    ]);
    expect(d[1].savings).toEqual({ savingsAccountId: 'sav', goalId: null });
  });
  it('un versement seul reste un versement (écran « Mon épargne »)', () => {
    expect(parseEntryText("J'ai mis 50 000 de côté", ctx()).kind).toBe('savings');
  });
  it('ligne sans montant : « à vérifier », confiance basse', () => {
    const [d] = items('pharmacie hier');
    expect(d.amount).toBeNull();
    expect(d.uncertain).toContain('amount');
    expect(d.confidence).toBe(0.5);
    expect(d.date).toBe('2026-10-06');
  });
  it('catégorie inconnue : à vérifier, et l’IA est sollicitée', () => {
    const t = '2 000 pour djakarta';
    const r = parseEntryText(t, ctx());
    expect(r.kind === 'entries' && r.items[0].uncertain).toContain('category');
    expect(needsAi(r, t)).toBe(true);
  });
  it('compte cité (« avec la banque ») ; compte inconnu = à vérifier', () => {
    expect(items('loyer 100 000 avec la banque')[0].accountId).toBe('bank');
    const [d] = items('taxi 2 000 par Orange Money');
    expect(d.uncertain).toContain('account');
  });
  it('confiance d’ensemble = la ligne la moins sûre', () => {
    expect(overallConfidence(items('taxi 2 000, pharmacie'))).toBe(0.5);
    expect(overallConfidence([])).toBe(0);
  });
});

// ─── Garde-fous de l'IA ────────────────────────────────────────────────

const line = (p: Partial<AiLine>): AiLine => ({ type: 'expense', amount: 30_000, currencyFromSpace: true, categoryId: 'cat_food', subcategoryId: 'sub_food_market', accountName: null, date: null, sourceText: '30 000 au marché', confidence: 0.9, question: null, ...p });

describe('garde-fous de l’IA', () => {
  it('montants prononcés : chiffres, lettres, « mille », points', () => {
    expect(spokenAmounts('trente mille, 30 mille, 25.000 et 12 500')).toEqual(expect.arrayContaining([30_000, 25_000, 12_500]));
    expect(amountWasSpoken(30_000, spokenAmounts('trente mille au marché'))).toBe(true);
    expect(amountWasSpoken(35_000, spokenAmounts('trente mille au marché'))).toBe(false);
  });
  it('montant absent de la transcription → rejeté, ligne « à vérifier »', () => {
    const [d] = aiLinesToDrafts([line({ amount: 35_000 })], 'trente mille au marché', ctx());
    expect(d.amount).toBeNull();
    expect(d.uncertain).toContain('amount');
  });
  it('autre devise : jamais convertie, montant à vérifier', () => {
    const [d] = aiLinesToDrafts([line({ currencyFromSpace: false })], '30 000 au marché', ctx());
    expect(d.amount).toBeNull();
  });
  it('catégorie inexistante ou désactivée → refusée, question « Autres ou créer X ? »', () => {
    const [d] = aiLinesToDrafts([line({ categoryId: 'cat_invente', subcategoryId: null, sourceText: '30 000 djakarta' })], '30 000 djakarta', ctx());
    expect(d.categoryId).toBeNull();
    expect(d.question).toEqual({ id: 'unknownCategory', word: 'djakarta', options: [{ id: 'other', categoryId: 'cat_other', subcategoryId: null }, { id: 'create', categoryId: null, subcategoryId: null }] });
    const off = v2.map((c) => (c.id === 'cat_food' ? { ...c, disabled: true } : c));
    expect(aiLinesToDrafts([line({})], '30 000 au marché', ctx({ categories: off }))[0].categoryId).toBeNull();
    // Mauvais sens (catégorie de revenu pour une dépense) : refusée aussi.
    expect(aiLinesToDrafts([line({ categoryId: 'inc_salary', subcategoryId: null })], '30 000 au marché', ctx())[0].categoryId).toBeNull();
  });
  it('sous-catégorie donnée comme catégorie : remontée au parent', () => {
    const [d] = aiLinesToDrafts([line({ categoryId: 'sub_food_market', subcategoryId: null })], '30 000 au marché', ctx());
    expect([d.categoryId, d.subcategoryId]).toEqual(['cat_food', 'sub_food_market']);
  });
  it('réponse non conforme au schéma → parseur local', () => {
    const local = items('taxi 2 000');
    for (const bad of [null, 'texte', { lines: 'x' }, { lines: [{ type: 'vol', amount: 1 }] }, { lines: [{ ...line({}), amount: -5 }] }, { lines: [{ ...line({}), confidence: 2 }] }]) {
      expect(validateAiOutput(bad)).toBeNull();
      expect(chooseUnderstanding(local, bad, 'taxi 2 000', ctx())).toEqual({ drafts: local, source: 'local' });
    }
  });
  it('délai dépassé, hors ligne ou sans consentement (réponse null) → parseur local, sans blocage', () => {
    const local = items('taxi 2 000');
    expect(chooseUnderstanding(local, null, 'taxi 2 000', ctx()).source).toBe('local');
  });
  it('réponse conforme : retenue, compte cité et date contrôlés', () => {
    const raw = { lines: [line({ accountName: 'Ma banque', date: '2026-10-06' }), line({ type: 'savings_deposit', amount: 5_000, categoryId: null, subcategoryId: null, sourceText: 'mis 5 000 de côté' }), line({ date: '2030-01-01', amount: 2_000, sourceText: 'taxi 2 000', categoryId: 'cat_transport', subcategoryId: null })] };
    const r = chooseUnderstanding([], raw, '30 000 au marché avec la banque hier, mis 5 000 de côté, taxi 2 000', ctx());
    expect(r.source).toBe('ai');
    expect(r.drafts.map((d) => [d.type, d.amount, d.accountId, d.date])).toEqual([
      ['expense', 30_000, 'bank', '2026-10-06'],
      ['savings', 5_000, 'wave', TODAY],
      ['expense', 2_000, 'wave', TODAY], // date future refusée → aujourd'hui
    ]);
    expect(r.drafts[1].savings?.savingsAccountId).toBe('sav');
  });
  it('aucun montant prononcé dans la réponse de l’IA → parseur local', () => {
    const local = items('taxi 2 000');
    expect(chooseUnderstanding(local, { lines: [line({ amount: 99_000 })] }, 'taxi 2 000', ctx()).source).toBe('local');
  });
});

describe('vocabulaire non validé', () => {
  it('« 30 balles » : montant jamais deviné (unité inactive tant que le fondateur ne l’a pas validée)', () => {
    const [d] = items('30 balles de garba');
    expect(d.amount).toBeNull();
    expect(d.uncertain).toContain('amount');
  });
});
