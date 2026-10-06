/**
 * Non-régression de l'audit v1.4 : chaque test reproduit un bug corrigé.
 */
import { describe, expect, it } from 'vitest';
import { proposeBudget } from '../src/core/budget';
import { starterStructure } from '../src/core/defaults';
import { debtStatus, debtTotals, nextDueDate } from '../src/core/debts';
import { moneyPosition } from '../src/core/balance';
import { allocateCapacity } from '../src/core/goals';
import { financialSnapshot, observedCapacity } from '../src/core/intelligence';
import { buildReport } from '../src/core/reports';
import { emptySpaceData, type Debt, type DebtPayment, type GoalContribution } from '../src/core/types';
import { account, goal, tx } from './helpers';

const base = { createdAt: 1, updatedAt: 1, createdBy: 'u1' };
const debt = (p: Partial<Debt> = {}): Debt => ({ ...base, id: 'd1', direction: 'i_owe', kind: 'personal', counterparty: 'Awa', principal: 300000, currency: 'XOF', startDate: '2026-01-01', status: 'active', ...p });
const pay = (p: Partial<DebtPayment> & Pick<DebtPayment, 'amount' | 'date'>): DebtPayment => ({ ...base, id: `p${p.date}${p.amount}`, debtId: 'd1', ...p });
const contrib = (p: Partial<GoalContribution> & Pick<GoalContribution, 'goalId' | 'amount'>): GoalContribution => ({ ...base, id: `c${Math.random()}`, date: '2026-10-01', ...p });

describe('budgets : jamais de ligne négative, jamais plus que le revenu', () => {
  it('proposeBudget', () => {
    for (const m of ['50_30_20', 'envelopes', 'zero_based'] as const)
      for (const inc of [1000, 4999, 8500, 9000, 9500, 12345, 450000, 1234567]) {
        const l = proposeBudget(inc, m, 'XOF');
        expect(l.every((x) => x.amount >= 0), `${m} ${inc}`).toBe(true);
        expect(l.reduce((s, x) => s + x.amount, 0)).toBe(inc);
      }
  });
  it('budget de départ : loyer déclaré conservé, total = revenu', () => {
    const s = starterStructure({ firstName: 'A', currency: 'XOF', country: 'CI', zone: 'africa', monthlyIncome: 300000, fixedCharges: { sub_housing_rent: 280000 } }, { now: 1, uid: 'u', lang: 'fr', label: (k) => k, date: '2026-10-06' });
    const total = s.envelopes!.reduce((n, e) => n + e.monthlyBudget, 0);
    expect(total).toBe(300000);
    expect(s.envelopes!.find((e) => e.categoryIds.includes('cat_housing'))!.monthlyBudget).toBe(280000);
    expect(s.envelopes!.every((e) => e.monthlyBudget >= 0)).toBe(true);
  });
});

describe('dettes : échéances', () => {
  const d = debt({ installment: 50000, dueDay: 5 });
  it('échéance passée non payée → reste due (retard)', () => {
    expect(nextDueDate(d, '2026-10-10', [])).toBe('2026-10-05');
    expect(debtStatus(d, [], '2026-10-10').daysToDue).toBe(-5);
  });
  it('échéance payée → mois suivant', () => {
    expect(nextDueDate(d, '2026-10-10', [pay({ amount: 50000, date: '2026-10-04' })])).toBe('2026-11-05');
  });
  it('jour 31 → dernier jour des mois courts', () => {
    expect(nextDueDate(debt({ dueDay: 31 }), '2026-02-10')).toBe('2026-02-28');
  });
  it('échéance antérieure au début de la dette : pas due', () => {
    expect(nextDueDate(debt({ installment: 50000, dueDay: 5, startDate: '2026-10-08' }), '2026-10-10')).toBe('2026-11-05');
  });
  it('dette clôturée : plus comptée', () => {
    expect(debtTotals([debt({ status: 'closed' })], [], 'XOF').iOwe).toBe(0);
    expect(debtTotals([debt()], [pay({ amount: 100000, date: '2026-02-01' })], 'XOF').iOwe).toBe(200000);
  });
});

describe('disponible libre : réservation par objectif', () => {
  it("le retrait d'un objectif ne libère pas l'argent d'un autre", () => {
    const a = account({ id: 'cash', openingBalance: 500000 });
    const g1 = goal({ id: 'g1', targetAmount: 1000000 });
    const g2 = goal({ id: 'g2', targetAmount: 1000000 });
    const cs = [contrib({ goalId: 'g1', amount: 100000 }), contrib({ goalId: 'g2', amount: 50000 }), contrib({ goalId: 'g2', amount: -80000 })];
    const pos = moneyPosition([a], [], [g1, g2], cs, 'XOF');
    // g2 ne peut pas être négatif : seul g1 réserve 100 000.
    expect(pos.free).toBe(400000);
  });
});

describe('répartition de la capacité', () => {
  it('ignore les objectifs dans une autre devise', () => {
    const lines = allocateCapacity(100000, [goal({ id: 'eur', currency: 'EUR', targetAmount: 500000 }), goal({ id: 'xof', targetAmount: 500000 })], [], '2026-10-06', 1000, 'XOF');
    expect(lines.map((l) => l.goalId)).toEqual(['xof']);
    expect(lines[0].amount).toBe(100000);
  });
  it('redistribue ce qu’un objectif presque atteint ne peut pas absorber', () => {
    const lines = allocateCapacity(100000, [goal({ id: 'a', targetAmount: 10000, rank: 1 }), goal({ id: 'b', targetAmount: 500000, rank: 2 })], [], '2026-10-06', 1000, 'XOF');
    expect(lines.find((l) => l.goalId === 'a')!.amount).toBe(10000);
    expect(lines.find((l) => l.goalId === 'b')!.amount).toBe(90000);
  });
});

describe('intelligence : aucune capacité absurde', () => {
  it('salaire 300 000 reçu, loyer déclaré 280 000 pas encore payé → ≈ 20 000, jamais 290 000', () => {
    const data = { ...emptySpaceData(), transactions: [tx({ type: 'income', amount: 300000, accountId: 'cash', date: '2026-10-01' }), tx({ type: 'expense', amount: 10000, accountId: 'cash', date: '2026-10-02' })] };
    const snap = financialSnapshot({ data, currency: 'XOF', now: '2026-10-06', available: 290000, financial: { monthlyIncome: 300000, fixedCharges: { sub_housing_rent: 280000 } } });
    expect(snap.savingsCapacity.value).toBe(20000);
    expect(snap.savingsCapacity.source).toBe('estimate');
    // Sans mois complet, aucune capacité « observée » n'est affirmée.
    expect(observedCapacity(data, 'XOF', '2026-10-06')).toBeNull();
  });
});

describe('rapports : épargne nette', () => {
  it('versement puis retrait de l’épargne = 0 épargné', () => {
    const cash = account({ id: 'cash' });
    const sav = account({ id: 'sav', isSavings: true });
    const data = {
      ...emptySpaceData(),
      accounts: [cash, sav],
      transactions: [
        tx({ type: 'income', amount: 200000, accountId: 'cash', date: '2026-10-01' }),
        tx({ type: 'transfer', amount: 50000, accountId: 'cash', toAccountId: 'sav', date: '2026-10-02' }),
        tx({ type: 'transfer', amount: 50000, accountId: 'sav', toAccountId: 'cash', date: '2026-10-03' }),
      ],
    };
    const r = buildReport(data, 'month', '2026-10-06', 'XOF');
    expect(r.saved).toBe(0);
    // Un transfert n'est ni une dépense ni un revenu.
    expect(r.expense).toBe(0);
    expect(r.income).toBe(200000);
  });
});
