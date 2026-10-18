/**
 * Argent disponible v2 (docs/argent-disponible.md) — §2.3 natures, §5.4 tontines,
 * §5.5 dettes, §10 rapports, relevé, export. Exemples du §14 (15 octobre 2026, XOF).
 */
import { describe, expect, it } from 'vitest';
import { natureContext, natureOf, type Nature } from '../src/core/nature';
import { accountStatement, historyTotals, ledgerCsv, linkedToDelete, periodReport } from '../src/core/ledger';
import { payoutSplit, tontineClosure } from '../src/core/tontineLedger';
import { canDeleteDebt, debtPaymentAccountError, splitRepayment, debtStatus } from '../src/core/debts';
import { budgetTransactions } from '../src/core/reserve';
import { envelopeStatuses, outsideEnvelopeSpent } from '../src/core/budget';
import { accountBalances } from '../src/core/balance';
import { account, contribution, debt, envelope, goal, payment, space, tentry, tontine, tx } from './helpers';
import type { SpaceData, Transaction } from '../src/core/types';

const OCT = { start: '2026-10-01', end: '2026-10-31' };
const cash = account({ id: 'cash', name: 'Espèces', openingBalance: 500_000 });
const om = account({ id: 'om', name: 'Orange Money', type: 'mobile_money', openingBalance: 500_000 });
const wave = account({ id: 'wave', name: 'Wave', type: 'mobile_money' });
const ce = account({ id: 'ce', name: 'Épargne', type: 'savings', isSavings: true });

const natures = (d: SpaceData, list: Transaction[] = d.transactions): Nature[] => {
  const ctx = natureContext(d);
  return list.map((t) => natureOf(t, ctx));
};

describe('§2.3 — une nature calculée par opération (natureOf)', () => {
  it('revenus, remboursement d’achat, dépense, frais, intérêts, ajustement', () => {
    const d = space({
      accounts: [cash, om, wave, ce],
      transactions: [
        tx({ id: 'sal', type: 'income', amount: 150_000, accountId: 'cash', categoryId: 'inc_salary' }),
        tx({ id: 'ref', type: 'income', amount: 2_000, accountId: 'cash', categoryId: 'inc_refund' }),
        tx({ id: 'mkt', type: 'expense', amount: 5_000, accountId: 'cash', categoryId: 'cat_food' }),
        tx({ id: 'fee', type: 'expense', amount: 500, accountId: 'om', categoryId: 'cat_other', subcategoryId: 'sub_other_fees' }),
        tx({ id: 'int', type: 'expense', amount: 1_000, accountId: 'cash', categoryId: 'cat_debts', subcategoryId: 'sub_debts_interest' }),
        tx({ id: 'adj', type: 'adjustment', direction: 'out', amount: 300, accountId: 'cash' }),
        tx({ id: 'cc', type: 'transfer', amount: 1_000, accountId: 'om', toAccountId: 'wave' }),
        tx({ id: 'dep', type: 'transfer', amount: 1_000, accountId: 'cash', toAccountId: 'ce' }),
        tx({ id: 'wit', type: 'transfer', amount: 1_000, accountId: 'ce', toAccountId: 'cash' }),
        // Ancienne « dépense » Épargne : de l'épargne, jamais une dépense.
        tx({ id: 'old', type: 'expense', amount: 1_000, accountId: 'cash', categoryId: 'cat_savings' }),
      ],
    });
    expect(natures(d)).toEqual(['revenu', 'remboursement_achat', 'depense', 'frais', 'interets', 'ajustement', 'transfert', 'versement_epargne', 'retrait_epargne', 'versement_epargne']);
  });

  it('dettes et prêts : emprunt reçu, remboursement du capital, prêt accordé, remboursement reçu — jamais revenu ni dépense', () => {
    const owe = debt({ id: 'owe', direction: 'i_owe' });
    const lent = debt({ id: 'lent', direction: 'owed_to_me', kind: 'loan_given', counterparty: 'Cousin' });
    const d = space({
      accounts: [cash],
      debts: [owe, lent],
      transactions: [
        tx({ id: 'borrow', type: 'income', amount: 200_000, accountId: 'cash', debtId: 'owe' }),
        tx({ id: 'repay', type: 'expense', amount: 100_000, accountId: 'cash', debtId: 'owe', categoryId: 'cat_debts' }),
        tx({ id: 'lend', type: 'expense', amount: 50_000, accountId: 'cash', debtId: 'lent' }),
        tx({ id: 'back', type: 'income', amount: 50_000, accountId: 'cash' }),
      ],
      // Ancien lien : le remboursement reçu n'est rattaché que par le remboursement de la créance.
      debtPayments: [payment({ debtId: 'lent', amount: 50_000, transactionId: 'back' })],
    });
    expect(natures(d)).toEqual(['emprunt_recu', 'remboursement_capital', 'pret_accorde', 'remboursement_recu']);
  });

  it('tontines : cotisation (tournante, collecteur) = épargne ; cotisation sans tour = cotisation_association (D6) ; cagnotte = retour (D5)', () => {
    const rot = tontine({ id: 'rot' });
    const assoc = tontine({ id: 'assoc', type: 'fixed_contribution', membersCount: null, myTurns: [] });
    const d = space({
      accounts: [cash],
      tontines: [rot, assoc],
      transactions: [
        tx({ id: 'c1', type: 'expense', amount: 10_000, accountId: 'cash', tontineId: 'rot' }),
        tx({ id: 'c2', type: 'expense', amount: 5_000, accountId: 'cash', tontineId: 'assoc' }),
        tx({ id: 'pot', type: 'income', amount: 100_000, accountId: 'cash', categoryId: 'inc_tontine' }),
        tx({ id: 'pen', type: 'expense', amount: 500, accountId: 'cash' }),
        // Ancienne cotisation sans lien, reconnue par sa sous-catégorie (règle 29).
        tx({ id: 'c3', type: 'expense', amount: 10_000, accountId: 'cash', categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine' }),
      ],
      tontineEntries: [tentry({ tontineId: 'rot', kind: 'penalty', period: 1, amount: 500, transactionId: 'pen' })],
    });
    expect(natures(d)).toEqual(['cotisation_tontine', 'cotisation_association', 'retour_tontine', 'frais', 'cotisation_tontine']);
  });
});

describe('§5.4 — tontines : cagnotte = retour d’épargne + avance du groupe (D5)', () => {
  const rot = tontine({ id: 'rot', startDate: '2026-05-05', myTurns: [6] });
  const contributions = (k: number) => Array.from({ length: k }, (_, i) => tentry({ tontineId: 'rot', kind: 'contribution', period: i + 1, amount: 10_000, date: `2026-${String(5 + i).padStart(2, '0')}-05` }));

  it('tableau du §5.4 : tour 1, 6, 10', () => {
    for (const [turn, retour, avance] of [[1, 10_000, 90_000], [6, 60_000, 40_000], [10, 100_000, 0]]) {
      const t = tontine({ id: 'rot', startDate: '2026-01-05', myTurns: [turn] });
      const entries = [...Array.from({ length: turn }, (_, i) => tentry({ tontineId: 'rot', kind: 'contribution', period: i + 1, amount: 10_000, date: `2026-${String(1 + i).padStart(2, '0')}-05` }))];
      const pot = tentry({ tontineId: 'rot', kind: 'payout', period: turn, amount: 100_000, date: `2026-${String(turn).padStart(2, '0')}-05` });
      expect(payoutSplit(t, [...entries, pot], pot.id)).toEqual({ retour: retour, avance });
    }
  });

  it('E18 — salaire 150 000, cotisation puis cagnotte au 6e tour : revenus 150 000, retour 60 000, avance 40 000', () => {
    const d = space({
      accounts: [cash],
      tontines: [rot],
      tontineEntries: [...contributions(6), tentry({ id: 'pot6', tontineId: 'rot', kind: 'payout', period: 6, amount: 100_000, date: '2026-10-05', transactionId: 'pot' })],
      transactions: [
        tx({ type: 'income', amount: 150_000, accountId: 'cash', categoryId: 'inc_salary', date: '2026-10-01' }),
        tx({ type: 'expense', amount: 10_000, accountId: 'cash', tontineId: 'rot', date: '2026-10-05' }),
        tx({ id: 'pot', type: 'income', amount: 100_000, accountId: 'cash', tontineId: 'rot', date: '2026-10-05' }),
      ],
    });
    const r = periodReport(d, OCT, 'XOF');
    expect(r.revenus).toBe(150_000);
    expect(r.depenses).toBe(0);
    expect(r.financement.avancesTontine).toBe(40_000);
    expect(payoutSplit(rot, d.tontineEntries, 'pot6')).toEqual({ retour: 60_000, avance: 40_000 });
  });

  it('E19 — cycle complet : revenus 0, dépenses 0, disponible final = disponible initial (hors salaire)', () => {
    const t = tontine({ id: 'rot', startDate: '2026-01-05', myTurns: [10] });
    const txs: Transaction[] = [];
    for (let i = 1; i <= 10; i++) txs.push(tx({ type: 'expense', amount: 10_000, accountId: 'cash', tontineId: 'rot', date: `2026-${String(i).padStart(2, '0')}-05` }));
    txs.push(tx({ type: 'income', amount: 100_000, accountId: 'cash', tontineId: 'rot', date: '2026-10-05' }));
    const d = space({ accounts: [cash], tontines: [t], transactions: txs });
    const r = periodReport(d, { start: '2026-01-01', end: '2026-12-31' }, 'XOF');
    expect([r.revenus, r.depenses]).toEqual([0, 0]);
    expect(accountBalances(d.accounts, d.transactions).cash).toBe(cash.openingBalance);
  });

  it('E19b — cagnotte de 95 000 pour 100 000 cotisés, cycle clôturé : frais de tontine 5 000, position 0', () => {
    const t = tontine({ id: 'rot', startDate: '2025-11-05', myTurns: [10], potAmount: 95_000, status: 'finished', closedAt: '2026-10-10' });
    const entries = Array.from({ length: 10 }, (_, i) => tentry({ tontineId: 'rot', kind: 'contribution', period: i + 1, amount: 10_000 }));
    entries.push(tentry({ tontineId: 'rot', kind: 'payout', period: 10, amount: 95_000 }));
    expect(tontineClosure(t, entries, '2026-10-15')).toEqual({ closed: true, paid: 100_000, received: 95_000, fees: 5_000, gain: 0 });
  });

  it('E20 — collecteur 31 × 1 000, remise de 30 000 : commission 1 000 à la clôture, revenus 0', () => {
    // Doc v2 révisé (§5.4) : la clôture est toujours confirmée (« terminée » + date).
    const t = tontine({ id: 'col', type: 'collector', frequency: 'daily', startDate: '2026-09-01', cycleDays: 31, collectorCommission: 1_000, amountPerShare: 1_000, membersCount: null, myTurns: [], status: 'finished', closedAt: '2026-10-02' });
    const entries = Array.from({ length: 31 }, (_, i) => tentry({ tontineId: 'col', kind: 'contribution', period: i + 1, amount: 1_000 }));
    entries.push(tentry({ tontineId: 'col', kind: 'payout', period: 31, amount: 30_000, transactionId: 'remise' }));
    expect(tontineClosure(t, entries, '2026-10-15')).toMatchObject({ closed: true, fees: 1_000, gain: 0 });
    const d = space({ accounts: [cash], tontines: [t], tontineEntries: entries, transactions: [tx({ id: 'remise', type: 'income', amount: 30_000, accountId: 'cash', date: '2026-10-01' })] });
    expect(periodReport(d, OCT, 'XOF').revenus).toBe(0);
  });

  it('E21 — cotisation sans tour (association) 5 000 : dépense, dans le budget, aucune créance', () => {
    const t = tontine({ id: 'assoc', type: 'fixed_contribution', membersCount: null, myTurns: [] });
    const d = space({ accounts: [cash], tontines: [t], transactions: [tx({ type: 'expense', amount: 5_000, accountId: 'cash', tontineId: 'assoc', categoryId: 'cat_informal', subcategoryId: 'sub_informal_dues', date: '2026-10-05' })] });
    const r = periodReport(d, OCT, 'XOF');
    expect(r.depenses).toBe(5_000);
    expect(r.epargneNette).toBe(0);
  });
});

describe('§5.5 — dettes et prêts', () => {
  it('E22 — emprunt de 200 000 reçu sur Orange Money : revenus 0, financement +200 000', () => {
    const d = space({ accounts: [om], debts: [debt({ id: 'owe', principal: 200_000 })], transactions: [tx({ type: 'income', amount: 200_000, accountId: 'om', debtId: 'owe', date: '2026-10-05' })] });
    const r = periodReport(d, OCT, 'XOF');
    expect(r.revenus).toBe(0);
    expect(r.financement.empruntsRecus).toBe(200_000);
  });

  it('E23 — remboursement de 110 000 dont 10 000 d’intérêts : dette −100 000, dépenses +10 000, ligne « Remboursements » 100 000', () => {
    expect(splitRepayment(110_000, 10_000)).toEqual({ capital: 100_000, interest: 10_000 });
    expect(splitRepayment(110_000, 0)).toEqual({ capital: 110_000, interest: 0 });
    expect(splitRepayment(10_000, 20_000)).toBeNull(); // intérêts > total : refusé
    const owe = debt({ id: 'owe', principal: 200_000 });
    const d = space({
      accounts: [cash],
      debts: [owe],
      transactions: [
        tx({ id: 'cap', type: 'expense', amount: 100_000, accountId: 'cash', debtId: 'owe', date: '2026-10-05' }),
        tx({ id: 'int', type: 'expense', amount: 10_000, accountId: 'cash', categoryId: 'cat_debts', subcategoryId: 'sub_debts_interest', linkedTransactionId: 'cap', date: '2026-10-05' }),
      ],
      debtPayments: [payment({ debtId: 'owe', amount: 100_000, transactionId: 'cap' })],
    });
    const r = periodReport(d, OCT, 'XOF');
    expect([r.depenses, r.remboursements, r.revenus]).toEqual([10_000, 100_000, 0]);
    expect(debtStatus(owe, d.debtPayments, '2026-10-15').remaining).toBe(100_000);
    expect(r.resultat).toBe(-110_000);
  });

  it('E23b — crédit de 1 000 000, six mensualités avec intérêts : reste dû = principal − Σ capital', () => {
    const owe = debt({ id: 'owe', principal: 1_000_000 });
    const pays = [0, 1, 2, 3, 4, 5].map((i) => {
      const s = splitRepayment(150_000, 15_000 - i * 2_000)!;
      return payment({ debtId: 'owe', amount: s.capital });
    });
    const capital = pays.reduce((n, p) => n + p.amount, 0);
    expect(capital).toBe(840_000);
    expect(debtStatus(owe, pays, '2026-10-15').remaining).toBe(1_000_000 - capital);
  });

  it('E24b — prêt de 50 000 au cousin remboursé deux mois plus tard : revenus 0 et dépenses 0 sur les deux mois', () => {
    const lent = debt({ id: 'lent', direction: 'owed_to_me', principal: 50_000 });
    const d = space({
      accounts: [cash],
      debts: [lent],
      transactions: [tx({ type: 'expense', amount: 50_000, accountId: 'cash', debtId: 'lent', date: '2026-08-10' }), tx({ type: 'income', amount: 50_000, accountId: 'cash', debtId: 'lent', date: '2026-10-10' })],
    });
    for (const p of [{ start: '2026-08-01', end: '2026-08-31' }, OCT]) {
      const r = periodReport(d, p, 'XOF');
      expect([r.revenus, r.depenses]).toEqual([0, 0]);
    }
    expect(periodReport(d, { start: '2026-08-01', end: '2026-08-31' }, 'XOF').financement.pretsAccordes).toBe(50_000);
    expect(periodReport(d, OCT, 'XOF').financement.remboursementsRecus).toBe(50_000);
  });

  it('E47 — supprimer une dette qui a des remboursements : refusé (on la clôture)', () => {
    expect(canDeleteDebt('owe', [payment({ debtId: 'owe', amount: 1_000 })])).toBe(false);
    expect(canDeleteDebt('owe', [payment({ debtId: 'owe', amount: 1_000, deleted: true })])).toBe(true);
    expect(canDeleteDebt('owe', [])).toBe(true);
  });

  it('E48 — dette clôturée avec un reste de 20 000 (remise) : ligne « Remises et pertes », ni revenu, ni budget', () => {
    const owe = debt({ id: 'owe', principal: 50_000, status: 'closed', closedReason: 'forgiven', closedAt: '2026-10-10' });
    const d = space({ accounts: [cash], debts: [owe], debtPayments: [payment({ debtId: 'owe', amount: 30_000, date: '2026-09-10' })] });
    const r = periodReport(d, OCT, 'XOF');
    expect(r.remisesPertes).toBe(20_000);
    expect([r.revenus, r.depenses]).toEqual([0, 0]);
  });

  it('E49 — remboursement sans compte : refusé, sauf « Hors de mes comptes » choisi explicitement', () => {
    expect(debtPaymentAccountError({ accountId: null })).toBe('account.missing');
    expect(debtPaymentAccountError({ accountId: null, offAccounts: true })).toBeNull();
    expect(debtPaymentAccountError({ accountId: 'cash' })).toBeNull();
  });
});

describe('§3.4 — frais de transfert et devises', () => {
  it('E25c — transfert OM → Wave 50 000, frais 500 : OM −50 500, Wave +50 000, dépenses +500 ; supprimer le transfert supprime les frais', () => {
    const d = space({
      accounts: [om, wave],
      transactions: [
        tx({ id: 'tr', type: 'transfer', amount: 50_000, accountId: 'om', toAccountId: 'wave', date: '2026-10-05' }),
        tx({ id: 'fee', type: 'expense', amount: 500, accountId: 'om', categoryId: 'cat_other', subcategoryId: 'sub_other_fees', linkedTransactionId: 'tr', date: '2026-10-05' }),
      ],
    });
    const b = accountBalances(d.accounts, d.transactions);
    expect([b.om - om.openingBalance, b.wave]).toEqual([-50_500, 50_000]);
    expect(periodReport(d, OCT, 'XOF').depenses).toBe(500);
    expect(linkedToDelete('tr', d.transactions)).toEqual(['fee']);
  });

  it('E26 — retrait chez un agent : OM → Espèces 20 000, frais 300 : dépenses +300', () => {
    const d = space({
      accounts: [om, cash],
      transactions: [
        tx({ id: 'tr', type: 'transfer', amount: 20_000, accountId: 'om', toAccountId: 'cash', date: '2026-10-05' }),
        tx({ id: 'fee', type: 'expense', amount: 300, accountId: 'om', linkedTransactionId: 'tr', date: '2026-10-05' }),
      ],
    });
    expect(natures(d)).toEqual(['transfert', 'frais']);
    expect(periodReport(d, OCT, 'XOF').depenses).toBe(300);
  });

  it('E30 — Banque XOF → compte EUR : revenus et dépenses inchangés', () => {
    const bank = account({ id: 'bank', type: 'bank', openingBalance: 1_000_000 });
    const eur = account({ id: 'eur', type: 'bank', currency: 'EUR' });
    const d = space({ accounts: [bank, eur], transactions: [tx({ type: 'transfer', amount: 655_957, toAmount: 100_000, accountId: 'bank', toAccountId: 'eur', date: '2026-10-05' })] });
    const r = periodReport(d, OCT, 'XOF');
    expect([r.revenus, r.depenses, r.epargneNette]).toEqual([0, 0, 0]);
  });
});

describe('§10 — rapport, historique, relevé, export', () => {
  it('E46 — salaire de 300 000 viré directement sur un CE : R +300 000, S +300 000', () => {
    const d = space({ accounts: [cash, ce], transactions: [tx({ type: 'income', amount: 300_000, accountId: 'ce', categoryId: 'inc_salary', date: '2026-10-05' })] });
    const r = periodReport(d, OCT, 'XOF');
    expect([r.revenus, r.epargneNette]).toEqual([300_000, 300_000]);
  });

  it('E52 — revenu 100 000 et cotisation de tournante 10 000 : historique et rapport identiques (Revenus 100 000, Dépenses 0, Épargne nette 10 000)', () => {
    const d = space({
      accounts: [cash],
      tontines: [tontine({ id: 'rot' })],
      transactions: [tx({ type: 'income', amount: 100_000, accountId: 'cash', date: '2026-10-02' }), tx({ type: 'expense', amount: 10_000, accountId: 'cash', tontineId: 'rot', date: '2026-10-05' })],
    });
    const r = periodReport(d, OCT, 'XOF');
    const h = historyTotals(d, OCT, 'XOF');
    expect({ revenus: r.revenus, depenses: r.depenses, epargneNette: r.epargneNette }).toEqual({ revenus: 100_000, depenses: 0, epargneNette: 10_000 });
    expect(h).toEqual({ revenus: r.revenus, depenses: r.depenses, epargneNette: r.epargneNette });
  });

  it('mise de côté sur un compte courant et cotisation depuis l’épargne : épargne nette sans double compte', () => {
    const g = goal({ id: 'moto', targetAmount: 500_000 });
    const d = space({
      accounts: [cash, ce],
      goals: [g],
      tontines: [tontine({ id: 'rot' })],
      goalContributions: [contribution({ goalId: 'moto', amount: 30_000, accountId: 'cash', date: '2026-10-03' })],
      transactions: [
        tx({ type: 'transfer', amount: 20_000, accountId: 'cash', toAccountId: 'ce', date: '2026-10-04' }),
        // Cotisation payée DEPUIS le CE : mouvement à l'intérieur de l'épargne.
        tx({ type: 'expense', amount: 10_000, accountId: 'ce', tontineId: 'rot', date: '2026-10-05' }),
      ],
    });
    expect(periodReport(d, OCT, 'XOF').epargneNette).toBe(50_000);
  });

  it('E43 / E17 — funérailles de 100 000 dont 80 000 pris sur la réserve : hors enveloppe 0, Famille dépensé 20 000', () => {
    const famille = envelope({ id: 'fam', name: 'Famille', monthlyBudget: 50_000, categoryIds: ['cat_family'] });
    const txs = [tx({ id: 'fun', type: 'expense', amount: 100_000, accountId: 'cash', categoryId: 'cat_family', date: '2026-10-05' })];
    const contribs = [contribution({ goalId: 'res', amount: -80_000, linkedTransactionId: 'fun', date: '2026-10-05' })];
    const view = budgetTransactions(txs, contribs);
    expect(envelopeStatuses([famille], view, [], '2026-10', 'XOF')[0].spent).toBe(20_000);
    expect(outsideEnvelopeSpent([famille], txs, contribs, '2026-10', 'XOF')).toBe(0);
    // Sans enveloppe Famille, la part hors réserve est hors enveloppe (jamais les 100 000).
    expect(outsideEnvelopeSpent([], txs, contribs, '2026-10', 'XOF')).toBe(20_000);
  });

  it('E51 — relevé de Wave : début 0, transfert reçu 50 000, dépense 10 000 → fin 40 000', () => {
    const d = space({
      accounts: [om, wave],
      transactions: [tx({ type: 'transfer', amount: 50_000, accountId: 'om', toAccountId: 'wave', date: '2026-10-03' }), tx({ type: 'expense', amount: 10_000, accountId: 'wave', date: '2026-10-06' })],
    });
    const s = accountStatement(d, 'wave', OCT);
    expect({ start: s.start, inflows: s.inflows, outflows: s.outflows, end: s.end }).toEqual({ start: 0, inflows: 50_000, outflows: 10_000, end: 40_000 });
    expect(s.start + s.inflows - s.outflows).toBe(s.end);
  });

  it('relevé : l’ouverture est la première ligne ; début + entrées − sorties = fin, ajustements compris', () => {
    const a = account({ id: 'a', openingBalance: 100_000, openingDate: '2026-10-02', openingNote: 'argent gardé à la maison' });
    const d = space({ accounts: [a], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'a', date: '2026-10-05' }), tx({ type: 'adjustment', direction: 'out', amount: 10_000, accountId: 'a', date: '2026-10-06', reason: 'écart de caisse' })] });
    const s = accountStatement(d, 'a', OCT);
    expect(s.lines[0]).toMatchObject({ nature: 'ouverture', amount: 100_000, date: '2026-10-02' });
    expect([s.start, s.inflows, s.outflows, s.end]).toEqual([0, 100_000, 40_000, 60_000]);
  });

  it('E53 — export CSV d’un compte ouvert à 100 000 avec une dépense de 30 000 : ouverture + débit = 70 000 = solde affiché', () => {
    const a = account({ id: 'a', name: 'Espèces', openingBalance: 100_000, openingDate: '2026-10-01', openingNote: 'maison' });
    const d = space({ accounts: [a], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'a', categoryId: 'cat_food', date: '2026-10-05' })] });
    const csv = ledgerCsv(d, {
      headers: ['date', 'nature', 'compte', 'débit', 'crédit', 'devise', 'destination', 'reçu', 'devise reçue', 'catégorie', 'sous-catégorie', 'motif', 'provenance'],
      accountName: (id) => d.accounts.find((x) => x.id === id)?.name ?? id,
      categoryName: (id) => id,
      natureLabel: (n) => n,
      decimals: () => 0,
    });
    const rows = csv.replace('﻿', '').split('\n').slice(1).map((l) => l.split(';'));
    expect(rows.map((r) => r[1])).toEqual(['ouverture', 'depense']);
    const sum = rows.filter((r) => r[2] === 'Espèces').reduce((n, r) => n + Number(r[4] || 0) - Number(r[3] || 0), 0);
    expect(sum).toBe(70_000);
    expect(sum).toBe(accountBalances(d.accounts, d.transactions).a);
    expect(rows[0][12]).toBe('maison');
  });
});
