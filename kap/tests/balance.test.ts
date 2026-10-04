import { describe, expect, it } from 'vitest';
import { accountBalance, accountBalances, flowTotals, moneyPosition } from '../src/core/balance';
import { account, goal, tx } from './helpers';
import type { GoalContribution } from '../src/core/types';

describe('soldes', () => {
  const cash = account({ id: 'cash', openingBalance: 10_000 });
  const wave = account({ id: 'wave', openingBalance: 0 });
  const list = [
    tx({ type: 'income', amount: 450_000, accountId: 'cash' }),
    tx({ type: 'expense', amount: 5_000, accountId: 'cash' }),
    tx({ type: 'transfer', amount: 100_000, accountId: 'cash', toAccountId: 'wave' }),
  ];

  it('calcule le solde : ouverture + revenus − dépenses ± transferts', () => {
    expect(accountBalance(cash, list)).toBe(10_000 + 450_000 - 5_000 - 100_000);
    expect(accountBalance(wave, list)).toBe(100_000);
  });

  it('un transfert ne change pas le total et n est ni revenu ni dépense', () => {
    const b = accountBalances([cash, wave], list);
    expect(b.cash + b.wave).toBe(10_000 + 450_000 - 5_000);
    const f = flowTotals(list, { start: '2026-10-01', end: '2026-10-31' }, 'XOF');
    expect(f.income).toBe(450_000);
    expect(f.expense).toBe(5_000);
  });

  it('ignore les opérations supprimées', () => {
    const del = tx({ type: 'expense', amount: 1_000_000, accountId: 'cash', deleted: true });
    expect(accountBalance(cash, [...list, del])).toBe(accountBalance(cash, list));
  });

  it('transfert entre devises : utilise le montant reçu saisi', () => {
    const eur = account({ id: 'eur', currency: 'EUR' });
    const t = tx({ type: 'transfer', amount: 65_596, accountId: 'cash', toAccountId: 'eur', toAmount: 10_000 });
    expect(accountBalance(eur, [t])).toBe(10_000);
    expect(accountBalance(cash, [t])).toBe(10_000 - 65_596);
  });

  it('les opérations d une autre devise ne sont pas additionnées', () => {
    const f = flowTotals([tx({ type: 'expense', amount: 100, accountId: 'x', currency: 'EUR' })], { start: '2026-01-01', end: '2026-12-31' }, 'XOF');
    expect(f.expense).toBe(0);
    expect(f.otherCurrencyCount).toBe(1);
  });
});

describe('argent disponible vs affecté', () => {
  it('distingue disponible, épargne et objectifs', () => {
    const cash = account({ id: 'cash', openingBalance: 300_000 });
    const sav = account({ id: 'sav', openingBalance: 0, isSavings: true, type: 'savings' });
    const g1 = goal({ id: 'g1', targetAmount: 1_000_000, accountId: 'sav' });
    const g2 = goal({ id: 'g2', targetAmount: 500_000 });
    const t = tx({ id: 't1', type: 'transfer', amount: 100_000, accountId: 'cash', toAccountId: 'sav' });
    const contributions: GoalContribution[] = [
      { id: 'c1', goalId: 'g1', amount: 100_000, date: '2026-10-01', transferId: 't1', createdAt: 1, updatedAt: 1, createdBy: 'u' },
      { id: 'c2', goalId: 'g2', amount: 50_000, date: '2026-10-01', createdAt: 1, updatedAt: 1, createdBy: 'u' },
    ];
    const pos = moneyPosition([cash, sav], [t], [g1, g2], contributions, 'XOF');
    expect(pos.available).toBe(200_000);
    expect(pos.savings).toBe(100_000);
    expect(pos.allocatedToGoals).toBe(150_000);
    // 50 000 mis de côté sans déplacement restent dans le cash mais ne sont pas libres
    expect(pos.free).toBe(150_000);
  });
});
