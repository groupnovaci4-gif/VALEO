/**
 * Argent disponible v2 (docs/argent-disponible.md) — §3 cycle de vie des comptes et
 * correction de solde, §3.4 transferts, §6.5 permissions de l'enfant, §11 coach,
 * §11.7 parseur. Exemples du §14.
 */
import { describe, expect, it } from 'vitest';
import { balanceCorrection, canChangeCurrency, canDeactivate, canDeleteAccount, canToggleSavings } from '../src/core/accountRules';
import { sameCurrencyTransferError, validateTransaction } from '../src/core/transactions';
import { canCreateTransaction } from '../src/core/permissions';
import { behaviorScoreV2, isIrregularIncome, margin, nextAdvice, precaution, savingsRate, sourceSavingSuggestion, tenPercent } from '../src/core/coachMetrics';
import { periodReport } from '../src/core/ledger';
import { parseEntryText, type EntryContext, type EntryDraft } from '../src/core/entry/parse';
import { systemCategories } from '../src/core/defaults';
import { subcategoryDocs } from '../src/core/catalog';
import { account, space, tontine, tx } from './helpers';

describe('§3.2-3.3 — comptes : correction de solde et cycle de vie', () => {
  it('E28 — solde 70 000, compté 60 000 : ajustement « out » de 10 000 ; E28b — corriger à 70 000 : aucun ajustement', () => {
    expect(balanceCorrection(70_000, 60_000)).toEqual({ direction: 'out', amount: 10_000 });
    expect(balanceCorrection(70_000, 85_000)).toEqual({ direction: 'in', amount: 15_000 });
    expect(balanceCorrection(70_000, 70_000)).toBeNull();
  });

  it('E27 — désactiver Wave à 30 000 : refusé ; à 0 (après transfert) : accepté', () => {
    expect(canDeactivate(30_000)).toBe(false);
    expect(canDeactivate(-5_000)).toBe(false);
    expect(canDeactivate(0)).toBe(true);
  });

  it('E29 — changer la devise d’un compte XOF déjà utilisé : refusé', () => {
    const a = account({ id: 'a' });
    expect(canChangeCurrency(a, [tx({ type: 'expense', amount: 1_000, accountId: 'a' })])).toBe(false);
    expect(canChangeCurrency(a, [tx({ type: 'transfer', amount: 1_000, accountId: 'b', toAccountId: 'a' })])).toBe(false);
    expect(canChangeCurrency(account({ id: 'a', openingBalance: 5_000 }), [])).toBe(false);
    expect(canChangeCurrency(a, [tx({ type: 'expense', amount: 1_000, accountId: 'a', deleted: true })])).toBe(true);
  });

  it('E49b — supprimer un compte jamais utilisé avec une ouverture de 80 000 : refusé (désactiver d’abord)', () => {
    expect(canDeleteAccount(account({ id: 'a', openingBalance: 80_000 }), [])).toBe(false);
    expect(canDeleteAccount(account({ id: 'a' }), [tx({ type: 'expense', amount: 1, accountId: 'a' })])).toBe(false);
    expect(canDeleteAccount(account({ id: 'a' }), [])).toBe(true);
  });

  it('E50 — passer en épargne un Wave à 50 000 : refusé ; à 0 : accepté', () => {
    expect(canToggleSavings(50_000)).toBe(false);
    expect(canToggleSavings(0)).toBe(true);
  });

  it('E26b — transfert en même devise avec un montant reçu différent : refusé par la validation pure', () => {
    const accounts = [account({ id: 'om' }), account({ id: 'wave' })];
    expect(sameCurrencyTransferError({ type: 'transfer', toAmount: 49_000, accountId: 'om', toAccountId: 'wave' }, accounts)).toBe('transfer.sameCurrencyAmount');
    expect(sameCurrencyTransferError({ type: 'transfer', toAmount: null, accountId: 'om', toAccountId: 'wave' }, accounts)).toBeNull();
    // Entre deux devises, le montant reçu reste obligatoire (inchangé).
    const eur = account({ id: 'eur', currency: 'EUR' });
    expect(sameCurrencyTransferError({ type: 'transfer', toAmount: 1_000, accountId: 'om', toAccountId: 'eur' }, [...accounts, eur])).toBeNull();
    expect(validateTransaction({ type: 'transfer', amount: 50_000, date: '2026-10-15', accountId: 'om', toAccountId: 'wave', currency: 'XOF' }, accounts)).toEqual([]);
  });

  it('E41b — un enfant ne crée ni revenu ni transfert (miroir des règles Firestore)', () => {
    expect(canCreateTransaction('child', 'expense')).toBe(true);
    for (const type of ['income', 'transfer', 'adjustment'] as const) expect(canCreateTransaction('child', type)).toBe(false);
    for (const role of ['admin', 'partner'] as const) expect(canCreateTransaction(role, 'income')).toBe(true);
    expect(canCreateTransaction(null, 'expense')).toBe(false);
  });
});

describe('§11 — coach : définitions, règle des 10 %, indicateurs, score', () => {
  it('E38 — R 150 000, D 120 000, E 40 000 : « 10 % de vos revenus reçus : 15 000 F »', () => {
    expect(tenPercent({ received: 150_000, available: 120_000, commitments: 40_000, saved: 0 })).toMatchObject({ advice: 15_000, feasible: 15_000 });
  });

  it('E38b — R 150 000, D 40 000, E 30 000 : faisable 10 000', () => {
    expect(tenPercent({ received: 150_000, available: 40_000, commitments: 30_000, saved: 0 }).feasible).toBe(10_000);
  });

  it('déjà épargné 9 000 : 6 %, encore 6 000 pour atteindre 10 %', () => {
    expect(tenPercent({ received: 150_000, available: 100_000, commitments: 0, saved: 9_000 })).toMatchObject({ savedPercent: 6, toReach: 6_000, feasible: 6_000 });
  });

  it('E38c — revenu déclaré 150 000 mais R = 0 : aucun montant', () => {
    expect(tenPercent({ received: 0, available: 50_000, commitments: 0, saved: 0 })).toEqual({ advice: null, feasible: null, savedPercent: null, toReach: null });
  });

  it('E38d — commerçant (revenus irréguliers) qui reçoit 25 000 : « Mettre 2 500 F de côté maintenant ? »', () => {
    expect(sourceSavingSuggestion(25_000, true)).toBe(2_500);
    expect(sourceSavingSuggestion(25_000, false)).toBeNull();
    expect(isIrregularIncome({ incomeNature: 'irregular' }, [])).toBe(true);
    expect(isIrregularIncome({ incomeNature: 'fixed' }, [200_000, 200_000, 200_000, 200_000, 200_000, 200_000])).toBe(false);
    expect(isIrregularIncome(null, [10_000, 200_000, 30_000, 150_000, 0, 90_000])).toBe(true);
  });

  it('E39 — salaire 200 000, dépenses 120 000, cotisations de tontine 50 000 : Marge 30 000 (pas 80 000), τ = 25 %', () => {
    const d = space({
      accounts: [account({ id: 'cash' })],
      tontines: [tontine({ id: 'rot' })],
      transactions: [
        tx({ type: 'income', amount: 200_000, accountId: 'cash', categoryId: 'inc_salary', date: '2026-10-01' }),
        tx({ type: 'expense', amount: 120_000, accountId: 'cash', categoryId: 'cat_food', date: '2026-10-03' }),
        tx({ type: 'expense', amount: 50_000, accountId: 'cash', tontineId: 'rot', date: '2026-10-05' }),
      ],
    });
    const r = periodReport(d, { start: '2026-10-01', end: '2026-10-31' }, 'XOF');
    expect(margin({ received: r.revenus, spent: r.depenses, repaid: r.remboursements, saved: r.epargneNette })).toBe(30_000);
    expect(savingsRate(r.epargneNette, r.revenus)).toBe(25);
    expect(savingsRate(10_000, 0)).toBeNull();
  });

  it('E39b — score avec 1 F épargné et R = 200 000 : composante épargne = 0', () => {
    const s = behaviorScoreV2({ received: 200_000, spent: 100_000, repaid: 0, saved: 1, tracked: true, operations: 20, monthsCovered: null, irregular: false, budgets: [], debts: null });
    expect(s.components.find((c) => c.id === 'savings')!.points).toBe(0);
    expect(savingsRate(1, 200_000)).toBe(0);
  });

  it('§11.5 — score : jamais calculé sans revenu reçu, sans argent renseigné ou avec moins de 10 opérations ; composantes sans données exclues', () => {
    const base = { received: 200_000, spent: 150_000, repaid: 0, saved: 20_000, tracked: true, operations: 20, monthsCovered: 3, irregular: false, budgets: [], debts: null };
    expect(behaviorScoreV2({ ...base, received: 0 }).score).toBeNull();
    expect(behaviorScoreV2({ ...base, tracked: false }).score).toBeNull();
    expect(behaviorScoreV2({ ...base, operations: 9 }).score).toBeNull();
    // Épargne 30/30, moyens 25/25, précaution 20/20 ; budget et dettes exclus : 75/75 → 100.
    expect(behaviorScoreV2(base).score).toBe(100);
    // Un fonds d'urgence de 3 000 F ne donne plus 100/100 (mois couverts ≈ 0).
    expect(behaviorScoreV2({ ...base, monthsCovered: 0.03 }).score).toBeLessThan(80);
  });

  it('E39c — F 180 000, Ess 90 000, revenus réguliers : 2 mois couverts ; objectif 3 mois = 270 000 (encore 90 000)', () => {
    expect(precaution({ fund: 180_000, essentials: 90_000, irregular: false })).toEqual({ months: 2, targetMonths: 3, target: 270_000, missing: 90_000 });
    expect(precaution({ fund: 180_000, essentials: 90_000, irregular: true })).toMatchObject({ targetMonths: 6, target: 540_000, missing: 360_000 });
    expect(precaution({ fund: 10_000, essentials: 0, irregular: false })).toBeNull();
  });

  it('§11.4 — un seul producteur par conseil, dans l’ordre', () => {
    const calm = { tracked: true, available: 100_000, commitments: 10_000, overdue: false, monthsCovered: 4, overspentMonths: 0, savingsRate: 12, fixedShare: 30, debtShare: 10, goalsBehind: false };
    expect(nextAdvice({ ...calm, tracked: false })).toBe('money_unknown');
    expect(nextAdvice({ ...calm, commitments: 200_000, overdue: true })).toBe('commitments_over_available');
    expect(nextAdvice({ ...calm, overdue: true, monthsCovered: 0 })).toBe('overdue');
    expect(nextAdvice({ ...calm, monthsCovered: 0.5, savingsRate: 0 })).toBe('precaution_low');
    expect(nextAdvice({ ...calm, overspentMonths: 2, savingsRate: 0 })).toBe('living_beyond_means');
    expect(nextAdvice({ ...calm, savingsRate: 4 })).toBe('ten_percent');
    expect(nextAdvice({ ...calm, fixedShare: 65 })).toBe('fixed_charges');
    expect(nextAdvice({ ...calm, debtShare: 35 })).toBe('debt_load');
    expect(nextAdvice({ ...calm, goalsBehind: true })).toBe('goals_effort');
    expect(nextAdvice(calm)).toBe('congrats');
  });
});

describe('§11.7 — E39d : sens des dettes dans le parseur', () => {
  const parents = systemCategories({ now: 1, uid: 'u1', zone: 'africa' });
  const categories = [...parents, ...subcategoryDocs('CI', 'africa', { now: 1, uid: 'u1', lang: 'fr', parents: new Set(parents.map((c) => c.id)) })];
  const ctx: EntryContext = { today: '2026-10-15', currency: 'XOF', accounts: [account({ id: 'cash', name: 'Espèces' })], categories, defaultAccountId: 'cash' };
  const one = (text: string): EntryDraft => {
    const r = parseEntryText(text, ctx);
    if (r.kind !== 'entries') throw new Error(`« ${text} » → ${r.kind}`);
    return r.items[0];
  };
  const row = (d: EntryDraft) => ({ type: d.type, amount: d.amount, nature: d.nature ?? null, toChoose: d.toChoose ?? null });

  it('« J’ai remboursé Paul 10 000 » : remboursement de dette (sortie), dette à choisir', () => {
    expect(row(one("J'ai remboursé Paul 10 000"))).toEqual({ type: 'expense', amount: 10_000, nature: 'remboursement_capital', toChoose: 'debt' });
  });
  it('« On m’a prêté 50 000 », « J’ai emprunté 50 000 » : emprunt reçu (entrée), à confirmer', () => {
    for (const s of ["On m'a prêté 50 000", "J'ai emprunté 50 000"]) expect(row(one(s))).toEqual({ type: 'income', amount: 50_000, nature: 'emprunt_recu', toChoose: 'debt' });
  });
  it('« J’ai prêté 20 000 à mon cousin » : prêt accordé (sortie)', () => {
    expect(row(one("J'ai prêté 20 000 à mon cousin"))).toEqual({ type: 'expense', amount: 20_000, nature: 'pret_accorde', toChoose: 'debt' });
  });
  it('« J’ai reçu le prêt de la banque 500 000 » : emprunt reçu', () => {
    expect(row(one("J'ai reçu le prêt de la banque 500 000"))).toEqual({ type: 'income', amount: 500_000, nature: 'emprunt_recu', toChoose: 'debt' });
  });
  it('« J’ai reçu une facture de 20 000 » : dépense, catégorie surlignée (jamais devinée)', () => {
    const d = one("J'ai reçu une facture de 20 000");
    expect([d.type, d.amount]).toEqual(['expense', 20_000]);
    expect(d.uncertain).toContain('category');
  });
  it('« J’ai reçu la cagnotte 100 000 » : retour de tontine, tontine à choisir', () => {
    expect(row(one("J'ai reçu la cagnotte 100 000"))).toEqual({ type: 'income', amount: 100_000, nature: 'retour_tontine', toChoose: 'tontine' });
  });
  it('non-régression : « on m’a remboursé 5 000 » reste une entrée', () => {
    expect(one("on m'a remboursé 5 000").type).toBe('income');
  });
});
