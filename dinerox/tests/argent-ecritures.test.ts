/**
 * Argent disponible v2, étape 2 (docs/argent-disponible.md §16) — lots d'écritures PURS
 * que `useActions` enregistre d'un bloc (`writeMany`) : tout ou rien.
 */
import { describe, expect, it } from 'vitest';
import {
  accountChangeError,
  applyItems,
  batchOutflowError,
  outflowError,
  planBalanceCorrection,
  planDebtOpening,
  planDebtRepayment,
  planRecurringConfirmation,
  planReserveUse,
  planSpendWithComplements,
  planTransferWithFee,
} from '../src/core/writePlans';
import { accountBalances } from '../src/core/balance';
import { positionOf } from '../src/core/position';
import { periodReport } from '../src/core/ledger';
import { debtStatus } from '../src/core/debts';
import { recurringTxId } from '../src/core/recurring';
import { recurringToConfirm } from '../src/core/recurringConfirm';
import { account, contribution, debt, goal, rule, space, tontine, tx } from './helpers';
import type { Transaction } from '../src/core/types';

const TODAY = '2026-10-15';
const OCT = { start: '2026-10-01', end: '2026-10-31' };
let n = 0;
const newId = (p: string) => `${p}${++n}`;
const cash = (opening = 0) => account({ id: 'cash', name: 'Espèces', openingBalance: opening, order: 0 });
const om = (opening = 0) => account({ id: 'om', name: 'Orange Money', type: 'mobile_money', openingBalance: opening, order: 1 });
const ce = (opening = 0) => account({ id: 'ce', name: 'Épargne', type: 'savings', isSavings: true, openingBalance: opening, order: 2 });
const expense = (p: Partial<Transaction> = {}) => ({ type: 'expense' as const, amount: 5_000, currency: 'XOF' as const, date: TODAY, accountId: 'cash', ...p });

describe('§6.3 — dernier rempart : aucune nouvelle sortie qui rendrait un compte négatif', () => {
  it('E1 — aucun argent renseigné : noMoney (avant toute création de compte)', () => {
    expect(outflowError(space(), expense({ accountId: '' }), TODAY)).toEqual({ code: 'noMoney' });
  });
  it('pas assez : shortfall avec le compte et ce qui manque', () => {
    expect(outflowError(space({ accounts: [cash(3_000)] }), expense(), TODAY)).toEqual({ code: 'shortfall', accountId: 'cash', missing: 2_000 });
  });
  it('assez : rien ; un revenu ou une correction ne sont jamais bloqués', () => {
    const d = space({ accounts: [cash(5_000)] });
    expect(outflowError(d, expense(), TODAY)).toBeNull();
    expect(outflowError(space({ accounts: [cash()] }), { ...expense(), type: 'income' }, TODAY)).toBeNull();
    expect(outflowError(space({ accounts: [cash()] }), { ...expense(), type: 'adjustment', direction: 'out' }, TODAY)).toBeNull();
  });
  it('modification qui n’aggrave rien (montant baissé, compte déjà négatif) : acceptée ; hausse : seule la différence', () => {
    const d = space({ accounts: [cash(1_000)], transactions: [tx({ id: 'e', type: 'expense', amount: 5_000, accountId: 'cash', date: TODAY })] });
    expect(outflowError(d, expense({ id: 'e', amount: 4_000 }), TODAY)).toBeNull();
    // Hausse de 1 000 sur un compte déjà à −4 000 : il faut couvrir la hausse ET le déficit (E40).
    expect(outflowError(d, expense({ id: 'e', amount: 6_000 }), TODAY)).toEqual({ code: 'shortfall', accountId: 'cash', missing: 5_000 });
  });
  it('transfert : contrôlé sur le compte qui envoie', () => {
    expect(outflowError(space({ accounts: [cash(1_000), om()] }), { ...expense(), type: 'transfer', toAccountId: 'om' }, TODAY)).toEqual({ code: 'shortfall', accountId: 'cash', missing: 4_000 });
  });
});

describe('§6.3 — complément + sortie en un lot, comptes complétés l’un après l’autre', () => {
  it('E5 — retrait de l’épargne puis dépense, tout ou rien ; aucun négatif', () => {
    const d = space({ accounts: [cash(40_000), ce(60_000)] });
    const r = planSpendWithComplements({ data: d, currency: 'XOF', today: TODAY, lines: [expense({ amount: 50_000 })], choices: [{ kind: 'savings', accountId: 'ce' }], newId });
    if (!('items' in r)) throw new Error(JSON.stringify(r));
    const after = applyItems(d, r.items);
    const b = accountBalances(after.accounts, after.transactions);
    expect([b.cash, b.ce]).toEqual([0, 50_000]);
  });

  it('deux comptes à compléter : sources recalculées après chaque choix, une source jamais promise deux fois', () => {
    const d = space({ accounts: [cash(0), om(0), account({ id: 'wave', name: 'Wave', type: 'mobile_money', openingBalance: 15_000, order: 3 })] });
    const lines = [expense({ amount: 10_000, accountId: 'cash' }), expense({ amount: 10_000, accountId: 'om' })];
    // Wave (15 000) suffit pour le premier, plus pour le second : le second choix est refusé.
    const r = planSpendWithComplements({ data: d, currency: 'XOF', today: TODAY, lines, choices: [{ kind: 'account', accountId: 'wave' }, { kind: 'account', accountId: 'wave' }], newId });
    expect(r).toEqual({ error: 'stale', accountId: 'om' });
    // Sans choix pour le second compte : on dit lequel attend un complément.
    expect(planSpendWithComplements({ data: d, currency: 'XOF', today: TODAY, lines, choices: [{ kind: 'account', accountId: 'wave' }], newId })).toEqual({ error: 'needsChoice', accountId: 'om', missing: 10_000 });
  });

  it('E14 — mise de côté sur le même compte : elle prend fin, aucun transfert', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 30_000, accountId: 'cash' })] });
    const r = planSpendWithComplements({ data: d, currency: 'XOF', today: TODAY, lines: [expense({ amount: 80_000 })], choices: [{ kind: 'set_aside', goalId: 'moto', accountId: 'cash' }], newId });
    if (!('items' in r)) throw new Error(JSON.stringify(r));
    expect(r.items.filter((i) => i.col === 'transactions')).toHaveLength(1);
    const p = positionOf(applyItems(d, r.items), 'XOF', TODAY);
    expect([p.accounts.cash.balance, p.accounts.cash.setAside, p.available]).toEqual([20_000, 20_000, 0]);
  });
});

describe('§3.4 — transfert + frais, en un lot', () => {
  it('E25c — OM → Wave 50 000, frais 500 : deux écritures liées ; total des comptes −500', () => {
    const d = space({ accounts: [om(100_000), account({ id: 'wave', type: 'mobile_money' })] });
    const items = planTransferWithFee({ type: 'transfer', amount: 50_000, currency: 'XOF', date: TODAY, accountId: 'om', toAccountId: 'wave' }, 500, newId);
    expect(items).toHaveLength(2);
    const after = applyItems(d, items);
    const b = accountBalances(after.accounts, after.transactions);
    expect([b.om, b.wave]).toEqual([49_500, 50_000]);
    expect(periodReport(after, OCT, 'XOF').depenses).toBe(500);
    expect(planTransferWithFee({ type: 'transfer', amount: 50_000, currency: 'XOF', date: TODAY, accountId: 'om', toAccountId: 'wave' }, 0, newId)).toHaveLength(1);
  });
});

describe('§5.5 — dettes : opérations liées, capital + intérêts', () => {
  it('E22 — emprunt reçu sur Orange Money : une vraie entrée liée, jamais un revenu', () => {
    const owe = debt({ id: 'owe', principal: 200_000 });
    const items = planDebtOpening(owe, { accountId: 'om', date: TODAY }, newId);
    const after = applyItems(space({ accounts: [om()], debts: [owe] }), items);
    expect(positionOf(after, 'XOF', TODAY).available).toBe(200_000);
    expect(periodReport(after, OCT, 'XOF').revenus).toBe(0);
  });
  it('prêt accordé depuis Espèces : une vraie sortie liée', () => {
    const lent = debt({ id: 'lent', direction: 'owed_to_me', principal: 50_000 });
    const after = applyItems(space({ accounts: [cash(80_000)], debts: [lent] }), planDebtOpening(lent, { accountId: 'cash', date: TODAY }, newId));
    expect(positionOf(after, 'XOF', TODAY).available).toBe(30_000);
    expect(periodReport(after, OCT, 'XOF').financement.pretsAccordes).toBe(50_000);
  });
  it('E23 — remboursement 110 000 dont 10 000 d’intérêts : capital + intérêts liés, dette −100 000', () => {
    const owe = debt({ id: 'owe', principal: 200_000 });
    const d = space({ accounts: [cash(200_000)], debts: [owe] });
    const r = planDebtRepayment(owe, { total: 110_000, interest: 10_000, accountId: 'cash', date: TODAY, label: 'Banque' }, d.categories, newId);
    if (!('items' in r)) throw new Error(r.error);
    const after = applyItems(d, r.items);
    expect(debtStatus(owe, after.debtPayments, TODAY).remaining).toBe(100_000);
    const rep = periodReport(after, OCT, 'XOF');
    expect([rep.depenses, rep.remboursements]).toEqual([10_000, 100_000]);
    expect(accountBalances(after.accounts, after.transactions).cash).toBe(90_000);
  });
  it('E49 — sans compte : refusé ; « Hors de mes comptes » explicite : un remboursement sans opération', () => {
    const owe = debt({ id: 'owe' });
    expect(planDebtRepayment(owe, { total: 10_000, interest: 0, accountId: null, date: TODAY, label: '' }, [], newId)).toEqual({ error: 'account.missing' });
    const r = planDebtRepayment(owe, { total: 10_000, interest: 0, accountId: null, offAccounts: true, date: TODAY, label: '' }, [], newId);
    expect('items' in r && r.items.map((i) => i.col)).toEqual(['debtPayments']);
    expect(planDebtRepayment(owe, { total: 10_000, interest: 20_000, accountId: 'cash', date: TODAY, label: '' }, [], newId)).toEqual({ error: 'debt.interest' });
  });
});

describe('§8 — récurrence confirmée d’un geste, identifiant déterministe', () => {
  it('E34 / E37 — le loyer confirmé porte l’identifiant de l’échéance : deux téléphones écrivent le même document', () => {
    const loyer = rule({ id: 'loyer', amount: 30_000, accountId: 'cash', startDate: '2026-01-05', lastGenerated: '2026-09-05', categoryId: 'cat_housing' });
    const d = space({ accounts: [cash(100_000)], recurring: [loyer] });
    const [card] = recurringToConfirm(d, '2026-10-07');
    const a = planRecurringConfirmation(d, loyer, card.date, { date: '2026-10-07' }, newId);
    const b = planRecurringConfirmation(d, loyer, card.date, { date: '2026-10-07' }, newId);
    expect(a[0].doc.id).toBe(recurringTxId('loyer', '2026-10-05'));
    expect(b[0].doc.id).toBe(a[0].doc.id);
    expect(recurringToConfirm(applyItems(d, a), '2026-10-07')).toEqual([]);
  });
  it('E25b — récurrence convertie en tontine : la confirmation EST la cotisation de la période (une seule)', () => {
    const r1 = rule({ id: 'rt', amount: 10_000, accountId: 'cash', startDate: '2026-10-20', categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine' });
    const t = tontine({ id: 'rot', startDate: '2026-10-20', linkedRecurringId: 'rt' });
    const d = space({ accounts: [cash(50_000)], recurring: [r1], tontines: [t] });
    const items = planRecurringConfirmation(d, r1, '2026-10-20', { date: '2026-10-20' }, newId);
    expect(items.map((i) => i.col)).toEqual(['transactions', 'tontineEntries']);
    expect(items[0].doc).toMatchObject({ tontineId: 'rot', recurringId: 'rt', amount: 10_000 });
    expect(items[1].doc).toMatchObject({ tontineId: 'rot', kind: 'contribution', period: 1, status: 'done', transactionId: items[0].doc.id });
  });
});

describe('§3 — comptes : garde-fous et correction de solde', () => {
  const used = space({ accounts: [account({ id: 'a', openingBalance: 30_000 })], transactions: [tx({ type: 'expense', amount: 1_000, accountId: 'a' })] });
  const a = used.accounts[0];
  it('E27 / E50 / E29 — désactiver, passer en épargne, changer de devise : refusés avec un solde ou des opérations', () => {
    expect(accountChangeError(a, { ...a, active: false }, used, TODAY)).toBe('account.notEmpty');
    expect(accountChangeError(a, { ...a, isSavings: true }, used, TODAY)).toBe('account.notEmpty');
    expect(accountChangeError(a, { ...a, currency: 'EUR' }, used, TODAY)).toBe('account.currencyLocked');
    expect(accountChangeError(a, { ...a, name: 'Caisse' }, used, TODAY)).toBeNull();
  });
  it('§3.1 — ouverture figée dès la première opération', () => {
    expect(accountChangeError(a, { ...a, openingBalance: 50_000 }, used, TODAY)).toBe('account.openingLocked');
    const fresh = account({ id: 'f', openingBalance: 10_000 });
    expect(accountChangeError(fresh, { ...fresh, openingBalance: 12_000 }, space({ accounts: [fresh] }), TODAY)).toBeNull();
  });
  it('E28 — « Corriger le solde » : ajustement de l’écart avec motif obligatoire ; E28b : rien', () => {
    const d = space({ accounts: [cash(100_000)], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'cash' })] });
    const r = planBalanceCorrection(d, 'cash', 60_000, TODAY, 'écart de caisse', newId);
    expect('items' in r && r.items[0].doc).toMatchObject({ type: 'adjustment', direction: 'out', amount: 10_000, reason: 'écart de caisse' });
    expect(planBalanceCorrection(d, 'cash', 70_000, TODAY, 'x', newId)).toEqual({ error: 'correction.none' });
    expect(planBalanceCorrection(d, 'cash', 60_000, TODAY, '  ', newId)).toEqual({ error: 'correction.reason' });
  });
});

describe('§5.3 — la réserve ne paie qu’avec l’argent adossé', () => {
  it('E17 — réserve sur un CE : transfert lié vers le compte qui paie + utilisation ; Espèces 10 000, CE 0', () => {
    const d = space({
      accounts: [cash(30_000), ce(50_000)],
      goals: [goal({ id: 'res', kind: 'reserve', categoryId: 'family', targetAmount: 200_000, accountId: 'ce' })],
      goalContributions: [contribution({ goalId: 'res', amount: 50_000, accountId: 'ce' })],
    });
    const fun = tx({ id: 'fun', type: 'expense', amount: 70_000, accountId: 'cash', categoryId: 'cat_family', date: TODAY });
    const r = planReserveUse(d, fun, 'res', 'XOF', newId);
    expect([r.covered, r.uncovered]).toEqual([50_000, 20_000]);
    const after = applyItems({ ...d, transactions: [...d.transactions, fun] }, r.items);
    const p = positionOf(after, 'XOF', TODAY);
    expect([p.accounts.cash.balance, p.accounts.ce.balance, p.accounts.ce.assigned]).toEqual([10_000, 0, 0]);
  });
  it('E17b — réserve hors comptes : elle ne paie rien', () => {
    const d = space({ accounts: [cash(30_000)], goals: [goal({ id: 'res', kind: 'reserve', categoryId: 'family', targetAmount: 200_000, initialAmount: 50_000, initialSource: 'outside' })] });
    const r = planReserveUse(d, tx({ id: 'f', type: 'expense', amount: 20_000, accountId: 'cash', categoryId: 'cat_family' }), 'res', 'XOF', newId);
    expect([r.covered, r.items.length]).toEqual([0, 0]);
  });
});

describe('§6.3 — contrôle d’un LOT : il ne crée ni n’aggrave un solde négatif', () => {
  const t = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId'>) => ({ col: 'transactions' as const, doc: tx(p) });
  it('retrait de la part d’un objectif sur un CE : accepté (la part se libère dans le même lot)', () => {
    const d = space({ accounts: [cash(), ce(60_000)], goals: [goal({ id: 'moto', targetAmount: 500_000, accountId: 'ce' })], goalContributions: [contribution({ goalId: 'moto', amount: 60_000, accountId: 'ce' })] });
    const w = tx({ id: 'w', type: 'transfer', amount: 10_000, accountId: 'ce', toAccountId: 'cash', date: TODAY });
    expect(batchOutflowError(d, [{ col: 'transactions', doc: w }], TODAY)).toEqual({ code: 'shortfall', accountId: 'ce', missing: 10_000 });
    expect(batchOutflowError(d, [{ col: 'transactions', doc: w }, { col: 'goalContributions', doc: contribution({ goalId: 'moto', amount: -10_000, accountId: 'ce', transferId: 'w', date: TODAY }) }], TODAY)).toBeNull();
  });
  it('mise de côté sur un compte courant au-delà de son disponible : refusée', () => {
    const d = space({ accounts: [cash(20_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })] });
    expect(batchOutflowError(d, [{ col: 'goalContributions', doc: contribution({ goalId: 'moto', amount: 30_000, accountId: 'cash', date: TODAY }) }], TODAY)).toEqual({ code: 'shortfall', accountId: 'cash', missing: 10_000 });
  });
  it('E40 — compte déjà à −20 000 : une dépense de 5 000 doit couvrir aussi le déficit (il manque 25 000)', () => {
    const d = space({ accounts: [cash(40_000)], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'cash' }), tx({ type: 'expense', amount: 30_000, accountId: 'cash' })] });
    expect(batchOutflowError(d, [t({ type: 'expense', amount: 5_000, accountId: 'cash', date: TODAY })], TODAY)).toEqual({ code: 'shortfall', accountId: 'cash', missing: 25_000 });
  });
  it('E1 — aucun argent renseigné, dépense sans compte : noMoney ; un revenu passe', () => {
    expect(batchOutflowError(space(), [t({ type: 'expense', amount: 5_000, accountId: 'nouveau', date: TODAY })], TODAY)).toEqual({ code: 'noMoney' });
    expect(batchOutflowError(space(), [t({ type: 'income', amount: 5_000, accountId: 'nouveau', date: TODAY })], TODAY)).toBeNull();
  });
  it('réserve sur un CE + dépense, même lot : la part de la réserve compte', () => {
    const d = space({ accounts: [cash(30_000), ce(50_000)], goals: [goal({ id: 'res', kind: 'reserve', categoryId: 'family', targetAmount: 200_000, accountId: 'ce' })], goalContributions: [contribution({ goalId: 'res', amount: 50_000, accountId: 'ce' })] });
    const fun = tx({ id: 'fun', type: 'expense', amount: 70_000, accountId: 'cash', categoryId: 'cat_family', date: TODAY });
    const r = planReserveUse(d, fun, 'res', 'XOF', newId);
    expect(batchOutflowError(d, [{ col: 'transactions', doc: fun }, ...r.items], TODAY)).toBeNull();
    expect(batchOutflowError(d, [{ col: 'transactions', doc: fun }], TODAY)).toEqual({ code: 'shortfall', accountId: 'cash', missing: 40_000 });
  });
});
