import { describe, expect, it } from 'vitest';
import { debtStatus, debtTotals, nextDueDate, validateDebtPayment } from '../src/core/debts';
import { netWorth } from '../src/core/networth';
import type { Asset, Debt, DebtPayment } from '../src/core/types';
import { account, tx } from './helpers';

const base = { createdAt: 1, updatedAt: 1, createdBy: 'u' };
const debt = (p: Partial<Debt>): Debt => ({
  ...base, id: 'd1', direction: 'i_owe', kind: 'bank', counterparty: 'Banque', principal: 1_000_000, currency: 'XOF',
  startDate: '2026-01-01', status: 'active', ...p,
});
const pay = (amount: number, p: Partial<DebtPayment> = {}): DebtPayment => ({ ...base, id: `p${amount}${Math.random()}`, debtId: 'd1', amount, date: '2026-05-01', ...p });

describe('dettes', () => {
  it('restant = principal − remboursements', () => {
    const s = debtStatus(debt({ installment: 100_000 }), [pay(300_000), pay(100_000)], '2026-10-04');
    expect(s.remaining).toBe(600_000);
    expect(s.percent).toBe(40);
    expect(s.installmentsLeft).toBe(6);
  });
  it('trop-perçu : restant 0, signalé', () => {
    const s = debtStatus(debt({}), [pay(1_200_000)], '2026-10-04');
    expect(s.remaining).toBe(0);
    expect(s.overpaid).toBe(200_000);
    expect(s.settled).toBe(true);
    expect(s.nextDue).toBeNull();
  });
  it('remboursements supprimés ignorés', () => {
    expect(debtStatus(debt({}), [pay(500_000, { deleted: true })]).remaining).toBe(1_000_000);
  });
  it('prochaine échéance mensuelle', () => {
    expect(nextDueDate(debt({ dueDay: 10 }), '2026-10-04')).toBe('2026-10-10');
    expect(nextDueDate(debt({ dueDay: 3 }), '2026-10-04')).toBe('2026-11-03');
    expect(nextDueDate(debt({ dueDate: '2027-01-15' }), '2026-10-04')).toBe('2027-01-15');
  });
  it('validation des remboursements', () => {
    expect(validateDebtPayment(0, 100)).toBe('invalid');
    expect(validateDebtPayment(-10, 100)).toBe('invalid');
    expect(validateDebtPayment(200, 100)).toBe('exceeds');
    expect(validateDebtPayment(100, 100)).toBe('ok');
  });
  it('totaux : je dois / on me doit', () => {
    const t = debtTotals([debt({}), debt({ id: 'd2', direction: 'owed_to_me', principal: 50_000 })], [], 'XOF');
    expect(t).toEqual({ iOwe: 1_000_000, owedToMe: 50_000, net: -950_000 });
  });
});

describe('patrimoine net', () => {
  it('actifs + comptes + créances − dettes', () => {
    const assets: Asset[] = [
      { ...base, id: 'a1', name: 'Terrain', type: 'land', value: 5_000_000, currency: 'XOF' },
      { ...base, id: 'a2', name: 'Appart Paris', type: 'real_estate', value: 100, currency: 'EUR' },
    ];
    const acc = account({ id: 'c', openingBalance: 200_000 });
    const nw = netWorth(assets, [acc], [tx({ type: 'expense', amount: 50_000, accountId: 'c' })], [debt({})], [pay(400_000)], 'XOF');
    expect(nw.assets).toBe(5_000_000);
    expect(nw.accounts).toBe(150_000);
    expect(nw.liabilities).toBe(600_000);
    expect(nw.net).toBe(5_000_000 + 150_000 - 600_000);
    expect(nw.skippedOtherCurrency).toBe(1);
  });
});
