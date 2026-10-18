/**
 * Argent disponible v2, étape 3A — UN MÊME jeu de données vu par tous les calculs des écrans :
 * un emprunt, une cagnotte, un remboursement reçu ne sont JAMAIS des revenus ; le capital
 * remboursé n'est JAMAIS une dépense (accueil, rapport, historique, coach, assistant, export).
 */
import { describe, expect, it } from 'vitest';
import { withLedgerView } from '../src/core/nature';
import { flowTotals, moneyPosition } from '../src/core/balance';
import { expensesByCategory, monthFlows, computeInsights } from '../src/core/insights';
import { buildReport } from '../src/core/reports';
import { periodTotals } from '../src/core/history';
import { historyTotals, ledgerCsv, periodReport } from '../src/core/ledger';
import { financialSnapshot, observedCapacity } from '../src/core/intelligence';
import { behaviorScore } from '../src/core/coach/score';
import { buildFinanceSummary } from '../src/core/ai/summary';
import { monthMetrics } from '../src/core/coachData';
import { positionOf } from '../src/core/position';
import { account, debt, payment, space, tentry, tontine, tx } from './helpers';

const SEPT = { start: '2026-09-01', end: '2026-09-30' };
const TODAY = '2026-10-15';

/** Septembre : salaire 150 000, emprunt 200 000, cagnotte 100 000, remboursement reçu 50 000,
 *  capital remboursé 100 000 (+ 10 000 d'intérêts), marché 30 000. Liens ANCIENS compris. */
function dataset() {
  const rot = tontine({ id: 'rot', startDate: '2026-09-05', myTurns: [1] });
  return space({
    accounts: [account({ id: 'cash', name: 'Espèces', openingBalance: 100_000 })],
    debts: [debt({ id: 'owe', principal: 200_000 }), debt({ id: 'lent', direction: 'owed_to_me', principal: 50_000 })],
    tontines: [rot],
    transactions: [
      tx({ id: 'sal', type: 'income', amount: 150_000, accountId: 'cash', categoryId: 'inc_salary', date: '2026-09-25' }),
      tx({ id: 'loan', type: 'income', amount: 200_000, accountId: 'cash', categoryId: 'inc_other', debtId: 'owe', date: '2026-09-02' }),
      // Ancienne cagnotte : revenu « Autres », reconnue seulement par l'entrée du carnet.
      tx({ id: 'pot', type: 'income', amount: 100_000, accountId: 'cash', categoryId: 'inc_other', date: '2026-09-05' }),
      // Ancien remboursement reçu : reconnu seulement par le remboursement de la créance.
      tx({ id: 'back', type: 'income', amount: 50_000, accountId: 'cash', categoryId: 'inc_other', date: '2026-09-10' }),
      tx({ id: 'cap', type: 'expense', amount: 100_000, accountId: 'cash', categoryId: 'cat_debts', debtId: 'owe', date: '2026-09-12' }),
      tx({ id: 'int', type: 'expense', amount: 10_000, accountId: 'cash', categoryId: 'cat_debts', linkedTransactionId: 'cap', date: '2026-09-12' }),
      tx({ id: 'mkt', type: 'expense', amount: 30_000, accountId: 'cash', categoryId: 'cat_food', date: '2026-09-14' }),
    ],
    tontineEntries: [tentry({ tontineId: 'rot', kind: 'payout', period: 1, amount: 100_000, transactionId: 'pot', date: '2026-09-05' })],
    debtPayments: [payment({ debtId: 'lent', amount: 50_000, transactionId: 'back', date: '2026-09-10' }), payment({ debtId: 'owe', amount: 100_000, transactionId: 'cap', date: '2026-09-12' })],
  });
}

describe('invariant : aucun écran ne voit un emprunt, une cagnotte ou un remboursement comme un revenu', () => {
  const raw = dataset();
  const d = withLedgerView(raw);

  it('rapport et historique (ledger) : revenus 150 000, dépenses 40 000, remboursements 100 000', () => {
    const r = periodReport(raw, SEPT, 'XOF');
    expect([r.revenus, r.depenses, r.remboursements]).toEqual([150_000, 40_000, 100_000]);
    expect(historyTotals(raw, SEPT, 'XOF')).toMatchObject({ revenus: 150_000, depenses: 40_000 });
  });

  it('anciennes sommes (vue des écrans) : flowTotals, monthFlows, periodTotals, buildReport — mêmes chiffres', () => {
    const f = flowTotals(d.transactions, SEPT, 'XOF');
    expect([f.income, f.expense]).toEqual([150_000, 40_000]);
    const m = monthFlows(d.transactions, '2026-09', 'XOF');
    expect([m.income, m.expense]).toEqual([150_000, 40_000]);
    const h = periodTotals(d.transactions.filter((t) => t.date >= SEPT.start && t.date <= SEPT.end)).XOF;
    expect([h.income, h.expense]).toEqual([150_000, 40_000]);
    const rep = buildReport(d, 'month', '2026-09-15', 'XOF');
    expect([rep.income, rep.expense]).toEqual([150_000, 40_000]);
    // Le capital n'est dans aucune catégorie de dépense ; les intérêts, si.
    expect(expensesByCategory(d.transactions, '2026-09', 'XOF')).toEqual({ cat_debts: 10_000, cat_food: 30_000 });
    expect(rep.byCategory.map((c) => [c.categoryId, c.amount])).toEqual([
      ['cat_food', 30_000],
      ['cat_debts', 10_000],
    ]);
  });

  it('même sans la vue (opérations liées par debtId / tontineId) : jamais un revenu', () => {
    const direct = [
      tx({ type: 'income', amount: 200_000, accountId: 'cash', debtId: 'owe', date: '2026-09-02' }),
      tx({ type: 'income', amount: 100_000, accountId: 'cash', tontineId: 'rot', date: '2026-09-05' }),
      tx({ type: 'expense', amount: 100_000, accountId: 'cash', debtId: 'owe', date: '2026-09-12' }),
    ];
    const f = flowTotals(direct, SEPT, 'XOF');
    expect([f.income, f.expense]).toEqual([0, 0]);
  });

  it('accueil : position v2 (Argent disponible / Mis de côté / Total), moneyPosition redirigée', () => {
    const p = positionOf(raw, 'XOF', TODAY);
    const old = moneyPosition(raw.accounts, raw.transactions, raw.goals, raw.goalContributions, 'XOF', TODAY);
    expect(old.free).toBe(p.available);
  });

  it('coach : mois clos — R 150 000, C 40 000, Rb 100 000 ; capacité = Marge observée, jamais le déclaré', () => {
    expect(monthMetrics(raw, '2026-09', 'XOF')).toMatchObject({ received: 150_000, spent: 40_000, repaid: 100_000 });
    const s = financialSnapshot({ data: raw, currency: 'XOF', now: TODAY, available: 0, financial: { monthlyIncome: 900_000 } });
    expect(s.income).toEqual({ value: 150_000, source: 'user' });
    // Marge = R − C − Rb − S = 150 000 − 40 000 − 100 000 − (−100 000 de retour de cagnotte).
    expect(observedCapacity(raw, 'XOF', TODAY)).toBe(margin(raw));
    // Sans mois clos : « Pas encore assez de données », jamais un montant tiré du déclaré.
    expect(observedCapacity({ ...raw, transactions: [] }, 'XOF', TODAY, { monthlyIncome: 150_000 })).toBeNull();
  });

  it('coach : score v2 ; insights et résumé de l’assistant sur les revenus reçus seulement', () => {
    const score = behaviorScore(raw, 'XOF', '2026-09');
    // Score v2 (§11.5) : composante « vivre selon ses moyens » sur R reçu ; plus de composante « objectifs ».
    expect(score.components.some((c) => c.id === 'means')).toBe(true);
    expect(score.components.some((c) => c.id === ('goals' as never))).toBe(false);
    const insights = computeInsights({ data: d, currency: 'XOF', now: TODAY, categoryName: (_c, id) => id });
    expect(insights.some((i) => i.kind === 'income_drop')).toBe(false);
    const sum = buildFinanceSummary(raw, 'XOF', '2026-09-30', (id) => id, { reserve: 'R', season: 'S', country: 'CI' });
    expect([sum.received, sum.spent, sum.repaid, sum.country]).toEqual([150_000, 40_000, 100_000, 'CI']);
    expect([sum.month.income, sum.month.expense]).toEqual([150_000, 40_000]);
  });

  it('export CSV : seule la ligne de salaire est un revenu', () => {
    const csv = ledgerCsv(raw, { headers: Array(13).fill('h'), accountName: (id) => id, categoryName: (id) => id, natureLabel: (n) => n, decimals: () => 0 });
    const natures = csv.replace('﻿', '').split('\n').slice(1).map((l) => l.split(';')[1]);
    expect(natures.filter((n) => n === 'revenu')).toHaveLength(1);
    expect(natures).toEqual(expect.arrayContaining(['emprunt_recu', 'retour_tontine', 'remboursement_recu', 'remboursement_capital', 'interets']));
  });
});

function margin(raw: ReturnType<typeof dataset>) {
  const r = periodReport(raw, SEPT, 'XOF');
  return r.revenus - r.depenses - r.remboursements - r.epargneNette;
}
