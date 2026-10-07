/** Lot A, phase 1 — « reste par jour » : milieu de mois, dernier jour, déficit, sans revenu, déclaré, récurrences, objectifs. */
import { describe, expect, it } from 'vitest';
import { dailyAllowance } from '../src/core/dailyAllowance';
import type { GoalContribution, RecurringRule } from '../src/core/types';
import { goal, tx } from './helpers';

const rule = (p: Partial<RecurringRule>): RecurringRule => ({
  id: p.id ?? 'r1', createdAt: 1, updatedAt: 1, createdBy: 'u1', type: 'expense', label: 'Loyer', amount: 100_000, currency: 'XOF', accountId: 'a',
  frequency: 'monthly', startDate: '2026-01-25', active: true, ...p,
});
const contrib = (p: Partial<GoalContribution>): GoalContribution => ({ id: p.id ?? 'gc1', createdAt: 1, updatedAt: 1, createdBy: 'u1', goalId: 'g1', amount: 0, date: '2026-10-02', ...p });
const empty = { transactions: [], recurring: [], goals: [], goalContributions: [] };

describe('reste par jour', () => {
  it('milieu de mois : (revenus − dépenses) / jours restants, aujourd’hui inclus, arrondi vers le bas', () => {
    const r = dailyAllowance({
      data: { ...empty, transactions: [tx({ type: 'income', amount: 250_000, accountId: 'a', date: '2026-10-01' }), tx({ type: 'expense', amount: 40_000, accountId: 'a', date: '2026-10-05' })] },
      currency: 'XOF',
      today: '2026-10-15',
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.daysLeft).toBe(17); // du 15 au 31 inclus
    expect(r.available).toBe(210_000);
    expect(r.perDay).toBe(Math.floor(210_000 / 17)); // 12 352
    expect(r.until).toBe('2026-10-31');
    expect(r.incomeSource).toBe('user');
  });

  it('dernier jour du mois : tout le disponible pour aujourd’hui', () => {
    const r = dailyAllowance({ data: { ...empty, transactions: [tx({ type: 'income', amount: 30_000, accountId: 'a', date: '2026-10-01' })] }, currency: 'XOF', today: '2026-10-31' });
    expect(r.status === 'ok' && r.daysLeft === 1 && r.perDay === 30_000).toBe(true);
  });

  it('disponible négatif : jamais de montant par jour, le dépassement est indiqué', () => {
    const r = dailyAllowance({
      data: { ...empty, transactions: [tx({ type: 'income', amount: 50_000, accountId: 'a', date: '2026-10-01' }), tx({ type: 'expense', amount: 80_000, accountId: 'a', date: '2026-10-03' })] },
      currency: 'XOF',
      today: '2026-10-10',
    });
    expect(r.status).toBe('deficit');
    expect(r.status === 'deficit' && r.deficit).toBe(30_000);
    expect('perDay' in r).toBe(false);
  });

  it('sans revenu (ni enregistré ni déclaré) : invitation à compléter, aucun chiffre inventé', () => {
    const r = dailyAllowance({ data: { ...empty, transactions: [tx({ type: 'expense', amount: 5_000, accountId: 'a', date: '2026-10-03' })] }, currency: 'XOF', today: '2026-10-10' });
    expect(r.status).toBe('needs_income');
    expect('perDay' in r).toBe(false);
  });

  it('revenu déclaré seulement : utilisé, et la source est « déclaré »', () => {
    const r = dailyAllowance({ data: empty, currency: 'XOF', today: '2026-10-22', financial: { monthlyIncome: 200_000 } });
    expect(r.status === 'ok' && r.incomeSource === 'declared' && r.available === 200_000 && r.daysLeft === 10 && r.perDay === 20_000).toBe(true);
  });

  it('un revenu enregistré prime sur le déclaré', () => {
    const r = dailyAllowance({ data: { ...empty, transactions: [tx({ type: 'income', amount: 90_000, accountId: 'a', date: '2026-10-01' })] }, currency: 'XOF', today: '2026-10-22', financial: { monthlyIncome: 200_000 } });
    expect(r.status === 'ok' && r.incomeSource === 'user' && r.income === 90_000).toBe(true);
  });

  it('récurrences à venir déduites ; déjà enregistrées : pas deux fois', () => {
    const data = { ...empty, transactions: [tx({ type: 'income', amount: 300_000, accountId: 'a', date: '2026-10-01' })], recurring: [rule({ startDate: '2026-01-25' }), rule({ id: 'r2', amount: 10_000, startDate: '2026-01-05', lastGenerated: '2026-10-05' })] };
    const r = dailyAllowance({ data, currency: 'XOF', today: '2026-10-15' });
    expect(r.status === 'ok' && r.upcomingRecurring).toBe(100_000); // loyer du 25 à venir ; le 5 déjà enregistré
    expect(r.status === 'ok' && r.available).toBe(200_000);
    // Après l'échéance : plus rien à venir ce mois-ci.
    const late = dailyAllowance({ data, currency: 'XOF', today: '2026-10-26' });
    expect(late.status === 'ok' && late.upcomingRecurring).toBe(0);
  });

  it('récurrence hebdomadaire : chaque occurrence restante du mois', () => {
    const r = dailyAllowance({
      data: { ...empty, transactions: [tx({ type: 'income', amount: 100_000, accountId: 'a', date: '2026-10-01' })], recurring: [rule({ frequency: 'weekly', amount: 1_000, startDate: '2026-10-02' })] },
      currency: 'XOF',
      today: '2026-10-15',
    });
    // 16, 23, 30 octobre
    expect(r.status === 'ok' && r.upcomingRecurring).toBe(3_000);
  });

  // 1.6 : avant, la part déjà versée n'était plus déduite — mettre 20 000 de côté
  // faisait MONTER le reste par jour de 20 000. La mise de côté prévue est désormais
  // déduite tout le mois, versée ou non.
  it('mise de côté prévue du mois déduite tout le mois, versée ou non (verser ne fait pas monter le reste par jour)', () => {
    const g = goal({ id: 'g1', targetAmount: 1_000_000, monthlyContribution: 50_000 });
    const income = tx({ type: 'income', amount: 300_000, accountId: 'a', date: '2026-10-01' });
    const before = dailyAllowance({ data: { ...empty, transactions: [income], goals: [g], goalContributions: [contrib({ id: 'old', amount: 50_000, date: '2026-09-02' })] }, currency: 'XOF', today: '2026-10-15' });
    const after = dailyAllowance({
      data: { ...empty, transactions: [income], goals: [g], goalContributions: [contrib({ amount: 20_000, date: '2026-10-02' }), contrib({ id: 'old', amount: 50_000, date: '2026-09-02' })] },
      currency: 'XOF',
      today: '2026-10-15',
    });
    expect(before.status === 'ok' && before.goalsRemaining).toBe(50_000);
    expect(after.status === 'ok' && after.goalsRemaining).toBe(50_000);
    expect(after.status === 'ok' && after.available).toBe(250_000);
    expect(before.status === 'ok' && after.status === 'ok' && after.perDay).toBe(before.status === 'ok' ? before.perDay : -1);
  });

  it('mise de côté bornée à ce qu’il restait à épargner au début du mois', () => {
    const g = goal({ id: 'g1', targetAmount: 100_000, initialAmount: 0, monthlyContribution: 50_000 });
    const r = dailyAllowance({
      data: { ...empty, transactions: [tx({ type: 'income', amount: 300_000, accountId: 'a', date: '2026-10-01' })], goals: [g], goalContributions: [contrib({ id: 'old', amount: 80_000, date: '2026-09-02' }), contrib({ amount: 20_000, date: '2026-10-02' })] },
      currency: 'XOF',
      today: '2026-10-15',
    });
    // Il restait 20 000 au 1er octobre (atteint depuis) : 20 000 déduits, pas 50 000.
    expect(r.status === 'ok' && r.goalsRemaining).toBe(20_000);
  });

  it('autre devise ignorée (aucune conversion)', () => {
    const r = dailyAllowance({ data: { ...empty, transactions: [tx({ type: 'income', amount: 100_000, accountId: 'a', date: '2026-10-01' }), tx({ type: 'expense', amount: 9_999, currency: 'EUR', accountId: 'e', date: '2026-10-02' })] }, currency: 'XOF', today: '2026-10-31' });
    expect(r.status === 'ok' && r.expenses).toBe(0);
  });
});
