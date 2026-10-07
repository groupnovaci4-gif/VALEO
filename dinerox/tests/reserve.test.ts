import { describe, expect, it } from 'vitest';
import { dailyAllowance } from '../src/core/dailyAllowance';
import { ceilingHelp, goalKind, isClassicGoal, isReserve, refillAmount, refillReminderDate, reserveEligible, reserveHistory, reserveState, reserveUseOf, splitReserveUse } from '../src/core/reserve';
import { goalSaved } from '../src/core/balance';
import { computeGoalPlan, goalPlanFor } from '../src/core/goals';
import type { GoalContribution, Transaction } from '../src/core/types';
import { goal, tx } from './helpers';

const contrib = (p: Partial<GoalContribution>): GoalContribution => ({ id: p.id ?? `gc${Math.random()}`, createdAt: 1, updatedAt: 1, createdBy: 'u1', goalId: 'r1', amount: 0, date: '2026-10-02', ...p });
const reserve = (p = {}) => goal({ id: 'r1', kind: 'reserve', name: 'Réserve famille et cérémonies', categoryId: 'family', targetAmount: 200_000, initialAmount: 0, monthlyContribution: 20_000, targetDate: null, ...p });
const empty = { transactions: [] as Transaction[], recurring: [], goals: [], goalContributions: [] as GoalContribution[] };
const income = tx({ id: 'inc', type: 'income', amount: 300_000, accountId: 'a', date: '2026-10-01', categoryId: 'inc_salary' });

describe('réserve : solde et utilisation', () => {
  it('solde = apports − utilisations (− retraits)', () => {
    const r = reserve({ initialAmount: 10_000 });
    const cs = [contrib({ amount: 50_000 }), contrib({ amount: 20_000 }), contrib({ amount: -30_000, linkedTransactionId: 'tx1' }), contrib({ amount: -5_000 })];
    expect(reserveState(r, cs).balance).toBe(45_000);
    expect(goalSaved(r, cs)).toBe(45_000);
  });

  it('utilisation supérieure au solde : complément montré, rien de bloqué', () => {
    expect(splitReserveUse(30_000, 12_000)).toEqual({ fromReserve: 12_000, complement: 18_000 });
    expect(splitReserveUse(30_000, 50_000)).toEqual({ fromReserve: 30_000, complement: 0 });
    expect(splitReserveUse(30_000, 0)).toEqual({ fromReserve: 0, complement: 30_000 });
  });

  it('utilisation liée retrouvée par l’opération ; supprimée → plus d’utilisation', () => {
    const use = contrib({ id: 'use', amount: -10_000, linkedTransactionId: 'tx1' });
    expect(reserveUseOf('tx1', [use])?.id).toBe('use');
    expect(reserveUseOf('tx1', [{ ...use, deleted: true }])).toBeUndefined();
  });

  it('historique : apports, utilisations liées et retraits, du plus récent au plus ancien', () => {
    const h = reserveHistory('r1', [contrib({ id: 'a', amount: 5_000, date: '2026-09-01' }), contrib({ id: 'b', amount: -2_000, linkedTransactionId: 't', date: '2026-10-03' }), contrib({ id: 'c', amount: -1_000, date: '2026-10-02' })]);
    expect(h.map((m) => [m.contribution.id, m.type])).toEqual([['b', 'use'], ['c', 'withdraw'], ['a', 'deposit']]);
  });

  it('réserve basse (< 25 % du plafond) et complète', () => {
    expect(reserveState(reserve(), [contrib({ amount: 49_000 })]).low).toBe(true);
    expect(reserveState(reserve(), [contrib({ amount: 50_000 })]).low).toBe(false);
    expect(reserveState(reserve(), [contrib({ amount: 200_000 })]).full).toBe(true);
  });

  it('catégories qui proposent la réserve : famille et obligations sociales seulement', () => {
    expect(reserveEligible('cat_family')).toBe(true);
    expect(reserveEligible('cat_social')).toBe(true);
    expect(reserveEligible('cat_informal')).toBe(false);
    expect(reserveEligible('cat_food')).toBe(false);
    expect(reserveEligible(null)).toBe(false);
  });
});

describe('compatibilité : kind absent = objectif classique', () => {
  it('kind absent ou null → goal (non-régression des objectifs existants)', () => {
    const old = goal({ id: 'g', targetAmount: 1_000_000, targetDate: '2027-10-01' });
    expect(goalKind(old)).toBe('goal');
    expect(goalKind({ kind: null })).toBe('goal');
    expect(isReserve(old)).toBe(false);
    expect(isClassicGoal(old)).toBe(true);
    expect(isClassicGoal(reserve())).toBe(false);
    // Le plan d'un objectif existant est inchangé.
    expect(goalPlanFor(old, [], '2026-10-01')).toEqual(computeGoalPlan({ targetAmount: 1_000_000, saved: 0, targetDate: '2027-10-01' }, '2026-10-01'));
  });
});

describe('reste par jour et réserve', () => {
  const today = '2026-10-15';
  const daysLeft = 17;

  it('la mise de côté prévue de la réserve est déduite', () => {
    const r = dailyAllowance({ data: { ...empty, transactions: [income], goals: [reserve()] }, currency: 'XOF', today });
    expect(r.status === 'ok' && r.goalsRemaining).toBe(20_000);
    expect(r.status === 'ok' && r.perDay).toBe(Math.floor(280_000 / daysLeft));
  });

  it('mettre la somme prévue de côté ne change pas le reste par jour', () => {
    const before = dailyAllowance({ data: { ...empty, transactions: [income], goals: [reserve()] }, currency: 'XOF', today });
    const after = dailyAllowance({ data: { ...empty, transactions: [income], goals: [reserve()], goalContributions: [contrib({ amount: 20_000, date: '2026-10-05' })] }, currency: 'XOF', today });
    expect(after.status === 'ok' && before.status === 'ok' && after.perDay).toBe(before.status === 'ok' ? before.perDay : -1);
  });

  it('une utilisation de la réserve ne fait PAS baisser le reste par jour', () => {
    const saved = [contrib({ id: 'old', amount: 100_000, date: '2026-09-05' })];
    const before = dailyAllowance({ data: { ...empty, transactions: [income], goals: [reserve()], goalContributions: saved }, currency: 'XOF', today });
    const funeral = tx({ id: 'fun', type: 'expense', amount: 30_000, accountId: 'a', date: '2026-10-10', categoryId: 'cat_social' });
    const after = dailyAllowance({
      data: { ...empty, transactions: [income, funeral], goals: [reserve()], goalContributions: [...saved, contrib({ amount: -30_000, linkedTransactionId: 'fun', date: '2026-10-10' })] },
      currency: 'XOF',
      today,
    });
    expect(before.status === 'ok' && after.status === 'ok').toBe(true);
    if (before.status !== 'ok' || after.status !== 'ok') return;
    expect(after.perDay).toBe(before.perDay);
    expect(after.reserveCovered).toBe(30_000);
    expect(after.expenses).toBe(0);
  });

  it('réserve complète au début du mois : l’utiliser ne relance pas la mise de côté du mois', () => {
    const full = [contrib({ id: 'old', amount: 200_000, date: '2026-09-05' })];
    const before = dailyAllowance({ data: { ...empty, transactions: [income], goals: [reserve()], goalContributions: full }, currency: 'XOF', today });
    const gift = tx({ id: 'w', type: 'expense', amount: 50_000, accountId: 'a', date: '2026-10-10', categoryId: 'cat_social' });
    const after = dailyAllowance({ data: { ...empty, transactions: [income, gift], goals: [reserve()], goalContributions: [...full, contrib({ amount: -50_000, linkedTransactionId: 'w', date: '2026-10-10' })] }, currency: 'XOF', today });
    expect(before.status === 'ok' && before.goalsRemaining).toBe(0);
    expect(after.status === 'ok' && after.goalsRemaining).toBe(0);
    expect(after.status === 'ok' && before.status === 'ok' && after.perDay).toBe(before.status === 'ok' ? before.perDay : -1);
  });

  it('réserve insuffisante : seul le complément fait baisser le reste par jour', () => {
    const saved = [contrib({ id: 'old', amount: 10_000, date: '2026-09-05' })];
    const before = dailyAllowance({ data: { ...empty, transactions: [income], goals: [reserve()], goalContributions: saved }, currency: 'XOF', today });
    const big = tx({ id: 'big', type: 'expense', amount: 34_000, accountId: 'a', date: '2026-10-10', categoryId: 'cat_social' });
    const after = dailyAllowance({ data: { ...empty, transactions: [income, big], goals: [reserve()], goalContributions: [...saved, contrib({ amount: -10_000, linkedTransactionId: 'big', date: '2026-10-10' })] }, currency: 'XOF', today });
    if (before.status !== 'ok' || after.status !== 'ok') throw new Error('ok attendu');
    expect(after.reserveCovered).toBe(10_000);
    expect(after.expenses).toBe(24_000);
    expect(before.available - after.available).toBe(24_000);
  });

  it('une dépense famille SANS réserve fait baisser le reste par jour', () => {
    const before = dailyAllowance({ data: { ...empty, transactions: [income] }, currency: 'XOF', today });
    const mum = tx({ id: 'mum', type: 'expense', amount: 34_000, accountId: 'a', date: '2026-10-10', categoryId: 'cat_family' });
    const after = dailyAllowance({ data: { ...empty, transactions: [income, mum] }, currency: 'XOF', today });
    if (before.status !== 'ok' || after.status !== 'ok') throw new Error('ok attendu');
    expect(before.perDay - after.perDay).toBe(2_000);
  });
});

describe('aide au réglage du plafond', () => {
  const today = '2026-10-15';
  const month = (m: string, amount: number, categoryId = 'cat_family'): Transaction => tx({ type: 'expense', amount, accountId: 'a', date: `${m}-10`, categoryId });

  it('avec 12 mois d’historique : total et moyenne réels des 12 derniers mois complets', () => {
    const txs = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 25_000));
    txs.push(month('2026-06', 60_000, 'cat_social'), month('2026-05', 99_000, 'cat_food'), month('2025-09', 500_000), month('2026-10', 70_000));
    expect(ceilingHelp({ transactions: txs }, 'XOF', today)).toEqual({ kind: 'history', months: 12, total: 360_000, monthly: 30_000 });
  });

  it('avec 3 mois : moyenne sur les 3 mois couverts (pas sur 12)', () => {
    const txs = [month('2026-07', 30_000), month('2026-08', 0 + 15_000), month('2026-09', 45_000)];
    expect(ceilingHelp({ transactions: txs }, 'XOF', today)).toEqual({ kind: 'history', months: 3, total: 90_000, monthly: 30_000 });
  });

  it('sans historique suffisant : la question est posée, aucun chiffre inventé', () => {
    expect(ceilingHelp({ transactions: [] }, 'XOF', today)).toEqual({ kind: 'ask' });
    expect(ceilingHelp({ transactions: [month('2026-08', 10_000), month('2026-09', 10_000)] }, 'XOF', today)).toEqual({ kind: 'ask' });
    // 3 mois d'opérations, mais aucune dépense famille ou cérémonie : question.
    expect(ceilingHelp({ transactions: [month('2026-07', 1, 'cat_food'), month('2026-09', 1, 'cat_food')] }, 'XOF', today)).toEqual({ kind: 'ask' });
    // Autre devise ignorée.
    expect(ceilingHelp({ transactions: [month('2026-07', 1), month('2026-09', 1)].map((t) => ({ ...t, currency: 'EUR' as const })) }, 'XOF', today)).toEqual({ kind: 'ask' });
  });
});

describe('rappel « Mettre X de côté »', () => {
  it('montant : reste de la mise de côté du mois, sans dépasser le plafond', () => {
    expect(refillAmount(reserve(), [], '2026-10-15')).toBe(20_000);
    expect(refillAmount(reserve(), [contrib({ amount: 5_000, date: '2026-10-02' })], '2026-10-15')).toBe(15_000);
    expect(refillAmount(reserve(), [contrib({ amount: 190_000, date: '2026-09-02' })], '2026-10-15')).toBe(10_000);
    expect(refillAmount(reserve(), [contrib({ amount: 200_000, date: '2026-09-02' })], '2026-10-15')).toBe(0);
    expect(refillAmount(reserve({ monthlyContribution: null }), [], '2026-10-15')).toBe(0);
  });

  it('date : lendemain de la paie (ce mois-ci si à venir et à faire), sinon le mois suivant', () => {
    expect(refillReminderDate({ payDay: 25, today: '2026-10-15', pendingThisMonth: 20_000 })).toBe('2026-10-26');
    expect(refillReminderDate({ payDay: 25, today: '2026-10-15', pendingThisMonth: 0 })).toBe('2026-11-26');
    expect(refillReminderDate({ payDay: 5, today: '2026-10-15', pendingThisMonth: 20_000 })).toBe('2026-11-06');
    expect(refillReminderDate({ payDay: 31, today: '2026-10-15', pendingThisMonth: 1 })).toBe('2026-10-28');
    expect(refillReminderDate({ payDay: null, today: '2026-10-15', pendingThisMonth: 1 })).toBe('2026-11-01');
  });
});

describe('budget du mois et réserve', () => {
  it('la part prise sur la réserve ne pèse pas sur l’enveloppe ; seul le complément compte', async () => {
    const { budgetTransactions } = await import('../src/core/reserve');
    const { envelopeStatuses } = await import('../src/core/budget');
    const { envelope } = await import('./helpers');
    const fam = envelope({ id: 'fam', monthlyBudget: 20_000, categoryIds: ['cat_social'] });
    const full = tx({ id: 'full', type: 'expense', amount: 30_000, accountId: 'a', date: '2026-10-05', categoryId: 'cat_social' });
    const part = tx({ id: 'part', type: 'expense', amount: 25_000, accountId: 'a', date: '2026-10-06', categoryId: 'cat_social' });
    const uses = [contrib({ amount: -30_000, linkedTransactionId: 'full' }), contrib({ amount: -10_000, linkedTransactionId: 'part' })];
    const view = budgetTransactions([full, part], uses);
    expect(view.map((t) => [t.id, t.amount])).toEqual([['part', 15_000]]);
    const s = envelopeStatuses([fam], view, [], '2026-10', 'XOF')[0];
    expect([s.spent, s.level]).toEqual([15_000, 'ok']);
    // Sans réserve : la dépense entière compte (comportement inchangé).
    expect(envelopeStatuses([fam], budgetTransactions([full], []), [], '2026-10', 'XOF')[0].level).toBe('critical');
  });
});
