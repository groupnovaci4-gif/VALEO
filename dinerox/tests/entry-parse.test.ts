/** Lot A, phase 3 — parseur de saisie (voix / phrase écrite) : tableau de la mission + cas limites. */
import { describe, expect, it } from 'vitest';
import { parseEntryText, relativeDate, splitSegments, type EntryContext, type EntryDraft } from '../src/core/entry/parse';
import { amountSpans, wordsToNumber } from '../src/core/entry/numbers';
import { systemCategories } from '../src/core/defaults';
import { subcategoryDocs } from '../src/core/catalog';
import { account } from './helpers';

const TODAY = '2026-10-07'; // mercredi
const parents = systemCategories({ now: 1, uid: 'u1', zone: 'africa' });
const categories = [...parents, ...subcategoryDocs('CI', 'africa', { now: 1, uid: 'u1', lang: 'fr', parents: new Set(parents.map((c) => c.id)) })];
const cash = account({ id: 'cash', type: 'cash', name: 'Espèces' });
const om = account({ id: 'om', type: 'mobile_money', provider: 'orange_money', name: 'Orange Money' });
const wave = account({ id: 'wave', type: 'mobile_money', provider: 'wave', name: 'Wave' });
const ctx = (p: Partial<EntryContext> = {}): EntryContext => ({ today: TODAY, currency: 'XOF', accounts: [cash, om, wave], categories, defaultAccountId: 'cash', ...p });

const items = (text: string, c = ctx()): EntryDraft[] => {
  const r = parseEntryText(text, c);
  if (r.kind !== 'entries') throw new Error(`« ${text} » → ${r.kind}`);
  return r.items;
};
const row = (d: EntryDraft) => ({ type: d.type, amount: d.amount, category: d.categoryId, account: d.accountId, date: d.date });

describe('nombres', () => {
  it('en lettres', () => {
    expect(wordsToNumber(['deux', 'mille', 'cinq', 'cents'])).toBe(2500);
    expect(wordsToNumber(['trois', 'cent', 'mille'])).toBe(300_000);
    expect(wordsToNumber(['vingt', 'cinq', 'mille'])).toBe(25_000);
    expect(wordsToNumber(['quatre', 'vingt', 'dix', 'mille'])).toBe(90_000);
    expect(wordsToNumber(['un', 'million', 'deux', 'cent', 'mille'])).toBe(1_200_000);
    expect(wordsToNumber(['mille', 'cinq', 'cents'])).toBe(1500);
  });
  it('chiffres, unités collées, et pas de faux montant', () => {
    expect(amountSpans('taxi 2000f').map((s) => s.value)).toEqual([2000]);
    expect(amountSpans('taxi 2 000 fcfa').map((s) => s.value)).toEqual([2000]);
    expect(amountSpans('250 mille de salaire').map((s) => s.value)).toEqual([250_000]);
    expect(amountSpans('1,5 million pour la parcelle').map((s) => s.value)).toEqual([1_500_000]);
    expect(amountSpans('j ai pris un taxi').map((s) => s.value)).toEqual([]);
    expect(amountSpans('le 5 octobre taxi 2000').map((s) => s.value)).toEqual([2000]);
  });
});

describe('dates relatives', () => {
  it('hier, avant-hier, ce matin, jour de la semaine (passé)', () => {
    expect(relativeDate('hier', TODAY)).toBe('2026-10-06');
    expect(relativeDate('avant-hier', TODAY)).toBe('2026-10-05');
    expect(relativeDate('ce matin', TODAY)).toBe(TODAY);
    expect(relativeDate('lundi', TODAY)).toBe('2026-10-05');
    expect(relativeDate('mercredi', TODAY)).toBe(TODAY);
    expect(relativeDate('jeudi', TODAY)).toBe('2026-10-01');
    expect(relativeDate('taxi 2000', TODAY)).toBeNull();
  });
});

describe('tableau de la mission', () => {
  it('« Taxi 2 000 » → 1 dépense, 2 000, transport', () => {
    const [d, ...rest] = items('Taxi 2 000');
    expect(rest).toEqual([]);
    expect(row(d)).toEqual({ type: 'expense', amount: 2000, category: 'cat_transport', account: 'cash', date: TODAY });
    expect(d.uncertain).toEqual([]);
  });
  it('« J’ai donné 2000 pour le taxi » → idem', () => {
    expect(items("J'ai donné 2000 pour le taxi").map(row)).toEqual([{ type: 'expense', amount: 2000, category: 'cat_transport', account: 'cash', date: TODAY }]);
  });
  it('« Ce matin taxi 1 000, garba 500, crédit 1 000 » → 3 dépenses datées du jour', () => {
    expect(items('Ce matin taxi 1 000, garba 500, crédit 1 000').map(row)).toEqual([
      { type: 'expense', amount: 1000, category: 'cat_transport', account: 'cash', date: TODAY },
      { type: 'expense', amount: 500, category: 'cat_food', account: 'cash', date: TODAY },
      { type: 'expense', amount: 1000, category: 'cat_communication', account: 'cash', date: TODAY },
    ]);
  });
  it('« Woro-woro 300 et gbaka 200 » → 2 dépenses transport', () => {
    const r = items('Woro-woro 300 et gbaka 200');
    expect(r.map((d) => [d.type, d.amount, d.categoryId, d.subcategoryId])).toEqual([
      ['expense', 300, 'cat_transport', 'sub_transport_shared'],
      ['expense', 200, 'cat_transport', 'sub_transport_shared'],
    ]);
  });
  it('« Deux mille cinq cents pour l’alloco » → 2 500, alimentation', () => {
    expect(items("Deux mille cinq cents pour l'alloco").map(row)).toEqual([{ type: 'expense', amount: 2500, category: 'cat_food', account: 'cash', date: TODAY }]);
  });
  it('« Salaire reçu 250 000 » / « J’ai reçu 250 mille de salaire » → 1 entrée, salaire', () => {
    for (const s of ['Salaire reçu 250 000', "J'ai reçu 250 mille de salaire"]) {
      expect(items(s).map(row)).toEqual([{ type: 'income', amount: 250_000, category: 'inc_salary', account: 'cash', date: TODAY }]);
    }
  });
  it('« Envoyé 20 000 à maman » → 1 dépense, famille, bénéficiaire « maman »', () => {
    const [d] = items('Envoyé 20 000 à maman');
    expect(row(d)).toEqual({ type: 'expense', amount: 20_000, category: 'cat_family', account: 'cash', date: TODAY });
    expect(d.payee).toBe('maman');
    expect(d.uncertain).toEqual([]);
  });
  it('« Tontine 10 000 » → sortie, catégorie tontine si elle existe, sinon la suivante', () => {
    const [d] = items('Tontine 10 000');
    expect([d.type, d.amount, d.categoryId, d.subcategoryId]).toEqual(['expense', 10_000, 'cat_informal', 'sub_informal_tontine']);
    // Sans catégories africaines : plus de repli sur « Épargne » (1.8, épargner n'est pas dépenser) —
    // la catégorie est demandée (surlignée), jamais devinée.
    const [e] = items('Tontine 10 000', ctx({ categories: systemCategories({ now: 1, uid: 'u1', zone: 'europe' }) }));
    expect([e.categoryId, e.subcategoryId]).toEqual([null, null]);
    expect(e.uncertain).toContain('category');
  });
  it('« Payé 5 000 par Orange Money » → compte Orange Money ; sans ce compte : compte par défaut, surligné', () => {
    const [d] = items('Payé 5 000 par Orange Money');
    expect([d.type, d.amount, d.accountId]).toEqual(['expense', 5000, 'om']);
    expect(d.uncertain).not.toContain('account');
    const [e] = items('Payé 5 000 par Orange Money', ctx({ accounts: [cash] }));
    expect(e.accountId).toBe('cash');
    expect(e.uncertain).toContain('account');
  });
  it('« Hier carburant 15 000 » → date = veille', () => {
    expect(items('Hier carburant 15 000').map(row)).toEqual([{ type: 'expense', amount: 15_000, category: 'cat_transport', account: 'cash', date: '2026-10-06' }]);
  });
  it('« 1,5 million pour la parcelle » → 1 500 000 (catégorie à confirmer)', () => {
    const [d] = items('1,5 million pour la parcelle');
    expect(d.amount).toBe(1_500_000);
    expect(d.uncertain).toContain('category');
  });
  it('« Taxi » (sans montant) → montant manquant, signalé', () => {
    const [d] = items('Taxi');
    expect(d.amount).toBeNull();
    expect(d.uncertain).toContain('amount');
    expect(d.categoryId).toBe('cat_transport');
  });
  it('« 15 000 maman » → montant reconnu, type et catégorie à confirmer', () => {
    const [d] = items('15 000 maman');
    expect(d.amount).toBe(15_000);
    expect(d.uncertain).toEqual(expect.arrayContaining(['type', 'category']));
  });
});

describe('routage et cas limites', () => {
  it('question → assistant (réponse), jamais une opération', () => {
    expect(parseEntryText('Combien j’ai dépensé en transport ce mois-ci ?', ctx()).kind).toBe('question');
  });
  it('transfert et projet → assistant', () => {
    expect(parseEntryText('Transfère 10 000 de Wave vers Orange Money', ctx()).kind).toBe('assistant');
    expect(parseEntryText('Je veux acheter une moto dans 2 ans', ctx()).kind).toBe('assistant');
  });
  it('ni montant ni catégorie → ambigu (« opération ou question ? »)', () => {
    expect(parseEntryText('bonjour', ctx()).kind).toBe('ambiguous');
    expect(parseEntryText('   ', ctx()).kind).toBe('empty');
  });
  it('« on m’a remboursé » = entrée ; « j’ai payé » = sortie', () => {
    expect(items("On m'a remboursé 5 000")[0].type).toBe('income');
    expect(items("J'ai payé 5 000 de loyer")[0]).toMatchObject({ type: 'expense', categoryId: 'cat_housing' });
  });
  it('le sens d’une phrase vaut pour ses opérations suivantes', () => {
    const r = items('Envoyé 20 000 à maman et 5 000 à papa');
    expect(r.map((d) => [d.type, d.amount, d.categoryId])).toEqual([
      ['expense', 20_000, 'cat_family'],
      ['expense', 5_000, 'cat_family'],
    ]);
    expect(r[1].uncertain).not.toContain('type');
  });
  it('unité argotique non validée (« 2 bâtons ») : montant NON deviné', () => {
    const [d] = items('Taxi 2 batons');
    expect(d.amount).toBeNull();
    expect(d.uncertain).toContain('amount');
  });
  it('devise à décimales : montant en unités mineures', () => {
    expect(items('Taxi 12,50', ctx({ currency: 'EUR' }))[0].amount).toBe(1250);
  });
  it('découpage : un segment par montant même sans virgule', () => {
    expect(splitSegments('taxi 1000 garba 500')).toEqual(['taxi 1000', 'garba 500']);
  });
  it('compte et date cités : valent pour l’opération et les suivantes, jamais les précédentes', () => {
    expect(items('Par Wave taxi 1 000, garba 500').map((d) => d.accountId)).toEqual(['wave', 'wave']);
    const r = items('Garba 500, hier taxi 2 000 par Wave, crédit 1 000');
    expect(r.map((d) => [d.date, d.accountId])).toEqual([
      [TODAY, 'cash'],
      ['2026-10-06', 'wave'],
      ['2026-10-06', 'wave'],
    ]);
  });
});
