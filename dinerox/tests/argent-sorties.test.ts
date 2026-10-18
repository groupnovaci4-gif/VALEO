/**
 * Argent disponible v2 (docs/argent-disponible.md) — §6 contrôle de toute sortie
 * d'argent et feuille de complément, §5.2-5.3 utilisation d'une poche. Exemples du §14.
 */
import { describe, expect, it } from 'vitest';
import { canDebit, complementDrafts, pocketClosure, reserveCover, spendPlan, type SpendSource } from '../src/core/spendPlan';
import { positionOf } from '../src/core/position';
import { accountBalances } from '../src/core/balance';
import { account, contribution, goal, space, tx } from './helpers';
import type { SpaceData } from '../src/core/types';

const TODAY = '2026-10-15';
const cash = (opening = 0) => account({ id: 'cash', name: 'Espèces', openingBalance: opening, order: 0 });
const om = (opening = 0) => account({ id: 'om', name: 'Orange Money', type: 'mobile_money', openingBalance: opening, order: 1 });
const ce = (opening = 0) => account({ id: 'ce', name: 'Épargne', type: 'savings', isSavings: true, openingBalance: opening, order: 2 });

/** Applique les écritures proposées (comme le ferait le lot atomique de l'étape 2). */
function apply(d: SpaceData, drafts: ReturnType<typeof complementDrafts>, extra: Parameters<typeof tx>[0][] = []): SpaceData {
  return {
    ...d,
    transactions: [...d.transactions, ...drafts.transactions.map((t) => tx(t)), ...extra.map((t) => tx(t))],
    goalContributions: [...d.goalContributions, ...drafts.contributions.map((c) => contribution(c))],
  };
}
const kinds = (s: SpendSource[]) => s.map((x) => ('goalId' in x ? `${x.kind}:${x.goalId}` : 'accountId' in x ? `${x.kind}:${x.accountId}` : x.kind));

describe('§6.2 — aucun argent renseigné', () => {
  it('E1 — compte neuf, aucune somme, dépense de 5 000 : refusée avant de créer « Espèces »', () => {
    expect(spendPlan({ data: space(), currency: 'XOF', today: TODAY, lines: [{ accountId: null, amount: 5_000, date: TODAY }] }).status).toBe('no_money');
    expect(spendPlan({ data: space({ accounts: [cash()] }), currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 5_000, date: TODAY }] }).status).toBe('no_money');
  });
});

describe('§6.1 — une seule fonction de contrôle', () => {
  it('assez d’argent : accepté', () => {
    expect(spendPlan({ data: space({ accounts: [cash(100_000)] }), currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 100_000, date: TODAY }] }).status).toBe('ok');
  });

  it('opération antidatée : le solde à SA date compte (pas de trou dans le passé)', () => {
    const d = space({ accounts: [cash()], transactions: [tx({ type: 'income', amount: 50_000, accountId: 'cash', date: '2026-10-10' })] });
    expect(canDebit(d, { accountId: 'cash', amount: 30_000, date: '2026-10-05' }, 'XOF', TODAY)).toEqual({ ok: false, missing: 30_000 });
    expect(canDebit(d, { accountId: 'cash', amount: 30_000, date: '2026-10-12' }, 'XOF', TODAY)).toEqual({ ok: true, missing: 0 });
  });

  it('chaque date suivante compte : une dépense future déjà saisie réduit ce qu’on peut sortir aujourd’hui', () => {
    const d = space({ accounts: [cash(50_000)], transactions: [tx({ type: 'expense', amount: 20_000, accountId: 'cash', date: '2026-10-20' })] });
    expect(canDebit(d, { accountId: 'cash', amount: 40_000, date: TODAY }, 'XOF', TODAY)).toEqual({ ok: false, missing: 10_000 });
  });

  it('E12 — « taxi 30 000 et marché 20 000 » avec Espèces 40 000 : il manque 10 000 sur le cumul, avant « Tout valider »', () => {
    const r = spendPlan({ data: space({ accounts: [cash(40_000)] }), currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 30_000, date: TODAY }, { accountId: 'cash', amount: 20_000, date: TODAY }] });
    expect(r.status).toBe('insufficient');
    expect(r.status !== 'ok' && r.status !== 'no_money' && r.shortfalls.map((s) => [s.accountId, s.missing])).toEqual([['cash', 10_000]]);
  });

  it('E40 — Espèces à −20 000 après deux téléphones : une dépense de 5 000 doit couvrir le déficit (il manque 25 000)', () => {
    const d = space({ accounts: [cash(40_000)], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'cash' }), tx({ type: 'expense', amount: 30_000, accountId: 'cash' })] });
    expect(canDebit(d, { accountId: 'cash', amount: 5_000, date: TODAY }, 'XOF', TODAY)).toEqual({ ok: false, missing: 25_000 });
  });

  it('E42 — découvert de 300 €, solde 100 € : 350 € accepté ; 450 € : il manque 50 €', () => {
    const bank = account({ id: 'bank', type: 'bank', currency: 'EUR', openingBalance: 10_000, overdraftLimit: 30_000 });
    const d = space({ accounts: [bank] });
    expect(canDebit(d, { accountId: 'bank', amount: 35_000, date: TODAY }, 'EUR', TODAY)).toEqual({ ok: true, missing: 0 });
    expect(canDebit(d, { accountId: 'bank', amount: 45_000, date: TODAY }, 'EUR', TODAY)).toEqual({ ok: false, missing: 5_000 });
  });

  it('modification : seule la différence est contrôlée', () => {
    const d = space({ accounts: [cash(10_000)], transactions: [tx({ id: 'e', type: 'expense', amount: 10_000, accountId: 'cash', date: TODAY })] });
    expect(spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 12_000, date: TODAY, replaces: 'e' }] }).status).toBe('insufficient');
    expect(spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 8_000, date: TODAY, replaces: 'e' }] }).status).toBe('ok');
  });
});

describe('§6.3 — feuille de complément : sources dans l’ordre, seulement celles qui suffisent seules', () => {
  it('E5 — Espèces 40 000, CE 60 000, dépense 50 000 : « Prendre sur l’épargne » ; retrait 10 000 + dépense en un lot ; aucun négatif', () => {
    const d = space({ accounts: [cash(100_000), ce()], transactions: [tx({ type: 'transfer', amount: 60_000, accountId: 'cash', toAccountId: 'ce', date: '2026-10-10' })] });
    const r = spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 50_000, date: TODAY }] });
    expect(r.status).toBe('short');
    if (r.status !== 'short') return;
    const [s] = r.shortfalls;
    expect(s.missing).toBe(10_000);
    expect(kinds(s.sources)).toEqual(['savings:ce', 'received']);
    const after = apply(d, complementDrafts(s.sources[0], 10_000, 'cash', TODAY), [{ type: 'expense', amount: 50_000, accountId: 'cash', date: TODAY }]);
    const b = accountBalances(after.accounts, after.transactions);
    expect([b.cash, b.ce]).toEqual([0, 50_000]);
  });

  it('E6 — « Annuler » : le contrôle n’écrit rien (Espèces 40 000, CE 60 000)', () => {
    const d = space({ accounts: [cash(100_000), ce()], transactions: [tx({ type: 'transfer', amount: 60_000, accountId: 'cash', toAccountId: 'ce', date: '2026-10-10' })] });
    const copy = JSON.parse(JSON.stringify(d));
    spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 50_000, date: TODAY }] });
    expect(d).toEqual(copy);
    const b = accountBalances(d.accounts, d.transactions);
    expect([b.cash, b.ce]).toEqual([40_000, 60_000]);
  });

  it('E7 — Espèces 0, Orange Money 40 000, dépense de 5 000 en Espèces : premier choix « Prendre sur Orange Money »', () => {
    const d = space({ accounts: [cash(), om(40_000)] });
    const r = spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 5_000, date: TODAY }] });
    expect(r.status === 'short' && kinds(r.shortfalls[0].sources)[0]).toBe('account:om');
    if (r.status !== 'short') return;
    const after = apply(d, complementDrafts(r.shortfalls[0].sources[0], 5_000, 'cash', TODAY), [{ type: 'expense', amount: 5_000, accountId: 'cash', date: TODAY }]);
    const b = accountBalances(after.accounts, after.transactions);
    expect([b.om, b.cash]).toEqual([35_000, 0]);
  });

  it('E14 — Moto mise de côté sur Espèces, dépense de 80 000 : premier choix « Prendre sur la Moto », sans transfert ; Espèces 20 000, Moto 20 000, D 0', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 30_000, accountId: 'cash' })] });
    const r = spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 80_000, date: TODAY }] });
    expect(r.status === 'short' && r.shortfalls[0].missing).toBe(10_000);
    if (r.status !== 'short') return;
    expect(kinds(r.shortfalls[0].sources)[0]).toBe('set_aside:moto');
    const drafts = complementDrafts(r.shortfalls[0].sources[0], 10_000, 'cash', TODAY);
    expect(drafts.transactions).toEqual([]);
    const after = apply(d, drafts, [{ type: 'expense', amount: 80_000, accountId: 'cash', date: TODAY }]);
    const p = positionOf(after, 'XOF', TODAY);
    expect([p.accounts.cash.balance, p.accounts.cash.setAside, p.available]).toEqual([20_000, 20_000, 0]);
  });

  it('mise de côté (versement, contribution, cotisation) : jamais de choix 1 ni 3 (on ne puise pas dans l’épargne pour la remettre en épargne)', () => {
    const d = space({ accounts: [cash(10_000), om(50_000), ce(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 10_000, accountId: 'cash' })] });
    const r = spendPlan({ data: d, currency: 'XOF', today: TODAY, purpose: 'set_aside', lines: [{ accountId: 'cash', amount: 20_000, date: TODAY }] });
    expect(r.status === 'short' && kinds(r.shortfalls[0].sources)).toEqual(['account:om', 'received']);
  });

  it('rien ne suffit seul : « Vous n’avez pas assez d’argent » (seul « J’ai reçu de l’argent » reste proposé)', () => {
    const r = spendPlan({ data: space({ accounts: [cash(1_000), om(1_000)] }), currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 50_000, date: TODAY }] });
    expect(r.status).toBe('insufficient');
    expect(r.status === 'insufficient' && kinds(r.shortfalls[0].sources)).toEqual(['received']);
  });
});

describe('§5.3 — la réserve paie avec l’argent qui y est', () => {
  it('E17 — réserve de 50 000 sur un CE, funérailles de 70 000 payées en Espèces (30 000) : Espèces 10 000, CE 0, réserve 0', () => {
    const d = space({
      accounts: [cash(30_000), ce(50_000)],
      goals: [goal({ id: 'res', kind: 'reserve', categoryId: 'family', targetAmount: 200_000, accountId: 'ce' })],
      goalContributions: [contribution({ goalId: 'res', amount: 50_000, accountId: 'ce' })],
    });
    const cover = reserveCover(d, 'res', 70_000, 'cash', 'XOF');
    expect(cover).toEqual({ savings: [{ accountId: 'ce', amount: 50_000 }], sameAccount: 0, otherAccounts: [], covered: 50_000, uncovered: 20_000 });
    expect(spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 70_000, date: TODAY, reserveId: 'res' }] }).status).toBe('ok');
    const after = apply(d, complementDrafts({ kind: 'goal', goalId: 'res', accountId: 'ce', free: 50_000 }, 50_000, 'cash', TODAY), [{ type: 'expense', amount: 70_000, accountId: 'cash', date: TODAY }]);
    const p = positionOf(after, 'XOF', TODAY);
    expect([p.accounts.cash.balance, p.accounts.ce.balance, p.accounts.ce.assigned]).toEqual([10_000, 0, 0]);
  });

  it('E17b — réserve de 50 000 « hors comptes », CE à 0, funérailles de 20 000 : la réserve ne paie rien, le §6 s’applique', () => {
    const d = space({ accounts: [cash(10_000), ce()], goals: [goal({ id: 'res', kind: 'reserve', categoryId: 'family', targetAmount: 200_000, initialAmount: 50_000, initialSource: 'outside' })] });
    expect(reserveCover(d, 'res', 20_000, 'cash', 'XOF').covered).toBe(0);
    const r = spendPlan({ data: d, currency: 'XOF', today: TODAY, lines: [{ accountId: 'cash', amount: 20_000, date: TODAY, reserveId: 'res' }] });
    expect(r.status !== 'ok' && r.status !== 'no_money' && r.shortfalls[0].missing).toBe(10_000);
  });
});

describe('§6.5 — espace famille', () => {
  it('E41 — enfant, dépense supérieure au disponible du compte : un seul choix, « Demander à un parent »', () => {
    const d = space({ accounts: [cash(5_000), om(100_000)] });
    expect(spendPlan({ data: d, currency: 'XOF', today: TODAY, role: 'child', lines: [{ accountId: 'cash', amount: 20_000, date: TODAY }] }).status).toBe('ask_parent');
    expect(spendPlan({ data: space({ accounts: [cash()] }), currency: 'XOF', today: TODAY, role: 'child', lines: [{ accountId: 'cash', amount: 20_000, date: TODAY }] }).status).toBe('no_money');
  });
});

describe('§5.1 — fermeture d’une poche', () => {
  it('E24 — objectif mis de côté de 300 000, « Archiver » : destination demandée ; « Remettre dans mon disponible » : D +300 000', () => {
    const d = space({ accounts: [cash(400_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 300_000, accountId: 'cash' })] });
    const c = pocketClosure(d, 'moto', 'XOF');
    expect([c.amount, c.needsDestination]).toEqual([300_000, true]);
    const before = positionOf(d, 'XOF', TODAY).available;
    const after = apply(d, c.drafts('available', TODAY));
    expect(positionOf(after, 'XOF', TODAY).available - before).toBe(300_000);
    expect(pocketClosure(after, 'moto', 'XOF').needsDestination).toBe(false);
  });
});
