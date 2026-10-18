/**
 * Argent disponible v2 (docs/argent-disponible.md) — §7 reste par jour (horizon de
 * paie, engagements), §8 récurrences à confirmer, §9 reste à répartir. Exemples du §14 :
 * sauf mention contraire, le 15 d'un mois de 31 jours, sans jour de paie (17 jours).
 */
import { describe, expect, it } from 'vitest';
import { dailyAllowanceV2, payHorizon, shareOfDeclared, unallocated } from '../src/core/allowance';
import { recurringToConfirm } from '../src/core/recurringConfirm';
import { recurringTxId } from '../src/core/recurring';
import { account, contribution, debt, envelope, goal, rule, space, tontine, tx } from './helpers';

const TODAY = '2026-10-15';
const cash = (opening = 0) => account({ id: 'cash', name: 'Espèces', openingBalance: opening });
const ce = (opening = 0) => account({ id: 'ce', name: 'Épargne', type: 'savings', isSavings: true, openingBalance: opening });
const ok = (r: ReturnType<typeof dailyAllowanceV2>) => {
  if (r.status !== 'ok') throw new Error(`statut ${r.status}`);
  return r;
};

describe('§7.1 — horizon (D8)', () => {
  it('sans jour de paie : fin du mois, 17 jours restants le 15 octobre', () => {
    expect(payHorizon(TODAY, null)).toEqual({ until: '2026-10-31', daysLeft: 17, cycleStart: '2026-10-01', lastPayday: null });
  });
  it('jour de paie : veille de la prochaine paie ; le 30 tombe le 28 février', () => {
    expect(payHorizon('2026-10-18', 25)).toMatchObject({ until: '2026-10-24', daysLeft: 7, lastPayday: '2026-09-25' });
    expect(payHorizon('2026-10-25', 25)).toMatchObject({ until: '2026-11-24', daysLeft: 31, lastPayday: '2026-10-25' });
    expect(payHorizon('2027-02-10', 30)).toMatchObject({ until: '2027-02-27', daysLeft: 18 });
    expect(payHorizon('2027-02-28', 30)).toMatchObject({ until: '2027-03-29', lastPayday: '2027-02-28' });
  });
});

// Doc v2 révisé (§7.2) : une échéance non confirmée de la période PRÉCÉDENTE reste dans E.
// Les exemples du §14 supposent le loyer de septembre payé : il est marqué comme tel
// (`lastGenerated`, ancienne génération automatique).
describe('§7 — reste par jour v2 (D − E)', () => {
  it('E2 — revenu déclaré 200 000, rien d’autre : aucun « par jour » (carte « Votre argent disponible aujourd’hui »)', () => {
    expect(dailyAllowanceV2({ data: space({ accounts: [cash()] }), currency: 'XOF', today: TODAY }).status).toBe('needs_money');
  });

  it('E3 — ouverture Espèces 100 000 : 100 000 / 17 = 5 882', () => {
    expect(ok(dailyAllowanceV2({ data: space({ accounts: [cash(100_000)] }), currency: 'XOF', today: TODAY })).perDay).toBe(5_882);
  });

  it('E4 — versement de 60 000 sur un CE : 40 000 / 17 = 2 352', () => {
    const d = space({ accounts: [cash(100_000), ce()], transactions: [tx({ type: 'transfer', amount: 60_000, accountId: 'cash', toAccountId: 'ce', date: '2026-10-10' })] });
    expect(ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: TODAY })).perDay).toBe(2_352);
  });

  it('E8 — CE de 500 000 « que j’avais déjà » : reste par jour inchangé, ce mois-ci et le suivant', () => {
    for (const today of [TODAY, '2026-11-15']) {
      const without = ok(dailyAllowanceV2({ data: space({ accounts: [cash(100_000)] }), currency: 'XOF', today }));
      const withCe = ok(dailyAllowanceV2({ data: space({ accounts: [cash(100_000), ce(500_000)] }), currency: 'XOF', today }));
      expect(withCe.perDay).toBe(without.perDay);
    }
  });

  it('E11 — D 100 000 ; loyer 30 000 le 28 ; objectif 20 000/mois rien versé : E = 50 000, 2 941 par jour', () => {
    const d = space({ accounts: [cash(100_000)], recurring: [rule({ amount: 30_000, accountId: 'cash', categoryId: 'cat_housing', startDate: '2026-01-28', lastGenerated: '2026-09-28' })], goals: [goal({ id: 'moto', targetAmount: 500_000, monthlyContribution: 20_000 })] });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: TODAY }));
    expect([r.available, r.commitments, r.perDay]).toEqual([100_000, 50_000, 2_941]);
  });

  it('E11b — E11 + mensualité de dette de 25 000 le 30 : E = 75 000, 1 470 par jour', () => {
    const d = space({
      accounts: [cash(100_000)],
      recurring: [rule({ amount: 30_000, accountId: 'cash', startDate: '2026-01-28', lastGenerated: '2026-09-28' })],
      goals: [goal({ id: 'moto', targetAmount: 500_000, monthlyContribution: 20_000 })],
      debts: [debt({ id: 'owe', principal: 300_000, installment: 25_000, dueDay: 30 })],
    });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: TODAY }));
    expect([r.commitments, r.perDay]).toEqual([75_000, 1_470]);
  });

  it('E11c — E11, puis 20 000 versés à l’objectif depuis Espèces : D 80 000, E 30 000, toujours 2 941', () => {
    const d = space({
      accounts: [cash(100_000)],
      recurring: [rule({ amount: 30_000, accountId: 'cash', startDate: '2026-01-28', lastGenerated: '2026-09-28' })],
      goals: [goal({ id: 'moto', targetAmount: 500_000, monthlyContribution: 20_000 })],
      goalContributions: [contribution({ goalId: 'moto', amount: 20_000, accountId: 'cash', date: '2026-10-10' })],
    });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: TODAY }));
    expect([r.available, r.commitments, r.perDay]).toEqual([80_000, 30_000, 2_941]);
  });

  it('E31 — 18 octobre, paie le 25, D 42 000 ; tontine 10 000 le 20 ; loyer le 28 : 7 jours, E 10 000, 4 571', () => {
    const d = space({
      accounts: [cash(42_000)],
      tontines: [tontine({ id: 'rot', startDate: '2026-10-20' })],
      // Le loyer de septembre a été payé (ancienne génération automatique).
      recurring: [rule({ amount: 30_000, accountId: 'cash', startDate: '2026-01-28', lastGenerated: '2026-09-28' })],
    });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-18', payDay: 25 }));
    expect([r.until, r.daysLeft, r.commitments, r.perDay]).toEqual(['2026-10-24', 7, 10_000, 4_571]);
  });

  it('E32 — 25 octobre, salaire confirmé, D 204 000 ; loyer le 28 ; tontine le 20 novembre ; objectif 20 000 : 31 jours, E 60 000, 4 645', () => {
    const d = space({
      accounts: [cash(4_000)],
      transactions: [tx({ type: 'income', amount: 200_000, accountId: 'cash', categoryId: 'inc_salary', date: '2026-10-25' })],
      tontines: [tontine({ id: 'rot', startDate: '2026-11-20' })],
      recurring: [rule({ amount: 30_000, accountId: 'cash', startDate: '2026-01-28', lastGenerated: '2026-09-28' })],
      goals: [goal({ id: 'moto', targetAmount: 500_000, monthlyContribution: 20_000 })],
    });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-25', payDay: 25 }));
    expect([r.available, r.until, r.daysLeft, r.commitments, r.perDay, r.salaryPending]).toEqual([204_000, '2026-11-24', 31, 60_000, 4_645, null]);
  });

  it('E33 — 26 octobre, salaire du 25 NON confirmé, D 4 000, loyer le 28 : dépassement de 26 000 jusqu’au 24 novembre, « Salaire attendu : reçu ? »', () => {
    const d = space({ accounts: [cash(4_000)], recurring: [rule({ amount: 30_000, accountId: 'cash', startDate: '2026-01-28', lastGenerated: '2026-09-28' })] });
    const r = dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-26', payDay: 25 });
    expect(r.status).toBe('deficit');
    if (r.status !== 'deficit') return;
    expect([r.deficit, r.until, r.salaryPending]).toEqual([26_000, '2026-11-24', '2026-10-25']);
  });

  it('E34 — loyer du 5 en retard le 6 : dans E ; confirmé le 7 : D 70 000 et il sort de E', () => {
    const r1 = rule({ id: 'loyer', amount: 30_000, accountId: 'cash', startDate: '2026-01-05', lastGenerated: '2026-09-05' });
    const late = ok(dailyAllowanceV2({ data: space({ accounts: [cash(100_000)], recurring: [r1] }), currency: 'XOF', today: '2026-10-06' }));
    expect([late.available, late.commitments]).toEqual([100_000, 30_000]);
    const paid = space({ accounts: [cash(100_000)], recurring: [r1], transactions: [tx({ id: recurringTxId('loyer', '2026-10-05'), type: 'expense', amount: 30_000, accountId: 'cash', recurringId: 'loyer', date: '2026-10-07' })] });
    const after = ok(dailyAllowanceV2({ data: paid, currency: 'XOF', today: '2026-10-07' }));
    expect([after.available, after.commitments]).toEqual([70_000, 0]);
  });

  it('E35 — le 10 : salaire daté du 25 (à venir) hors de D ; dépense de 15 000 datée du 20 dans E', () => {
    const d = space({ accounts: [cash(50_000)], transactions: [tx({ type: 'income', amount: 200_000, accountId: 'cash', date: '2026-10-25' }), tx({ type: 'expense', amount: 15_000, accountId: 'cash', date: '2026-10-20' })] });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-10' }));
    expect([r.available, r.commitments]).toEqual([50_000, 15_000]);
  });

  it('les revenus attendus ne réduisent jamais E ; la cagnotte attendue ne compte pas', () => {
    const d = space({ accounts: [cash(50_000)], recurring: [rule({ type: 'income', amount: 200_000, accountId: 'cash', startDate: '2026-01-20' })], tontines: [tontine({ id: 'rot', startDate: '2026-10-20', myTurns: [1] })] });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: TODAY }));
    expect([r.available, r.commitments]).toEqual([50_000, 10_000]);
  });

  it('une récurrence convertie en tontine n’est comptée qu’une fois (D7)', () => {
    const r1 = rule({ id: 'rec_t', amount: 10_000, accountId: 'cash', startDate: '2026-01-20', lastGenerated: '2026-09-20', categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine' });
    const d = space({ accounts: [cash(50_000)], recurring: [r1], tontines: [tontine({ id: 'rot', startDate: '2026-10-20', linkedRecurringId: 'rec_t' })] });
    expect(ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: TODAY })).commitments).toBe(10_000);
  });
});

describe('§8 — récurrences : jamais enregistrées seules, confirmées d’un geste (D7)', () => {
  it('E36 — six mois sans ouvrir l’application, récurrence de salaire : aucun revenu créé, UNE seule carte « reçu ? »', () => {
    const sal = rule({ id: 'sal', type: 'income', amount: 200_000, accountId: 'cash', startDate: '2026-01-25', categoryId: 'inc_salary' });
    const cards = recurringToConfirm(space({ accounts: [cash()], recurring: [sal] }), '2026-10-15');
    expect(cards).toEqual([{ ruleId: 'sal', type: 'income', date: '2026-09-25', amount: 200_000, id: recurringTxId('sal', '2026-09-25') }]);
  });

  it('E34 / E37 — dépense en retard : une carte « payé ? », identifiant déterministe (deux téléphones → une seule opération)', () => {
    const loyer = rule({ id: 'loyer', amount: 30_000, accountId: 'cash', startDate: '2026-01-05', lastGenerated: '2026-09-05' });
    const [card] = recurringToConfirm(space({ accounts: [cash()], recurring: [loyer] }), '2026-10-06');
    expect(card).toMatchObject({ ruleId: 'loyer', type: 'expense', date: '2026-10-05' });
    expect(card.id).toBe(recurringTxId('loyer', '2026-10-05'));
    const done = space({ accounts: [cash()], recurring: [loyer], transactions: [tx({ id: card.id, type: 'expense', amount: 30_000, accountId: 'cash', recurringId: 'loyer', date: '2026-10-06' })] });
    expect(recurringToConfirm(done, '2026-10-06')).toEqual([]);
  });
});

describe('§9 — reste à répartir', () => {
  it('E9 — déclaré 800 000, enveloppes Maison 150 000 et Nourriture 150 000, D 800 000 : 500 000 ; 18,75 % du déclaré', () => {
    const d = space({ accounts: [cash(800_000)], envelopes: [envelope({ id: 'maison', monthlyBudget: 150_000, categoryIds: ['cat_housing'] }), envelope({ id: 'food', monthlyBudget: 150_000, categoryIds: ['cat_food'] })] });
    const u = unallocated({ data: d, currency: 'XOF', today: TODAY });
    expect(u.amount).toBe(500_000);
    expect(shareOfDeclared(150_000, 800_000, 'personal')).toBe(18.75);
    expect(shareOfDeclared(150_000, 800_000, 'family')).toBeNull();
    expect(shareOfDeclared(150_000, null, 'personal')).toBeNull();
  });

  it('E44 — D 100 000 ; Nourriture 50 000 dépensé 70 000 ; Maison 30 000 (loyer récurrent dedans) ; tontine 10 000 hors enveloppe : 60 000', () => {
    const d = space({
      accounts: [cash(170_000)],
      transactions: [tx({ type: 'expense', amount: 70_000, accountId: 'cash', categoryId: 'cat_food', date: '2026-10-05' })],
      envelopes: [envelope({ id: 'food', monthlyBudget: 50_000, categoryIds: ['cat_food'] }), envelope({ id: 'maison', monthlyBudget: 30_000, categoryIds: ['cat_housing'] })],
      recurring: [rule({ amount: 30_000, accountId: 'cash', categoryId: 'cat_housing', startDate: '2026-01-28', lastGenerated: '2026-09-28' })],
      tontines: [tontine({ id: 'rot', startDate: '2026-10-20' })],
    });
    const u = unallocated({ data: d, currency: 'XOF', today: TODAY });
    expect([u.available, u.envelopesRemaining, u.outsideCommitments, u.amount]).toEqual([100_000, 30_000, 10_000, 60_000]);
  });
});
