/**
 * Argent disponible v2 (docs/argent-disponible.md) — §3.3 comptes dans les totaux,
 * §4 argent disponible, §5 poches et adossement, §5.6 patrimoine. Exemples du §14.
 */
import { describe, expect, it } from 'vitest';
import { countsInPosition, goalBacking, positionOf } from '../src/core/position';
import { account, contribution, debt, goal, space, tentry, tontine, tx } from './helpers';

const TODAY = '2026-10-15';
const cash = (opening = 0, p = {}) => account({ id: 'cash', name: 'Espèces', openingBalance: opening, ...p });
const ce = (opening = 0, p = {}) => account({ id: 'ce', name: 'Épargne', type: 'savings', isSavings: true, openingBalance: opening, ...p });

describe('§3.3 — une seule définition des comptes qui entrent dans les totaux', () => {
  it('actif : oui ; supprimé : non ; inactif à 0 : non ; inactif avec un solde (ancienne donnée) : oui, rien n’est masqué', () => {
    expect(countsInPosition(account({ active: true }), 0)).toBe(true);
    expect(countsInPosition(account({ deleted: true }), 5_000)).toBe(false);
    expect(countsInPosition(account({ active: false }), 0)).toBe(false);
    expect(countsInPosition(account({ active: false }), 5_000)).toBe(true);
  });
});

describe('§4 — argent disponible D', () => {
  it('E2 — revenu déclaré seulement : D = 0, argent non renseigné', () => {
    const p = positionOf(space({ accounts: [cash()] }), 'XOF', TODAY);
    expect([p.available, p.tracked]).toEqual([0, false]);
  });

  it('E3 — ouverture Espèces 100 000 : D = 100 000', () => {
    const p = positionOf(space({ accounts: [cash(100_000)] }), 'XOF', TODAY);
    expect([p.available, p.tracked, p.totalAccounts]).toEqual([100_000, true, 100_000]);
  });

  it('E4 — versement de 60 000 sur un CE : D 40 000, mis de côté 60 000, total des comptes 100 000 (jamais 160 000)', () => {
    const d = space({ accounts: [cash(100_000), ce()], transactions: [tx({ type: 'transfer', amount: 60_000, accountId: 'cash', toAccountId: 'ce', date: '2026-10-10' })] });
    const p = positionOf(d, 'XOF', TODAY);
    expect([p.available, p.setAside, p.totalAccounts]).toEqual([40_000, 60_000, 100_000]);
  });

  it('E8 — CE de 500 000 « que j’avais déjà » : D inchangé, mis de côté +500 000', () => {
    const before = positionOf(space({ accounts: [cash(100_000)] }), 'XOF', TODAY);
    const after = positionOf(space({ accounts: [cash(100_000), ce(500_000, { openingNote: 'Livret à la banque' })] }), 'XOF', TODAY);
    expect(after.available).toBe(before.available);
    expect(after.setAside - before.setAside).toBe(500_000);
  });

  it('E35 — une opération à date future ne compte pas dans D', () => {
    const d = space({ accounts: [cash(10_000)], transactions: [tx({ type: 'income', amount: 200_000, accountId: 'cash', date: '2026-10-25' }), tx({ type: 'expense', amount: 15_000, accountId: 'cash', date: '2026-10-20' })] });
    expect(positionOf(d, 'XOF', '2026-10-10').available).toBe(10_000);
  });

  it('E28 — ouverture 100 000, dépense 30 000, correction à 60 000 (ajustement out 10 000) : D = 60 000', () => {
    const d = space({
      accounts: [cash(100_000)],
      transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'cash', date: '2026-10-05' }), tx({ type: 'adjustment', direction: 'out', amount: 10_000, accountId: 'cash', date: '2026-10-06', reason: 'écart de caisse' })],
    });
    expect(positionOf(d, 'XOF', TODAY).available).toBe(60_000);
  });

  it('E30 — XOF et EUR affichés côte à côte, jamais additionnés', () => {
    const bank = account({ id: 'bank', type: 'bank', openingBalance: 1_000_000 });
    const eur = account({ id: 'eur', type: 'bank', currency: 'EUR' });
    const d = space({ accounts: [bank, eur], transactions: [tx({ type: 'transfer', amount: 655_957, toAmount: 100_000, accountId: 'bank', toAccountId: 'eur', date: '2026-10-05' })] });
    const p = positionOf(d, 'XOF', TODAY);
    expect(p.available).toBe(344_043);
    expect(p.otherCurrencies).toEqual({ EUR: { available: 100_000, totalAccounts: 100_000 } });
  });

  it('E40 — solde négatif après deux téléphones : affiché tel quel, D ne descend pas sous zéro, compte à régulariser', () => {
    const d = space({ accounts: [cash(40_000)], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'cash' }), tx({ type: 'expense', amount: 30_000, accountId: 'cash' })] });
    const p = positionOf(d, 'XOF', TODAY);
    expect(p.accounts.cash.balance).toBe(-20_000);
    expect(p.available).toBe(0);
    expect(p.negatives).toEqual(['cash']);
  });

  it('E42 — découvert autorisé : solde −250 €, D = 0, dette à court terme 250 €', () => {
    const bank = account({ id: 'bank', type: 'bank', currency: 'EUR', openingBalance: 10_000, overdraftLimit: 30_000 });
    const d = space({ accounts: [bank], transactions: [tx({ type: 'expense', amount: 35_000, currency: 'EUR', accountId: 'bank' })] });
    const p = positionOf(d, 'EUR', TODAY);
    expect([p.accounts.bank.balance, p.available, p.shortTermDebt]).toEqual([-25_000, 0, 25_000]);
  });
});

describe('§5 — poches : adossement, mise de côté visible', () => {
  it('E13 — contribution de 30 000 à la Moto, laissée sur Espèces : solde 100 000, D 70 000, total 100 000', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 30_000, accountId: 'cash' })] });
    const p = positionOf(d, 'XOF', TODAY);
    expect([p.accounts.cash.balance, p.available, p.totalAccounts, p.accounts.cash.setAside]).toEqual([100_000, 70_000, 100_000, 30_000]);
    expect(goalBacking(d, 'XOF').get('moto')).toEqual({ byAccount: { cash: 30_000 }, outside: 0, total: 30_000 });
  });

  it('E15 — objectif créé avec 80 000 « hors de mes comptes » : D 100 000, total 100 000, patrimoine +80 000', () => {
    const base = space({ accounts: [cash(100_000)] });
    const d = { ...base, goals: [goal({ id: 'moto', targetAmount: 500_000, initialAmount: 80_000, initialSource: 'outside', initialNote: 'chez maman' })] };
    const p = positionOf(d, 'XOF', TODAY);
    expect([p.available, p.totalAccounts, p.outside]).toEqual([100_000, 100_000, 80_000]);
    expect(p.netWorth - positionOf(base, 'XOF', TODAY).netWorth).toBe(80_000);
  });

  it('§13 — ancien montant initial (sans provenance) : hors comptes, le disponible ne change pas', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000, initialAmount: 50_000 })] });
    const p = positionOf(d, 'XOF', TODAY);
    expect([p.available, p.outside]).toEqual([100_000, 50_000]);
  });

  it('§13 — ancienne contribution sans transfert ni compte : mise de côté sur le premier compte courant actif', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 20_000 })] });
    expect(positionOf(d, 'XOF', TODAY).accounts.cash.setAside).toBe(20_000);
  });

  it('E16 — affectation de 60 000 du CE à la Moto : D 100 000 (pas 40 000, pas −50 000), mis de côté 60 000 (jamais 120 000)', () => {
    const d = space({ accounts: [cash(100_000), ce(60_000)], goals: [goal({ id: 'moto', targetAmount: 500_000, accountId: 'ce' })], goalContributions: [contribution({ goalId: 'moto', amount: 60_000, accountId: 'ce' })] });
    const p = positionOf(d, 'XOF', TODAY);
    expect([p.available, p.setAside]).toEqual([100_000, 60_000]);
    expect([p.accounts.ce.balance, p.accounts.ce.assigned, p.accounts.ce.free]).toEqual([60_000, 60_000, 0]);
  });

  it('contribution par transfert vers un CE : adossée au CE, sans double compte', () => {
    const d = space({
      accounts: [cash(100_000), ce()],
      goals: [goal({ id: 'moto', targetAmount: 500_000, accountId: 'ce' })],
      transactions: [tx({ id: 'tr', type: 'transfer', amount: 25_000, accountId: 'cash', toAccountId: 'ce', goalId: 'moto' })],
      goalContributions: [contribution({ goalId: 'moto', amount: 25_000, accountId: 'cash', transferId: 'tr' })],
    });
    const p = positionOf(d, 'XOF', TODAY);
    expect([p.available, p.setAside, p.accounts.ce.assigned]).toEqual([75_000, 25_000, 25_000]);
  });

  it('E25 — 6 cotisations de tournante de 10 000 depuis Espèces : D −60 000, mis de côté +60 000, patrimoine inchangé', () => {
    const t = tontine({ id: 'rot', startDate: '2026-05-05', myTurns: [9] });
    const before = space({ accounts: [cash(100_000)], tontines: [t] });
    const txs = [0, 1, 2, 3, 4, 5].map((i) => tx({ id: `c${i}`, type: 'expense', amount: 10_000, accountId: 'cash', tontineId: 'rot', date: `2026-${String(5 + i).padStart(2, '0')}-05` }));
    const entries = txs.map((x, i) => tentry({ tontineId: 'rot', kind: 'contribution', period: i + 1, amount: 10_000, transactionId: x.id, date: x.date }));
    const after = { ...before, transactions: txs, tontineEntries: entries };
    const a = positionOf(before, 'XOF', TODAY);
    const b = positionOf(after, 'XOF', TODAY);
    expect(b.available - a.available).toBe(-60_000);
    expect(b.setAside - a.setAside).toBe(60_000);
    expect(b.netWorth).toBe(a.netWorth);
  });

  it('E22 — emprunt de 200 000 reçu : D +200 000, patrimoine net inchangé', () => {
    const om = account({ id: 'om', type: 'mobile_money' });
    const before = space({ accounts: [om] });
    const after = space({ accounts: [om], debts: [debt({ id: 'owe', principal: 200_000 })], transactions: [tx({ type: 'income', amount: 200_000, accountId: 'om', debtId: 'owe' })] });
    expect(positionOf(after, 'XOF', TODAY).available).toBe(200_000);
    expect(positionOf(after, 'XOF', TODAY).netWorth).toBe(positionOf(before, 'XOF', TODAY).netWorth);
  });

  it('E45 — patrimoine = 40 000 + 60 000 + 30 000 − 50 000 = 80 000 (jamais 140 000)', () => {
    const t = tontine({ id: 'rot', startDate: '2026-08-05', myTurns: [9] });
    const d = space({
      accounts: [cash(40_000), ce(60_000)],
      goals: [goal({ id: 'g', targetAmount: 100_000, accountId: 'ce' })],
      goalContributions: [contribution({ goalId: 'g', amount: 60_000, accountId: 'ce' })],
      tontines: [t],
      tontineEntries: [1, 2, 3].map((p) => tentry({ tontineId: 'rot', kind: 'contribution', period: p, amount: 10_000 })),
      debts: [debt({ id: 'owe', principal: 50_000 })],
    });
    const p = positionOf(d, 'XOF', TODAY);
    expect(p.available).toBe(40_000);
    expect(p.netWorth).toBe(80_000);
  });

  it('E19b — tontine clôturée : position 0 au patrimoine', () => {
    const t = tontine({ id: 'rot', startDate: '2025-11-05', myTurns: [10], potAmount: 95_000, status: 'finished' });
    const entries = Array.from({ length: 10 }, (_, i) => tentry({ tontineId: 'rot', kind: 'contribution', period: i + 1, amount: 10_000 }));
    entries.push(tentry({ tontineId: 'rot', kind: 'payout', period: 10, amount: 95_000 }));
    const p = positionOf(space({ accounts: [cash()], tontines: [t], tontineEntries: entries }), 'XOF', TODAY);
    expect([p.tontineReceivable, p.tontineAdvance]).toEqual([0, 0]);
  });
});
