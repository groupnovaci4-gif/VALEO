/** « Mon épargne » (1.8) : verser, retirer, ajuster ; un ajustement n'est ni revenu ni dépense ; « J'ai épargné » n'est jamais une dépense. */
import { describe, expect, it } from 'vitest';
import { account, goal, tx } from './helpers';
import { accountBalance, flowTotals, goalSaved, moneyPosition } from '../src/core/balance';
import { accountMovements, adjustmentFor, linkedPartAfterEdit, movementEffect, validateDeposit, validateWithdraw } from '../src/core/savings';
import { periodTotals } from '../src/core/history';
import { monthFlows } from '../src/core/insights';
import { buildSeries, transactionsToCsv } from '../src/core/reports';
import { dailyAllowance } from '../src/core/dailyAllowance';
import { validateTransaction } from '../src/core/transactions';
import { parseEntryText, parseSavingsDeposit } from '../src/core/entry/parse';
import { normalizeText } from '../src/core/ai/parser';
import { catalogStarterDocs } from '../src/core/categoryCatalog';
import type { GoalContribution, Transaction } from '../src/core/types';

const wave = account({ id: 'wave', name: 'Wave', type: 'mobile_money', provider: 'wave', openingBalance: 80_000 });
const bank = account({ id: 'bank', name: 'Ma banque', type: 'bank', isSavings: true, openingBalance: 100_000 });
const caisse = account({ id: 'caisse', name: 'Caisse urgence', isSavings: true });
const moto = goal({ id: 'moto', name: 'Moto', targetAmount: 500_000, accountId: 'bank' });
const contrib = (p: Partial<GoalContribution> & Pick<GoalContribution, 'goalId' | 'amount'>): GoalContribution => ({ id: `c${Math.random()}`, date: '2026-10-04', accountId: 'bank', transferId: null, note: null, createdAt: 1, updatedAt: 1, createdBy: 'u', ...p });
const data = (transactions: Transaction[] = [], goalContributions: GoalContribution[] = []) => ({ accounts: [wave, bank, caisse], transactions, goals: [moto], goalContributions });

describe('versement : contrôles avant toute écriture', () => {
  const ok = { savingsAccountId: 'bank', amount: 20_000, date: '2026-10-04', fromAccountId: 'wave' };
  it('versement valide depuis Wave', () => expect(validateDeposit(ok, data())).toEqual([]));
  it('montant nul, compte inconnu, compte non-épargne, même compte : refus clairs', () => {
    expect(validateDeposit({ ...ok, amount: 0 }, data())).toContain('amount.invalid');
    expect(validateDeposit({ ...ok, savingsAccountId: 'x' }, data())).toContain('account.missing');
    expect(validateDeposit({ ...ok, savingsAccountId: 'wave', fromAccountId: null }, data())).toContain('savings.notSavings');
    expect(validateDeposit({ ...ok, fromAccountId: 'bank' }, data())).toContain('transfer.sameAccount');
  });
  it('devise différente : jamais de conversion implicite', () => {
    const eur = account({ id: 'eur', currency: 'EUR' });
    expect(validateDeposit({ ...ok, fromAccountId: 'eur' }, { ...data(), accounts: [wave, bank, eur] })).toContain('transfer.currencyMismatch');
  });
  it('part affectée à un objectif : jamais plus que le versement', () => {
    expect(validateDeposit({ ...ok, goal: { goalId: 'moto', amount: 20_000 } }, data())).toEqual([]);
    expect(validateDeposit({ ...ok, goal: { goalId: 'moto', amount: 25_000 } }, data())).toContain('savings.goalPartTooBig');
    expect(validateDeposit({ ...ok, goal: { goalId: 'absent', amount: 5_000 } }, data())).toContain('goal.inactive');
  });
});

describe('retrait : jamais plus que le solde, ni que l’objectif', () => {
  const w = { savingsAccountId: 'bank', amount: 30_000, date: '2026-10-04', toAccountId: 'wave' };
  it('retrait valide vers Wave', () => expect(validateWithdraw(w, data())).toEqual([]));
  it('au-delà du solde du compte d’épargne : refus', () => expect(validateWithdraw({ ...w, amount: 100_001 }, data())).toContain('savings.insufficient'));
  it('au-delà de ce qui est affecté à l’objectif : refus', () => {
    const d = data([], [contrib({ goalId: 'moto', amount: 10_000 })]);
    expect(validateWithdraw({ ...w, goal: { goalId: 'moto', amount: 10_000 } }, d)).toEqual([]);
    expect(validateWithdraw({ ...w, goal: { goalId: 'moto', amount: 10_001 } }, d)).toContain('goal.withdrawTooMuch');
  });
});

describe('ajustement de solde : ni revenu ni dépense', () => {
  const adjIn = tx({ id: 'adj', type: 'adjustment', direction: 'in', amount: 50_000, accountId: 'bank' });
  const adjOut = tx({ id: 'adj2', type: 'adjustment', direction: 'out', amount: 5_000, accountId: 'bank' });
  const all = [adjIn, adjOut, tx({ type: 'expense', amount: 1_000, accountId: 'wave', categoryId: 'cat_food' }), tx({ type: 'income', amount: 300_000, accountId: 'wave', categoryId: 'cat_salary' })];
  it('scénario du fondateur : 100 000 déjà sur le compte + 50 000 versés = 150 000', () => {
    expect(accountBalance(bank, [adjIn])).toBe(150_000);
    expect(moneyPosition([wave, bank], [adjIn], [], [], 'XOF').savings).toBe(150_000);
  });
  it('sens « out » : le solde baisse', () => expect(accountBalance(bank, [adjIn, adjOut])).toBe(145_000));
  it('analyses inchangées : totaux, mois, séries, historique', () => {
    const f = flowTotals(all, { start: '2026-10-01', end: '2026-10-31' }, 'XOF');
    expect([f.income, f.expense, f.count]).toEqual([300_000, 1_000, 2]);
    const m = monthFlows(all, '2026-10', 'XOF');
    expect([m.income, m.expense]).toEqual([300_000, 1_000]);
    const s = buildSeries(all, { start: '2026-10-01', end: '2026-10-31' } as never, 'XOF');
    expect(s.reduce((n, p) => n + p.expense, 0)).toBe(1_000);
    expect(s.reduce((n, p) => n + p.income, 0)).toBe(300_000);
    const p = Object.values(periodTotals(all));
    expect(p.reduce((n, x) => n + x.expense, 0)).toBe(1_000);
  });
  it('reste par jour : un ajustement ne le fait pas bouger', () => {
    const base = { transactions: all.filter((t) => t.type !== 'adjustment'), recurring: [], goals: [], goalContributions: [], accounts: [wave, bank] };
    const a = dailyAllowance({ data: base, currency: 'XOF', today: '2026-10-10' });
    const b = dailyAllowance({ data: { ...base, transactions: all }, currency: 'XOF', today: '2026-10-10' });
    expect(b).toEqual(a);
  });
  it('validation : un ajustement exige un sens', () => {
    const draft = { type: 'adjustment' as const, amount: 1_000, currency: 'XOF' as const, date: '2026-10-04', accountId: 'bank' };
    expect(validateTransaction({ ...draft, direction: 'in' }, [wave, bank])).not.toContain('amount.invalid');
    expect(validateTransaction(draft, [wave, bank])).toContain('amount.invalid');
  });
  it('« Ajuster le solde » : écart entre solde réel et solde calculé', () => {
    expect(adjustmentFor(150_000, 175_000)).toEqual({ direction: 'in', amount: 25_000 });
    expect(adjustmentFor(150_000, 140_000)).toEqual({ direction: 'out', amount: 10_000 });
    expect(adjustmentFor(150_000, 150_000)).toBeNull();
  });
});

describe('versement depuis Wave et objectif : compté une seule fois', () => {
  const dep = tx({ id: 'dep', type: 'transfer', amount: 20_000, accountId: 'wave', toAccountId: 'bank', goalId: 'moto' });
  const c = contrib({ goalId: 'moto', amount: 20_000, transferId: 'dep' });
  it('Wave −20 000, épargne +20 000, total épargné +20 000 (pas 40 000)', () => {
    const pos = moneyPosition([wave, bank], [dep], [moto], [c], 'XOF');
    expect(pos.available).toBe(60_000);
    expect(pos.savings).toBe(120_000);
    expect(pos.allocatedToGoals).toBe(20_000);
    // La contribution liée au transfert n'est pas retirée une 2e fois du disponible.
    expect(pos.earmarkedInSpending).toBe(0);
    expect(goalSaved(moto, [c])).toBe(20_000);
  });
  it('dépenses du mois inchangées, reste par jour en baisse', () => {
    const income = tx({ type: 'income', amount: 300_000, accountId: 'wave', categoryId: 'cat_salary', date: '2026-10-02' });
    expect(flowTotals([income, dep], { start: '2026-10-01', end: '2026-10-31' }, 'XOF').expense).toBe(0);
    const base = { recurring: [], goals: [], goalContributions: [], accounts: [wave, bank] };
    const before = dailyAllowance({ data: { ...base, transactions: [income] }, currency: 'XOF', today: '2026-10-10' });
    const after = dailyAllowance({ data: { ...base, transactions: [income, dep] }, currency: 'XOF', today: '2026-10-10' });
    expect(before.status === 'ok' && after.status === 'ok' && after.perDay < before.perDay).toBe(true);
  });
  it('historique du compte : mouvements signés', () => {
    const adj = tx({ id: 'a', type: 'adjustment', direction: 'in', amount: 5_000, accountId: 'bank', date: '2026-10-05' });
    const list = accountMovements('bank', [dep, adj, tx({ type: 'expense', amount: 1, accountId: 'wave' })]);
    expect(list.map((t) => [t.id, movementEffect(t, 'bank')])).toEqual([['a', 5_000], ['dep', 20_000]]);
    expect(movementEffect(dep, 'wave')).toBe(-20_000);
  });
});

describe('« J’ai épargné 20 000 » : un versement, jamais une dépense', () => {
  const ctx = { today: '2026-10-08', currency: 'XOF' as const, accounts: [wave, bank, caisse], goals: [moto], categories: catalogStarterDocs('CI', { now: 1, uid: 'u' }), defaultAccountId: 'wave' };
  const parse = (s: string) => parseEntryText(s, ctx);
  it('phrases de versement', () => {
    expect(parse("J'ai épargné 20 000")).toEqual({ kind: 'savings', deposit: { amount: 20_000, date: '2026-10-08', savingsAccountId: null, goalId: null, fromAccountId: null } });
    const r = parse("J'ai mis 15 000 de côté sur mon compte Ma banque");
    expect(r.kind === 'savings' && [r.deposit.amount, r.deposit.savingsAccountId]).toEqual([15_000, 'bank']);
    const v = parse('Verse 10 000 dans mon épargne depuis Wave');
    expect(v.kind === 'savings' && [v.deposit.amount, v.deposit.fromAccountId, v.deposit.savingsAccountId]).toEqual([10_000, 'wave', null]);
    const g = parse('Verse 5 000 pour la Moto hier');
    expect(g.kind === 'savings' && [g.deposit.goalId, g.deposit.savingsAccountId, g.deposit.date]).toEqual(['moto', 'bank', '2026-10-07']);
  });
  it('un seul compte d’épargne : retenu ; plusieurs sans précision : à choisir (jamais deviné)', () => {
    const one = parseSavingsDeposit(normalizeText("J'ai épargné 20 000"), { ...ctx, accounts: [wave, bank] });
    expect(one?.savingsAccountId).toBe('bank');
    expect(parseSavingsDeposit(normalizeText("J'ai épargné 20 000"), ctx)?.savingsAccountId).toBeNull();
  });
  it('ni question, ni projet, ni tontine, ni dépense ordinaire', () => {
    expect(parse('Combien j’ai épargné ?').kind).toBe('question');
    expect(parse('Je veux épargner pour acheter une moto').kind).toBe('assistant');
    expect(parse('tontine 10 000').kind).toBe('entries');
    expect(parse('Taxi 2 000').kind).toBe('entries');
    expect(parse('Transfert 5000 de Wave vers la banque').kind).toBe('assistant');
  });
});

describe('anciennes « dépenses » Épargne / Investissement (décisions 2 et 3)', () => {
  const old = [
    tx({ type: 'expense', amount: 25_000, accountId: 'wave', categoryId: 'cat_savings' }),
    tx({ type: 'expense', amount: 10_000, accountId: 'wave', categoryId: 'cat_investment' }),
    tx({ type: 'expense', amount: 3_000, accountId: 'wave', categoryId: 'cat_food' }),
  ];
  it('intactes et comptées comme épargne, hors dépenses', () => {
    const f = flowTotals(old, { start: '2026-10-01', end: '2026-10-31' }, 'XOF');
    expect([f.expense, f.savedAsExpense, f.count]).toEqual([3_000, 35_000, 3]);
    expect(monthFlows(old, '2026-10', 'XOF').expense).toBe(3_000);
  });
});

describe('export CSV', () => {
  it('un ajustement à la baisse est exporté en négatif (le sens n’est pas perdu)', () => {
    const csv = transactionsToCsv(
      [tx({ type: 'adjustment', direction: 'out', amount: 5_000, accountId: 'bank' }), tx({ type: 'adjustment', direction: 'in', amount: 7_000, accountId: 'bank' })],
      { accountName: () => 'Ma banque', categoryName: () => '', categories: [], decimals: () => 0, headers: ['d', 't', 'm'], typeLabel: (t) => t },
    );
    expect(csv).toContain(';adjustment;-5000;');
    expect(csv).toContain(';adjustment;7000;');
    // Une formule déguisée en nombre reste neutralisée.
    const bad = transactionsToCsv([tx({ type: 'expense', amount: 1, accountId: 'bank', payee: '-2+3' })], { accountName: () => 'x', categoryName: () => '', categories: [], decimals: () => 0, headers: ['d'], typeLabel: (t) => t });
    expect(bad).toContain(";'-2+3;");
  });
});

describe('modifier un versement lié à un objectif', () => {
  it('part complète : suit le nouveau montant', () => {
    expect(linkedPartAfterEdit(20_000, 20_000, 25_000)).toBe(25_000);
    expect(linkedPartAfterEdit(-20_000, 20_000, 15_000)).toBe(-15_000);
  });
  it('part partielle (5 000 sur 20 000) : gardée, plafonnée au nouveau montant', () => {
    expect(linkedPartAfterEdit(5_000, 20_000, 20_000)).toBe(5_000);
    expect(linkedPartAfterEdit(5_000, 20_000, 30_000)).toBe(5_000);
    expect(linkedPartAfterEdit(5_000, 20_000, 3_000)).toBe(3_000);
  });
});
