import { describe, expect, it } from 'vitest';
import { parseIntent, extractAmounts, extractMonths } from '../src/core/ai/parser';
import { answerQuestion } from '../src/core/ai/answers';
import { emptySpaceData } from '../src/core/types';
import { account, envelope, tx } from './helpers';

const NOW = '2026-10-04';

describe('montants', () => {
  it('formats usuels', () => {
    expect(extractAmounts('5000')).toEqual([5000]);
    expect(extractAmounts('5 000')).toEqual([5000]);
    expect(extractAmounts('5k')).toEqual([5000]);
    expect(extractAmounts('250 mille')).toEqual([250000]);
    expect(extractAmounts('8 millions')).toEqual([8000000]);
    expect(extractAmounts('1,5 million')).toEqual([1500000]);
    expect(extractAmounts('deux millions')).toEqual([2000000]);
  });
  it('ignore les durées', () => {
    expect(extractAmounts('8 millions dans 3 ans')).toEqual([8000000]);
    expect(extractMonths('dans trois ans')).toBe(36);
    expect(extractMonths('en 18 mois')).toBe(18);
  });
});

describe('intentions', () => {
  it('dépense au restaurant', () => {
    expect(parseIntent("J'ai dépensé 5000 au restaurant.", NOW)).toMatchObject({ kind: 'expense', amount: 5000, categoryId: 'cat_food' });
  });
  it('revenu', () => {
    expect(parseIntent("J'ai reçu 250 000 aujourd'hui.", NOW)).toMatchObject({ kind: 'income', amount: 250000 });
    expect(parseIntent("J'ai reçu mon salaire de 450000.", NOW)).toMatchObject({ kind: 'income', amount: 450000, categoryId: 'inc_salary' });
  });
  it('envoi à maman = dépense famille', () => {
    expect(parseIntent("J'ai envoyé 30000 à maman.", NOW)).toMatchObject({ kind: 'expense', amount: 30000, categoryId: 'cat_family', payee: 'maman' });
  });
  it('hier', () => {
    expect(parseIntent("J'ai payé 2000 de taxi hier", NOW)).toMatchObject({ kind: 'expense', date: '2026-10-03', categoryId: 'cat_transport' });
  });
  it('transfert entre comptes', () => {
    expect(parseIntent('Transfère 20000 de Orange Money vers Wave', NOW)).toMatchObject({ kind: 'transfer', amount: 20000, from: 'orange_money', to: 'wave' });
    expect(parseIntent("J'ai retiré 10000 de wave", NOW)).toMatchObject({ kind: 'transfer', from: 'wave', to: 'cash' });
  });
  it('objectif avec montant et durée', () => {
    const i = parseIntent('Je veux acheter une voiture à 8 millions dans trois ans.', NOW);
    expect(i).toMatchObject({ kind: 'goal', amount: 8000000, months: 36, name: 'Acheter une voiture' });
  });
  it('objectif sans montant', () => {
    expect(parseIntent('Je veux économiser pour acheter une moto.', NOW)).toMatchObject({ kind: 'goal', amount: null, name: 'Acheter une moto' });
    expect(parseIntent('Je veux construire une maison mais je ne sais pas combien économiser.', NOW)).toMatchObject({ kind: 'goal', unknownAmount: true, name: 'Construire une maison' });
  });
  it('questions', () => {
    expect(parseIntent('Combien me reste-t-il pour la nourriture ?', NOW)).toMatchObject({ kind: 'question', topic: 'remaining_category', categoryId: 'cat_food' });
    expect(parseIntent('Combien ai-je dépensé ce mois-ci ?', NOW)).toMatchObject({ kind: 'question', topic: 'spent_month' });
    expect(parseIntent('Combien ai-je dépensé en nourriture ?', NOW)).toMatchObject({ kind: 'question', topic: 'spent_category', categoryId: 'cat_food' });
    expect(parseIntent('Où part le plus mon argent ?', NOW)).toMatchObject({ kind: 'question', topic: 'top_category' });
    expect(parseIntent('Est-ce que je peux acheter ce téléphone à 150000 ?', NOW)).toMatchObject({ kind: 'question', topic: 'can_afford', amount: 150000 });
    expect(parseIntent("Pourquoi je n'arrive jamais à épargner ?", NOW)).toMatchObject({ kind: 'question', topic: 'why_no_savings' });
    expect(parseIntent('Compare ce mois au mois dernier.', NOW)).toMatchObject({ kind: 'question', topic: 'compare_months' });
    expect(parseIntent('Fais-moi un résumé financier du mois.', NOW)).toMatchObject({ kind: 'question', topic: 'month_summary' });
    expect(parseIntent('Puis-je atteindre mon objectif ?', NOW)).toMatchObject({ kind: 'question', topic: 'goal_feasibility' });
    expect(parseIntent('Comment réduire mes dépenses ?', NOW)).toMatchObject({ kind: 'question', topic: 'reduce_spending' });
  });
  it('phrase incomprise', () => {
    expect(parseIntent('bonjour', NOW)).toEqual({ kind: 'unknown' });
  });
});

describe('réponses fondées sur les données réelles', () => {
  const data = emptySpaceData();
  data.accounts = [account({ id: 'cash', openingBalance: 100_000 })];
  data.envelopes = [envelope({ id: 'food', name: 'Nourriture', monthlyBudget: 80_000, categoryIds: ['cat_food'] })];
  data.transactions = [
    tx({ type: 'expense', amount: 30_000, accountId: 'cash', categoryId: 'cat_food', date: '2026-10-02' }),
    tx({ type: 'income', amount: 450_000, accountId: 'cash', date: '2026-10-01' }),
  ];
  const ctx = { data, currency: 'XOF' as const, now: NOW, categoryName: (id: string) => id };

  it('aucune donnée → le dit, n invente rien', () => {
    expect(answerQuestion({ kind: 'question', topic: 'spent_month', categoryId: null, amount: null }, { ...ctx, data: emptySpaceData() }).key).toBe('ai.a.noData');
  });
  it('dépensé ce mois', () => {
    expect(answerQuestion({ kind: 'question', topic: 'spent_month', categoryId: null, amount: null }, ctx)).toMatchObject({ params: { amount: 30_000, income: 450_000 } });
  });
  it('reste nourriture', () => {
    expect(answerQuestion({ kind: 'question', topic: 'remaining_category', categoryId: 'cat_food', amount: null }, ctx)).toMatchObject({ key: 'ai.a.remainingEnvelope', params: { remaining: 50_000 } });
  });
  it('puis-je acheter : non si au-delà du libre', () => {
    expect(answerQuestion({ kind: 'question', topic: 'can_afford', categoryId: null, amount: 1_000_000 }, ctx).key).toBe('ai.a.affordNo');
    expect(answerQuestion({ kind: 'question', topic: 'can_afford', categoryId: null, amount: 10_000 }, ctx).key).toBe('ai.a.affordYes');
  });
});
