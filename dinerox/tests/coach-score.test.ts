/** Phase 5 — score de comportement financier. */
import { describe, expect, it } from 'vitest';
import { SCORE_WEIGHTS, behaviorScore, explainChange, latestScore } from '../src/core/coach/score';
import { emptySpaceData, type SpaceData } from '../src/core/types';
import { account, envelope, goal, tx } from './helpers';

const food = envelope({ id: 'food', monthlyBudget: 100_000, categoryIds: ['cat_food'] });
const ops = (m: string, n: number, amount = 1_000) => Array.from({ length: n }, (_, i) => tx({ type: 'expense', amount, accountId: 'a', categoryId: 'cat_food', date: `${m}-${String((i % 27) + 1).padStart(2, '0')}` }));
const base = (t = ops('2026-09', 12), extra: Partial<SpaceData> = {}): SpaceData => ({ ...emptySpaceData(), envelopes: [food], accounts: [account({ id: 'a' }), account({ id: 'sav', isSavings: true })], transactions: t, ...extra });

describe('score de comportement', () => {
  it('poids : 30 / 25 / 20 / 15 / 10', () => {
    expect(SCORE_WEIGHTS).toEqual({ budgets: 30, savings: 25, goals: 20, debts: 15, emergency: 10 });
  });
  it('seuil minimal : aucun score sous 10 opérations ni pour le mois en cours', () => {
    expect(behaviorScore(base(ops('2026-09', 9)), 'XOF', '2026-09').score).toBeNull();
    // latestScore évalue le dernier mois COMPLET : en octobre, c'est septembre.
    expect(latestScore(base(ops('2026-10', 30)), 'XOF', '2026-10-20').score).toBeNull();
    expect(latestScore(base(), 'XOF', '2026-10-20').month).toBe('2026-09');
  });
  it('composantes sans données exclues, poids renormalisés', () => {
    const s = behaviorScore(base(), 'XOF', '2026-09');
    const by = Object.fromEntries(s.components.map((c) => [c.id, c]));
    expect(by.goals.value).toBeNull();
    expect(by.debts.value).toBeNull();
    expect(by.goals.effectiveWeight).toBe(0);
    // budgets 100, épargne 0, fonds d'urgence 0 → (30×100) / (30 + 25 + 10) = 46
    expect(by.budgets.value).toBe(100);
    expect(by.savings.value).toBe(0);
    expect(by.emergency.value).toBe(0);
    expect(s.score).toBe(Math.round((30 * 100) / 65));
    expect(s.components.reduce((n, c) => n + c.effectiveWeight, 0)).toBeCloseTo(1);
  });
  it('budget dépassé : la composante baisse proportionnellement (budget / dépensé)', () => {
    const over = behaviorScore(base([...ops('2026-09', 12), tx({ type: 'expense', amount: 188_000, accountId: 'a', categoryId: 'cat_food', date: '2026-09-28' })]), 'XOF', '2026-09');
    expect(over.components.find((c) => c.id === 'budgets')!.value).toBe(50); // 100 000 / 200 000
  });
  it('épargne régulière, objectifs, dettes en retard, fonds d’urgence', () => {
    const t = [...ops('2026-09', 12), ...['2026-07-10', '2026-08-10', '2026-09-10'].map((date) => tx({ type: 'transfer', amount: 10_000, accountId: 'a', toAccountId: 'sav', date }))];
    const g = goal({ id: 'g', targetAmount: 1_200_000, targetDate: '2027-09-30' });
    const fund = goal({ id: 'f', templateId: 'emergency_fund', targetAmount: 300_000 } as never);
    const c = (goalId: string, amount: number) => ({ id: `c${goalId}`, goalId, amount, date: '2026-09-15', createdAt: 1, updatedAt: 1, createdBy: 'u' });
    const late = { id: 'd', direction: 'i_owe', kind: 'personal', counterparty: 'X', principal: 100_000, currency: 'XOF', startDate: '2026-01-01', installment: 10_000, dueDay: 5, status: 'active', createdAt: 1, updatedAt: 1, createdBy: 'u' };
    const s = behaviorScore(base(t, { goals: [g, fund], goalContributions: [c('g', 100_000), c('f', 150_000)], debts: [late as never] }), 'XOF', '2026-09');
    const by = Object.fromEntries(s.components.map((x) => [x.id, x.value]));
    expect(by.savings).toBe(100);
    expect(by.goals).toBe(100); // 100 000 versés ≥ besoin mensuel (~92 000)
    expect(by.debts).toBe(0); // échéance du 5 non payée à la fin du mois
    expect(by.emergency).toBe(50);
  });
  it('explication des variations : composante la plus influente en premier, somme = écart', () => {
    const before = behaviorScore(base([...ops('2026-08', 12), tx({ type: 'expense', amount: 188_000, accountId: 'a', categoryId: 'cat_food', date: '2026-08-28' })]), 'XOF', '2026-08');
    const after = behaviorScore(base([...ops('2026-08', 12), ...ops('2026-09', 12)]), 'XOF', '2026-09');
    const e = explainChange(before, after);
    expect(e.delta).toBe(after.score! - before.score!);
    expect(e.changes[0].id).toBe('budgets');
    expect(e.changes[0].points).toBeGreaterThan(0);
    expect(Math.abs(e.changes.reduce((n, c) => n + c.points, 0) - e.delta!)).toBeLessThanOrEqual(1);
  });
});
