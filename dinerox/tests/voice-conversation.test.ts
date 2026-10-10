/** 1.9 — Mini-conversation vocale, phases 2 et 3 : reformulation, réponses dites, bilan après enregistrement. */
import { describe, expect, it } from 'vitest';
import { parseEntryText, type EntryContext, type EntryDraft } from '../src/core/entry/parse';
import { ACKS, MAX_QUESTIONS, answerPending, applyCommand, crossedEnvelopes, dayPart, followUps, greeting, interpretReply, nextAck, recap, savedSummary, startConversation, type ConvLabels, type ConvState, type Sentence } from '../src/core/entry/conversation';
import { catalogStarterDocs } from '../src/core/categoryCatalog';
import { systemCategories } from '../src/core/defaults';
import { envelopeStatuses } from '../src/core/budget';
import { dailyAllowance } from '../src/core/dailyAllowance';
import type { Category, SpaceData } from '../src/core/types';
import { account, envelope, tx } from './helpers';

const TODAY = '2026-10-07';
const cats: Category[] = [...systemCategories({ now: 1, uid: 'u', zone: 'africa' }).filter((c) => c.kind === 'income' || c.id === 'cat_other'), ...catalogStarterDocs('CI', { now: 1, uid: 'u' })];
const wave = account({ id: 'wave', type: 'mobile_money', provider: 'wave', name: 'Wave' });
const bank = account({ id: 'bank', type: 'bank', name: 'Ma banque' });
const ctx: EntryContext = { today: TODAY, currency: 'XOF', accounts: [wave, bank], categories: cats, defaultAccountId: 'wave' };
const NAMES: Record<string, string> = { sub_housing_electricity: 'Électricité', sub_housing_water: 'Eau', sub_food_market: 'Marché', sub_housing_rent: 'Loyer', cat_transport: 'Transport', cat_health: 'Santé', sub_comm_airtime: 'Crédit téléphonique', sub_food_water: 'Eau', inc_salary: 'Salaire' };
const labels: ConvLabels = { line: (d) => (d.type === 'savings' ? 'Épargne' : NAMES[d.subcategoryId ?? d.categoryId ?? ''] ?? '?'), account: (id) => (id === 'bank' ? 'Ma banque' : 'Wave') };

const REFERENCE = "J'ai dépensé 30 000 en facture d'électricité, 30 000 en facture d'eau, 30 000 au marché, et 100 000 en loyer, 10 000 en transport, 5 000 en santé, ainsi de suite.";
const drafts = (text: string): EntryDraft[] => {
  const r = parseEntryText(text, ctx);
  if (r.kind !== 'entries') throw new Error(r.kind);
  return r.items;
};
const keys = (ss: Sentence[]) => ss.map((s) => s.key);
const say = (s: ConvState, text: string) => interpretReply(text, s, ctx, labels);
const total = (s: ConvState) => s.drafts.reduce((n, d) => n + (d.amount ?? 0), 0);

describe('reformulation de l’exemple de référence', () => {
  const s = startConversation(drafts(REFERENCE));
  it('salutation, introduction, 6 lignes, total + compte, « Je les enregistre ? »', () => {
    const r = recap(s, labels, greeting(20, 'Konan'));
    expect(r[0]).toEqual({ key: 'conv.greet.evening', params: { name: 'Konan' } });
    expect(r[1].key).toBe('conv.intro.expense');
    expect(r.filter((x) => x.bullet).map((x) => [x.key, x.params?.amount, x.params?.label])).toEqual([
      ['conv.line.expense', 30_000, 'Électricité'],
      ['conv.line.expense', 30_000, 'Eau'],
      ['conv.line.expense', 30_000, 'Marché'],
      ['conv.line.expense', 100_000, 'Loyer'],
      ['conv.line.expense', 10_000, 'Transport'],
      ['conv.line.expense', 5_000, 'Santé'],
    ]);
    expect(r.at(-2)).toEqual({ key: 'conv.total.expense', params: { total: 205_000, account: 'Wave' } });
    expect(r.at(-1)).toEqual({ key: 'conv.confirm.many' });
    expect(s.pending).toBeNull();
  });
  it('« oui » → validation ; rien n’est enregistré avant (c’est l’écran qui décide)', () => {
    for (const t of ['Oui', 'oui, c’est bon', 'Valide', 'Enregistre', "D'accord", 'ok']) expect(say(s, t)).toEqual({ kind: 'confirm' });
  });
  it('« non, annule » / « laisse tomber » / « annule tout » → annulation', () => {
    for (const t of ['Non, annule', 'Laisse tomber', 'Annule tout']) expect(say(s, t)).toEqual({ kind: 'cancel' });
  });
  it('« Non, le loyer c’est 120 000 » → loyer corrigé, nouveau total 225 000, reformulation courte', () => {
    const cmd = say(s, "Non, le loyer c'est 120 000");
    expect(cmd).toEqual({ kind: 'amount', index: 3, amount: 120_000 });
    const { state, reply } = applyCommand(s, cmd, labels);
    expect(total(state)).toBe(225_000);
    expect(reply).toEqual([
      { key: 'conv.changed.amount', params: { label: 'Loyer', amount: 120_000 } },
      { key: 'conv.newTotal', params: { total: 225_000 } },
      { key: 'conv.confirm.many' },
    ]);
  });
  it('« Enlève la santé » → 5 lignes, 200 000', () => {
    const cmd = say(s, 'Enlève la santé');
    expect(cmd).toEqual({ kind: 'remove', index: 5 });
    const { state, reply } = applyCommand(s, cmd, labels);
    expect(state.drafts).toHaveLength(5);
    expect(keys(reply)).toEqual(['conv.changed.removed', 'conv.newTotal', 'conv.confirm.many']);
    expect(total(state)).toBe(200_000);
  });
  it('« Ajoute 2 000 de crédit téléphone » → 7 lignes, 207 000', () => {
    const cmd = say(s, 'Ajoute 2 000 de crédit téléphone');
    expect(cmd.kind).toBe('add');
    const { state, reply } = applyCommand(s, cmd, labels);
    expect(state.drafts.at(-1)?.subcategoryId).toBe('sub_comm_airtime');
    expect(total(state)).toBe(207_000);
    expect(keys(reply)).toEqual(['conv.changed.added', 'conv.line.expense', 'conv.newTotal', 'conv.confirm.many']);
  });
  it('« C’était hier » → toutes les lignes datées de la veille', () => {
    const cmd = say(s, "C'était hier");
    expect(cmd).toEqual({ kind: 'date', index: null, date: '2026-10-06' });
    expect(applyCommand(s, cmd, labels).state.drafts.every((d) => d.date === '2026-10-06')).toBe(true);
  });
  it('« Paie le loyer avec la banque » → seule la ligne du loyer change de compte', () => {
    const cmd = say(s, 'Paie le loyer avec la banque');
    expect(cmd).toEqual({ kind: 'account', index: 3, accountId: 'bank' });
    const { state, reply } = applyCommand(s, cmd, labels);
    expect(state.drafts.map((d) => d.accountId)).toEqual(['wave', 'wave', 'wave', 'bank', 'wave', 'wave']);
    expect(reply[0]).toEqual({ key: 'conv.changed.accountLine', params: { label: 'Loyer', account: 'Ma banque' } });
  });
  it('« Tout avec la banque » → toutes les lignes', () => {
    const cmd = say(s, 'Tout avec la banque');
    expect(cmd).toEqual({ kind: 'account', index: null, accountId: 'bank' });
  });
  it('la facture d’eau est bien distinguée de celle d’électricité', () => {
    expect(say(s, "la facture d'eau c'est 25 000")).toEqual({ kind: 'amount', index: 1, amount: 25_000 });
  });
  it('question au lieu d’une réponse → assistant ; phrase incomprise → « je n’ai pas compris »', () => {
    expect(say(s, 'Combien il me reste pour le transport ?')).toEqual({ kind: 'question' });
    expect(say(s, 'bof')).toEqual({ kind: 'unknown' });
  });
});

describe('questions : au plus 2 par note vocale', () => {
  it('« 30 000 en eau » → une seule question, réponse à la voix ou par bouton', () => {
    let s = startConversation(drafts('30 000 en eau'));
    expect(s.pending?.question.id).toBe('water');
    expect(recap(s, labels, greeting(9, null)).at(-1)).toEqual({ key: 'conv.ask.water', params: { word: 'eau' } });
    // Pas de « oui » tant que la question est ouverte.
    expect(say(s, 'oui').kind).toBe('unknown');
    expect(say(s, "de l'eau à boire")).toEqual({ kind: 'answer', optionId: 'drink' });
    expect(say(s, "c'est la facture")).toEqual({ kind: 'answer', optionId: 'bill' });
    const r = applyCommand(s, { kind: 'answer', optionId: 'drink' }, labels);
    s = r.state;
    expect([s.drafts[0].categoryId, s.drafts[0].subcategoryId]).toEqual(['cat_food', 'sub_food_water']);
    expect(s.drafts[0].uncertain).toEqual([]);
    expect(keys(r.reply)).toEqual(['conv.changed.answer', 'conv.confirm.one']);
  });
  it('trois mots ambigus → 2 questions, la troisième ligne reste « à vérifier »', () => {
    let s = startConversation(drafts('30 000 en eau, 2 000 eau, 500 eau'));
    expect(s.asked).toBe(1);
    s = answerPending(s, 'bill');
    expect(s.asked).toBe(2);
    s = answerPending(s, 'drink');
    expect(s.asked).toBe(MAX_QUESTIONS);
    expect(s.pending).toBeNull();
    expect(s.drafts[2].question).toBeNull();
    expect(s.drafts[2].uncertain).toContain('category');
    expect(recap(s, labels, { key: 'conv.ack.ok' }).at(-1)).toEqual({ key: 'conv.toCheck', params: { count: 1 } });
  });
  it('catégorie inconnue : « Autres » ou « créer » (créée à la validation)', () => {
    const d: EntryDraft = { ...drafts('taxi 2 000')[0], categoryId: null, subcategoryId: null, uncertain: ['category'], question: { id: 'unknownCategory', word: 'djakarta', options: [{ id: 'other', categoryId: 'cat_other', subcategoryId: null }, { id: 'create', categoryId: null, subcategoryId: null }] } };
    const s = startConversation([d]);
    expect(say(s, 'mets dans autres')).toEqual({ kind: 'answer', optionId: 'other' });
    expect(say(s, 'crée la catégorie')).toEqual({ kind: 'answer', optionId: 'create' });
    expect(answerPending(s, 'create').drafts[0].newCategoryName).toBe('Djakarta');
    expect(answerPending(s, 'other').drafts[0].categoryId).toBe('cat_other');
  });
});

describe('salutation et variantes', () => {
  it('moment de la journée', () => {
    expect([dayPart(8), dayPart(14), dayPart(20), dayPart(2)]).toEqual(['morning', 'afternoon', 'evening', 'evening']);
    expect(greeting(8, '')).toEqual({ key: 'conv.greet.morning.anon', params: {} });
  });
  it('jamais deux fois la même phrase de suite', () => {
    let last: string | null = null;
    for (let i = 0; i < 8; i++) {
      const a = nextAck(last);
      expect(a).not.toBe(last);
      expect(ACKS).toContain(a);
      last = a;
    }
  });
});

// ─── Après l'enregistrement ────────────────────────────────────────────

describe('bilan après enregistrement (calculé par le code)', () => {
  const housing = envelope({ id: 'env_house', name: 'Logement', monthlyBudget: 160_000, categoryIds: ['cat_housing'] });
  const food = envelope({ id: 'env_food', name: 'Alimentation', monthlyBudget: 35_000, categoryIds: ['cat_food'] });
  const transport = envelope({ id: 'env_tr', name: 'Transport', monthlyBudget: 100_000, categoryIds: ['cat_transport'] });
  const income = tx({ type: 'income', amount: 500_000, accountId: 'wave', categoryId: 'inc_salary', date: '2026-10-01' });
  const before = [income];
  const saved = drafts(REFERENCE);
  const after = [...before, ...saved.map((d, i) => tx({ id: `n${i}`, type: 'expense', amount: d.amount!, accountId: 'wave', categoryId: d.categoryId, subcategoryId: d.subcategoryId, date: d.date }))];
  const st = (list: typeof before) => envelopeStatuses([housing, food, transport], list, [], '2026-10', 'XOF');
  const data = (list: typeof before): Pick<SpaceData, 'transactions' | 'recurring' | 'goals' | 'goalContributions'> => ({ transactions: list, recurring: [], goals: [], goalContributions: [] });

  it('UNE phrase pour toutes les enveloppes qui franchissent un seuil, et le reste par jour exact', () => {
    const allowance = dailyAllowance({ data: data(after), currency: 'XOF', today: TODAY, financial: undefined });
    const r = savedSummary({ drafts: saved, before: st(before), after: st(after), month: '2026-10', budgets: [], allowance });
    expect(r[0]).toEqual({ key: 'conv.done.expense.many', params: { count: 6, total: 205_000 } });
    // Logement 160 000 / 160 000 = 100 % ; Alimentation 30 000 / 35 000 = 85 % ; Transport 10 % : rien.
    expect(r[1]).toEqual({ key: 'conv.done.envelopes', params: { list: 'Logement 100 %, Alimentation 85 %' } });
    expect(r.filter((x) => x.key.startsWith('conv.done.envelope'))).toHaveLength(1);
    // (500 000 − 205 000) / 25 jours restants (7 → 31 octobre) = 11 800.
    expect(allowance.status === 'ok' && allowance.perDay).toBe(11_800);
    expect(r[2]).toEqual({ key: 'conv.done.perDay', params: { amount: 11_800, day: 31 } });
  });
  it('une seule enveloppe : pourcentage, ou dépassement en montant', () => {
    const only = saved.filter((d) => d.categoryId === 'cat_housing');
    const list = [...before, ...only.map((d, i) => tx({ id: `h${i}`, type: 'expense', amount: d.amount!, accountId: 'wave', categoryId: 'cat_housing', date: TODAY }))];
    expect(savedSummary({ drafts: only, before: st(before), after: st(list), month: '2026-10', budgets: [], allowance: null })[1]).toEqual({ key: 'conv.done.envelope', params: { envelope: 'Logement', percent: 100 } });
    const over = [...list, tx({ id: 'x', type: 'expense', amount: 10_000, accountId: 'wave', categoryId: 'cat_housing', date: TODAY })];
    expect(crossedEnvelopes(st(list), st(over), '2026-10', [])).toEqual([expect.objectContaining({ level: 'critical' })]);
    expect(savedSummary({ drafts: only, before: st(list), after: st(over), month: '2026-10', budgets: [], allowance: null })[1]).toEqual({ key: 'conv.done.envelopeOver', params: { envelope: 'Logement', over: 10_000 } });
  });
  it('enveloppe sans budget fixé : jamais d’alerte', () => {
    const empty = envelope({ id: 'e0', name: 'Santé', monthlyBudget: 0, categoryIds: ['cat_health'] });
    const s0 = envelopeStatuses([empty], before, [], '2026-10', 'XOF');
    const s1 = envelopeStatuses([empty], after, [], '2026-10', 'XOF');
    expect(crossedEnvelopes(s0, s1, '2026-10', [])).toEqual([]);
  });
  it('catégorie sans enveloppe : proposée UNE fois ; salaire : répartition proposée, jamais appliquée', () => {
    expect(followUps({ drafts: saved, envelopes: [housing, food, transport], offered: [] })).toEqual({ envelopeFor: 'cat_health', salary: null });
    expect(followUps({ drafts: saved, envelopes: [housing, food, transport], offered: ['cat_health'] }).envelopeFor).toBeNull();
    // Aucune enveloppe du tout : on ne harcèle pas.
    expect(followUps({ drafts: saved, envelopes: [], offered: [] }).envelopeFor).toBeNull();
    const pay = drafts("J'ai reçu mon salaire 250 000");
    expect(followUps({ drafts: pay, envelopes: [housing], offered: [] }).salary).toBe(250_000);
  });
  it('mélange dépense + revenu + épargne : « C’est fait : 3 opérations »', () => {
    const mix = drafts("J'ai reçu mon salaire 250 000, j'ai mis 50 000 de côté et payé 10 000 de transport");
    expect(savedSummary({ drafts: mix, before: [], after: [], month: '2026-10', budgets: [], allowance: null })).toEqual([{ key: 'conv.done.mixed', params: { count: 3 } }]);
    // Sans compte d'épargne : la ligne de versement est « à vérifier » (compte à choisir, jamais deviné).
    const r = recap(startConversation(mix), labels, { key: 'conv.ack.ok' });
    expect(keys(r)).toEqual(['conv.ack.ok', 'conv.intro.mixed', 'conv.line.income', 'conv.line.savings', 'conv.line.expense', 'conv.sum.income', 'conv.sum.savings', 'conv.sum.expense', 'conv.sum.account', 'conv.toCheck']);
    // Avec un seul compte d'épargne : choisi, plus rien à vérifier.
    const sav = account({ id: 'sav', name: 'Épargne', isSavings: true });
    const r2 = parseEntryText("J'ai reçu mon salaire 250 000, j'ai mis 50 000 de côté et payé 10 000 de transport", { ...ctx, accounts: [wave, bank, sav] });
    expect(r2.kind === 'entries' && recap(startConversation(r2.items), labels, { key: 'conv.ack.ok' }).at(-1)).toEqual({ key: 'conv.confirm.many' });
  });
});
