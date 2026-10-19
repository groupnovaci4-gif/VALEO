/**
 * Argent disponible v2 — corrections du cœur après arbitrage du fondateur (doc révisé :
 * §5.4 clôture et avance, §7.1 paie confirmée, §7.2 versé net et retards, §11.7, §14).
 */
import { describe, expect, it } from 'vitest';
import { periodReport, openingDateOf } from '../src/core/ledger';
import { closureGaps, closureSuggested, tontineClosure } from '../src/core/tontineLedger';
import { positionOf } from '../src/core/position';
import { dailyAllowanceV2, toRegularize } from '../src/core/allowance';
import { recurringToConfirm } from '../src/core/recurringConfirm';
import { natureContext, natureOf } from '../src/core/nature';
import { toISODate } from '../src/core/dates';
import { account, contribution, debt, goal, rule, space, tentry, tontine, tx } from './helpers';
import type { Transaction } from '../src/core/types';

const cash = (opening = 0) => account({ id: 'cash', name: 'Espèces', openingBalance: opening });
const ce = (opening = 0) => account({ id: 'ce', name: 'Épargne', type: 'savings', isSavings: true, openingBalance: opening });
const YEAR = { start: '2026-01-01', end: '2026-12-31' };
const ok = (r: ReturnType<typeof dailyAllowanceV2>) => {
  if (r.status !== 'ok') throw new Error(`statut ${r.status}`);
  return r;
};

/** Cycle de 10 × 10 000 (janvier → octobre), mon tour à `turn`, cagnotte `pot`. */
function cycle(turn: number, pot = 100_000, over: Parameters<typeof tontine>[0] = {}) {
  const t = tontine({ id: 'rot', startDate: '2026-01-05', myTurns: [turn], ...over });
  const txs: Transaction[] = [];
  const entries = [];
  for (let i = 1; i <= 10; i++) {
    const date = `2026-${String(i).padStart(2, '0')}-05`;
    const c = tx({ id: `c${i}`, type: 'expense', amount: 10_000, accountId: 'cash', tontineId: 'rot', date });
    txs.push(c);
    entries.push(tentry({ tontineId: 'rot', kind: 'contribution', period: i, amount: 10_000, date, transactionId: c.id }));
    if (i === turn) {
      const p = tx({ id: 'pot', type: 'income', amount: pot, accountId: 'cash', tontineId: 'rot', date });
      txs.push(p);
      entries.push(tentry({ id: 'pot_e', tontineId: 'rot', kind: 'payout', period: i, amount: pot, date, transactionId: 'pot' }));
    }
  }
  return space({ accounts: [cash(200_000)], tontines: [t], transactions: txs, tontineEntries: entries });
}

describe('A1 — après la cagnotte, les cotisations remboursent l’avance du groupe (Financement)', () => {
  it('E19c — mon tour au 6e, cycle complet : épargne nette 0 ; 4 × 10 000 en remboursement de l’avance', () => {
    const r = periodReport(cycle(6), YEAR, 'XOF');
    expect(r.epargneNette).toBe(0);
    expect(r.financement.avancesTontine).toBe(40_000);
    expect(r.financement.remboursementsAvance).toBe(40_000);
    expect([r.revenus, r.depenses]).toEqual([0, 0]);
  });

  it('E19c — quel que soit le tour (1, 6, 10) : épargne nette du cycle = 0', () => {
    for (const turn of [1, 3, 6, 10]) expect(periodReport(cycle(turn), YEAR, 'XOF').epargneNette).toBe(0);
  });

  it('sans entrées du carnet (cotisations liées seulement) : même règle', () => {
    const d = cycle(6);
    const r = periodReport({ ...d, tontineEntries: [] }, YEAR, 'XOF');
    expect([r.epargneNette, r.financement.remboursementsAvance]).toEqual([0, 40_000]);
  });
});

describe('A2 — clôture toujours confirmée, frais ou gain comptés à la date de clôture', () => {
  it('E19b — cagnotte 95 000, clôturée le 20 octobre : dépenses +5 000 et épargne nette −5 000 en octobre ; aucune opération créée', () => {
    const d = cycle(10, 95_000, { status: 'finished', closedAt: '2026-10-20' });
    const oct = periodReport(d, { start: '2026-10-01', end: '2026-10-31' }, 'XOF');
    const sept = periodReport(d, { start: '2026-09-01', end: '2026-09-30' }, 'XOF');
    expect(oct.depenses).toBe(5_000);
    expect(sept.depenses).toBe(0);
    expect(periodReport(d, YEAR, 'XOF').epargneNette).toBe(0);
    // Octobre : +10 000 (cotisation) − 95 000 (retour) − 5 000 (frais de clôture).
    expect(oct.epargneNette).toBe(-90_000);
    expect(d.transactions.length).toBe(11);
    expect(positionOf(d, 'XOF', '2026-10-25').tontineReceivable).toBe(0);
  });

  it('gain de clôture (reçu > cotisé) : compté dans les revenus à la date de clôture', () => {
    const d = cycle(10, 105_000, { status: 'finished', closedAt: '2026-10-20' });
    const oct = periodReport(d, { start: '2026-10-01', end: '2026-10-31' }, 'XOF');
    expect(oct.revenus).toBe(5_000);
    expect(oct.depenses).toBe(0);
  });

  it('E19d — dernière échéance passée, cagnotte jamais notée, non clôturée : aucun frais, clôture PROPOSÉE, créance 100 000 au patrimoine', () => {
    const t = tontine({ id: 'rot', startDate: '2025-11-05', myTurns: [10] });
    const entries = Array.from({ length: 10 }, (_, i) => tentry({ tontineId: 'rot', kind: 'contribution', period: i + 1, amount: 10_000 }));
    const d = space({ accounts: [cash()], tontines: [t], tontineEntries: entries });
    expect(tontineClosure(t, entries, '2026-10-15')).toMatchObject({ closed: false, fees: 0, gain: 0 });
    expect(closureSuggested(t, '2026-10-15')).toBe(true);
    expect(closureSuggested({ ...t, status: 'finished' }, '2026-10-15')).toBe(false);
    expect(closureSuggested(tontine({ id: 'x', startDate: '2026-10-05' }), '2026-10-15')).toBe(false);
    expect(positionOf(d, 'XOF', '2026-10-15').tontineReceivable).toBe(100_000);
    expect(periodReport(d, YEAR, 'XOF').depenses).toBe(0);
  });
});

describe('A3 — paie confirmée : au plus tôt 7 jours avant le jour de paie de la période', () => {
  const sal = (date: string) => tx({ type: 'income', amount: 200_000, accountId: 'cash', categoryId: 'inc_salary', date });

  it('E33b — salaire de septembre reçu le 27 septembre ; le 26 octobre, rien en octobre : le salaire d’octobre reste attendu', () => {
    const d = space({ accounts: [cash(300_000)], transactions: [sal('2026-09-27')] });
    const r = dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-26', payDay: 25 });
    expect(r.status !== 'needs_money' && r.salaryPending).toBe('2026-10-25');
  });

  it('E33c — paie le 25 (un dimanche), salaire reçu le 23 : paie confirmée, la période commence', () => {
    const d = space({ accounts: [cash(10_000)], transactions: [sal('2026-10-23')] });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-26', payDay: 25 }));
    expect(r.salaryPending).toBeNull();
    // Reçu en avance, le jour même : la période de la paie du 25 commence, jusqu'au 24 novembre.
    const early = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-23', payDay: 25 }));
    expect([early.salaryPending, early.until, early.daysLeft]).toEqual([null, '2026-11-24', 33]);
  });

  it('plus de 7 jours avant : ne confirme pas', () => {
    const d = space({ accounts: [cash(300_000)], transactions: [sal('2026-10-17')] });
    const r = dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-26', payDay: 25 });
    expect(r.status !== 'needs_money' && r.salaryPending).toBe('2026-10-25');
  });
});

describe('A4 — engagement d’un objectif : versé NET venant du disponible', () => {
  const moto = goal({ id: 'moto', targetAmount: 500_000, monthlyContribution: 20_000 });

  it('E11d — 20 000 versés puis 20 000 retirés ce mois-ci : versé net 0, l’engagement de 20 000 reste', () => {
    const d = space({
      accounts: [cash(100_000)],
      goals: [moto],
      goalContributions: [contribution({ goalId: 'moto', amount: 20_000, accountId: 'cash', date: '2026-10-05' }), contribution({ goalId: 'moto', amount: -20_000, accountId: 'cash', date: '2026-10-08' })],
    });
    expect(ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-15' })).commitments).toBe(20_000);
  });

  it('E11e — 20 000 affectés depuis un compte d’épargne existant : l’engagement reste (rien n’est sorti du disponible)', () => {
    const d = space({ accounts: [cash(100_000), ce(60_000)], goals: [moto], goalContributions: [contribution({ goalId: 'moto', amount: 20_000, accountId: 'ce', date: '2026-10-05' })] });
    expect(ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-15' })).commitments).toBe(20_000);
  });

  it('versement par transfert depuis un compte courant : compte comme versé', () => {
    const d = space({
      accounts: [cash(100_000), ce()],
      goals: [moto],
      transactions: [tx({ id: 'tr', type: 'transfer', amount: 20_000, accountId: 'cash', toAccountId: 'ce', date: '2026-10-05' })],
      goalContributions: [contribution({ goalId: 'moto', amount: 20_000, accountId: 'cash', transferId: 'tr', date: '2026-10-05' })],
    });
    expect(ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-15' })).commitments).toBe(0);
  });
});

describe('A5 — retards : période en cours et précédente ; plus ancien → « À régulariser »', () => {
  it('E34b — le 2 octobre, loyer du 30 septembre non confirmé : dans E ; celui d’août : à régulariser, hors de E', () => {
    const loyer = rule({ id: 'loyer', amount: 30_000, accountId: 'cash', startDate: '2026-07-30', lastGenerated: '2026-07-30' });
    const d = space({ accounts: [cash(100_000)], recurring: [loyer] });
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-02' }));
    expect(r.items.filter((c) => c.kind === 'recurring').map((c) => c.date)).toEqual(['2026-09-30', '2026-10-30']);
    expect(toRegularize(d, 'XOF', '2026-10-02').map((x) => [x.kind, x.id, x.date])).toEqual([['recurring', 'loyer', '2026-08-30']]);
    expect(recurringToConfirm(d, '2026-10-02').map((c) => c.date)).toEqual(['2026-09-30']);
  });

  it('avec un jour de paie : la période précédente commence à la paie d’avant', () => {
    const loyer = rule({ id: 'loyer', amount: 30_000, accountId: 'cash', startDate: '2026-08-28', lastGenerated: null });
    const d = space({ accounts: [cash(100_000)], recurring: [loyer] });
    // Le 18 octobre, paie le 25 : période en cours depuis le 25 septembre, précédente depuis le 25 août.
    const r = ok(dailyAllowanceV2({ data: d, currency: 'XOF', today: '2026-10-18', payDay: 25 }));
    expect(r.items.map((c) => c.date)).toEqual(['2026-08-28', '2026-09-28']);
    expect(toRegularize(d, 'XOF', '2026-10-18', 25)).toEqual([]);
  });
});

describe('A7 — une dépense liée n’est « intérêts » que si elle est liée à un remboursement de dette', () => {
  it('liée à un remboursement : intérêts ; liée à une dépense ordinaire : dépense ; liée à un transfert : frais', () => {
    const d = space({
      accounts: [cash(), account({ id: 'om' })],
      debts: [debt({ id: 'owe' })],
      transactions: [
        tx({ id: 'cap', type: 'expense', amount: 1_000, accountId: 'cash', debtId: 'owe' }),
        tx({ id: 'buy', type: 'expense', amount: 1_000, accountId: 'cash', categoryId: 'cat_food' }),
        tx({ id: 'tr', type: 'transfer', amount: 1_000, accountId: 'cash', toAccountId: 'om' }),
        tx({ id: 'i1', type: 'expense', amount: 100, accountId: 'cash', linkedTransactionId: 'cap' }),
        tx({ id: 'i2', type: 'expense', amount: 100, accountId: 'cash', linkedTransactionId: 'buy' }),
        tx({ id: 'i3', type: 'expense', amount: 100, accountId: 'cash', linkedTransactionId: 'tr' }),
      ],
    });
    const ctx = natureContext(d);
    expect(d.transactions.slice(3).map((t) => natureOf(t, ctx))).toEqual(['interets', 'depense', 'frais']);
  });
});

describe('A8 — date d’ouverture par défaut : date LOCALE de création', () => {
  it('openingDateOf suit le calendrier local (toISODate), jamais l’heure UTC', () => {
    // Fuseau en avance sur UTC (Afrique de l'Est, Asie) : minuit et demi local = la veille en UTC.
    const tz = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
    const createdAt = new Date(2026, 9, 1, 0, 30).getTime(); // 1er octobre, 0 h 30 heure locale
    expect(openingDateOf({ openingDate: null, createdAt })).toBe('2026-10-01');
    expect(toISODate(new Date(createdAt))).toBe('2026-10-01');
    expect(openingDateOf({ openingDate: '2026-09-15', createdAt })).toBe('2026-09-15');
    process.env.TZ = tz;
  });
});

describe('§5.4 — clôturer : ce qui n’est pas noté est signalé d’abord', () => {
  // 4 membres, 10 000 par mois depuis le 5 juin, mon tour = 2 (cagnotte 40 000 le 5 juillet).
  const t = tontine({ id: 'rot', startDate: '2026-06-05', membersCount: 4, myTurns: [2] });
  it('« 2 cotisations et la cagnotte ne sont pas notées » : périodes 3 et 4, cagnotte du tour 2', () => {
    const entries = [1, 2].map((period) => tentry({ tontineId: 'rot', kind: 'contribution', period, amount: 10_000 }));
    const g = closureGaps(t, entries, '2026-10-15');
    expect([g.contributions.map((s) => s.period), g.payouts.map((s) => s.period)]).toEqual([[3, 4], [2]]);
  });
  it('tout est noté (ou marqué « Pas due ») : rien à signaler', () => {
    const entries = [...[1, 2, 3, 4].map((period) => tentry({ tontineId: 'rot', kind: 'contribution', period, amount: 10_000 })), tentry({ tontineId: 'rot', kind: 'payout', period: 2, amount: 40_000 })];
    expect(closureGaps(t, entries, '2026-10-15')).toEqual({ contributions: [], payouts: [] });
  });
  it('une échéance encore à venir n’est pas « non notée »', () => {
    const g = closureGaps(tontine({ id: 'rot', startDate: '2026-09-05', membersCount: 4, myTurns: [4] }), [], '2026-10-15');
    expect([g.contributions.map((s) => s.period), g.payouts]).toEqual([[1, 2], []]);
  });
});
