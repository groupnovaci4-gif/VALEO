/**
 * Score de comportement financier — argent disponible v2 (docs/argent-disponible.md §11.5).
 * Réécrit à l'étape 3A : les composantes de la phase 5 (objectifs, régularité de l'épargne)
 * sont remplacées par celles du §11.5 (taux d'épargne, vivre selon ses moyens, épargne de
 * précaution, respect du budget, dettes), calculées sur les revenus REÇUS.
 */
import { describe, expect, it } from 'vitest';
import { SCORE_WEIGHTS, behaviorScore, explainChange, latestScore } from '../src/core/coach/score';
import { emptySpaceData, type SpaceData } from '../src/core/types';
import { account, envelope, tx } from './helpers';

const food = envelope({ id: 'food', monthlyBudget: 100_000, categoryIds: ['cat_food'] });
const ops = (m: string, n: number, amount = 1_000) => Array.from({ length: n }, (_, i) => tx({ type: 'expense', amount, accountId: 'a', categoryId: 'cat_food', date: `${m}-${String((i % 27) + 1).padStart(2, '0')}` }));
const salary = (m: string, amount = 200_000) => tx({ type: 'income', amount, accountId: 'a', categoryId: 'inc_salary', date: `${m}-01` });
const base = (t = [salary('2026-09'), ...ops('2026-09', 12)], extra: Partial<SpaceData> = {}): SpaceData => ({ ...emptySpaceData(), envelopes: [food], accounts: [account({ id: 'a' }), account({ id: 'sav', isSavings: true })], transactions: t, ...extra });
const by = (s: ReturnType<typeof behaviorScore>) => Object.fromEntries(s.components.map((c) => [c.id, c]));

describe('score de comportement v2', () => {
  it('poids : taux d’épargne 30, vivre selon ses moyens 25, précaution 20, budget 15, dettes 10', () => {
    expect(SCORE_WEIGHTS).toEqual({ savings: 30, means: 25, emergency: 20, budgets: 15, debts: 10 });
  });

  it('aucun score sans revenu reçu, sous 10 opérations, ni pour le mois en cours', () => {
    expect(behaviorScore(base(ops('2026-09', 12)), 'XOF', '2026-09').score).toBeNull();
    expect(behaviorScore(base([salary('2026-09'), ...ops('2026-09', 8)]), 'XOF', '2026-09').score).toBeNull();
    expect(latestScore(base([salary('2026-10'), ...ops('2026-10', 30)]), 'XOF', '2026-10-20').score).toBeNull();
    expect(latestScore(base(), 'XOF', '2026-10-20').month).toBe('2026-09');
  });

  it('composantes sans données exclues, poids renormalisés ; 0 F épargné → taux d’épargne 0', () => {
    const s = behaviorScore(base(), 'XOF', '2026-09');
    const c = by(s);
    expect(c.debts.value).toBeNull();
    expect(c.debts.effectiveWeight).toBe(0);
    expect([c.savings.value, c.means.value, c.emergency.value, c.budgets.value]).toEqual([0, 100, 0, 100]);
    // (25 × 100 + 15 × 100) / (30 + 25 + 20 + 15) = 44
    expect(s.score).toBe(Math.round((25 * 100 + 15 * 100) / 90));
    expect(s.components.reduce((n, x) => n + x.effectiveWeight, 0)).toBeCloseTo(1);
  });

  it('budget dépassé : 1 − dépassement / budget', () => {
    const over = behaviorScore(base([salary('2026-09'), ...ops('2026-09', 12), tx({ type: 'expense', amount: 138_000, accountId: 'a', categoryId: 'cat_food', date: '2026-09-28' })]), 'XOF', '2026-09');
    expect(by(over).budgets.value).toBe(50); // 150 000 dépensés pour 100 000 : 1 − 50 000 / 100 000
  });

  it('épargne, précaution et dettes en retard', () => {
    const t = [salary('2026-09'), ...ops('2026-09', 12), ...['2026-07-10', '2026-08-10', '2026-09-10'].map((date) => tx({ type: 'transfer', amount: 10_000, accountId: 'a', toAccountId: 'sav', date }))];
    const late = { id: 'd', direction: 'i_owe', kind: 'personal', counterparty: 'X', principal: 100_000, currency: 'XOF', startDate: '2026-01-01', installment: 10_000, dueDay: 5, status: 'active', createdAt: 1, updatedAt: 1, createdBy: 'u' };
    const c = by(behaviorScore(base(t, { debts: [late as never] }), 'XOF', '2026-09'));
    expect(c.savings.value).toBe(50); // 10 000 / 200 000 = 5 % → moitié de l'objectif de 10 %
    expect(c.emergency.value).toBe(100); // 30 000 sur l'épargne pour 4 000 d'essentiels par mois
    expect(c.debts.value).toBe(50); // échéance du 5 non payée ; mensualités 5 % des revenus
  });

  it('explication des variations : somme des points = écart', () => {
    const before = behaviorScore(base([salary('2026-08'), ...ops('2026-08', 12), tx({ type: 'expense', amount: 188_000, accountId: 'a', categoryId: 'cat_food', date: '2026-08-28' })]), 'XOF', '2026-08');
    const after = behaviorScore(base([salary('2026-08'), ...ops('2026-08', 12), salary('2026-09'), ...ops('2026-09', 12)]), 'XOF', '2026-09');
    const e = explainChange(before, after);
    expect(e.delta).toBe(after.score! - before.score!);
    expect(e.changes[0].points).not.toBe(0);
    expect(Math.abs(e.changes.reduce((n, x) => n + x.points, 0) - e.delta!)).toBeLessThanOrEqual(1);
  });
});
