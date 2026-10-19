/**
 * Corrections de l'audit avant l'APK (docs/audit-avant-apk.md) — un bloc par point, écrit AVANT
 * la correction (rouge, puis vert). Exemples chiffrés du rapport.
 */
import { describe, expect, it } from 'vitest';
import { linkedRemovals } from '../src/core/removal';
import { balancesAt, positionOf, upcomingByAccount } from '../src/core/position';
import { withLedgerView } from '../src/core/nature';
import { answerAsk, intentContext, understand, type ActionIntent } from '../src/core/ai/intent';
import { answerIntent, topicGate, type AnswerCtx } from '../src/core/ai/localAnswers';
import { buildActionCard, runAction, type ActionPort } from '../src/core/ai/actionCard';
import { monthSummary, otherCurrencyFlows } from '../src/core/monthSummary';
import { validateWithdraw } from '../src/core/savings';
import { answerQuestion } from '../src/core/ai/answers';
import { envelopeUpcoming } from '../src/core/budget';
import { expensesByCategory } from '../src/core/insights';
import { latestScore } from '../src/core/coach/score';
import { scoreForMonth } from '../src/core/coachData';
import { netWorth } from '../src/core/networth';
import { ledgerCsv } from '../src/core/ledger';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { account, contribution, debt, envelope, goal, rule, space, tentry, tontine, tx } from './helpers';
import { iaData, TODAY } from './fixtures/ia-data';

const ctxOf = (d: ReturnType<typeof space>, currency: 'XOF' | 'EUR' = 'XOF') => intentContext(d, { today: TODAY, currency });
const actx = (d: ReturnType<typeof space>, over: Partial<AnswerCtx> = {}): AnswerCtx => ({ data: d, currency: 'XOF', now: TODAY, categoryName: (x) => x, spaceKind: 'personal', ...over });
const ask = (d: ReturnType<typeof space>, text: string, over: Partial<AnswerCtx> = {}) => {
  const i = understand(text, ctxOf(d));
  if (i.kind !== 'question') throw new Error(`${text} → ${JSON.stringify(i)}`);
  return answerIntent(i, actx(d, over));
};

describe('B1, B2 — les opérations liées partent avec l’opération supprimée', () => {
  const data = {
    transactions: [{ id: 'tr' }, { id: 'fee', linkedTransactionId: 'tr' }, { id: 'cap' }, { id: 'int', linkedTransactionId: 'cap' }],
    debtPayments: [{ id: 'dp', transactionId: 'cap' }],
    goalContributions: [],
    tontineEntries: [],
  };
  it('B1 — supprimer un transfert retire ses frais', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'tr' }, 'tr')).toContainEqual({ col: 'transactions', id: 'fee' });
  });
  it('B2 — supprimer l’opération du capital retire les intérêts ; supprimer le remboursement aussi', () => {
    expect(linkedRemovals(data, 'transactions', { id: 'cap' }, 'cap')).toContainEqual({ col: 'transactions', id: 'int' });
    const viaPayment = linkedRemovals(data, 'debtPayments', { id: 'dp', transactionId: 'cap' }, 'dp');
    expect(viaPayment).toEqual(expect.arrayContaining([{ col: 'transactions', id: 'cap' }, { col: 'transactions', id: 'int' }]));
  });
});

describe('B3 — l’IA et les comptes dans une autre devise', () => {
  const d = withLedgerView(space({ accounts: [account({ id: 'c', name: 'Espèces', openingBalance: 50_000 }), account({ id: 'eur', name: 'Compte Paris', currency: 'EUR', openingBalance: 125_050 })] }));
  it('le solde d’un compte en euros, dans sa devise', () => {
    expect(ask(d, 'Combien sur mon compte Paris ?')).toMatchObject({ key: 'ia.a.accountBalance', params: { name: 'Compte Paris', amount: 125_050, cur: 'EUR' } });
  });
  it('la liste cite tous les comptes, chacun dans sa devise', () => {
    expect(ask(d, 'Mes comptes ?').bullets).toEqual([
      { key: 'ia.a.accountLine', params: { name: 'Espèces', amount: 50_000, cur: 'XOF' } },
      { key: 'ia.a.accountLine', params: { name: 'Compte Paris', amount: 125_050, cur: 'EUR' } },
    ]);
  });
  it('« Combien j’ai de disponible ? » ajoute une ligne par autre devise (jamais additionnée)', () => {
    expect(ask(d, 'Combien j’ai de disponible ?')).toMatchObject({ params: { available: 50_000 }, bullets: [{ key: 'ia.a.availableOther', params: { available: 125_050, total: 125_050, cur: 'EUR' } }] });
  });
});

describe('B4 — montants à virgule dans les cartes de l’IA (euros)', () => {
  const d = withLedgerView(space({ accounts: [account({ id: 'c', name: 'Compte', currency: 'EUR', openingBalance: 500_000 }), account({ id: 's', name: 'Livret', currency: 'EUR', isSavings: true, type: 'savings' })] }));
  const amountOf = (text: string) => {
    const i = understand(text, ctxOf(d, 'EUR'));
    const inner = i.kind === 'ask' ? i.intent : i;
    return inner.kind === 'action' ? inner.amount : 'pas une action';
  };
  it('« 12,50 » = 12,50 € ; « 1 500,75 » = 1 500,75 € ; « 1,500 » ambigu → surligné', () => {
    expect(amountOf('Mets 12,50 de côté')).toBe(1_250);
    expect(amountOf('Mets 1 500,75 de côté')).toBe(150_075);
    expect(amountOf('Mets 1,500 de côté')).toBeNull();
    expect(amountOf('Mets 20 de côté')).toBe(2_000);
  });
  it('en FCFA, « 50,000 » reste 50 000', () => {
    const x = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 500_000 }), account({ id: 's', isSavings: true, type: 'savings' })] }));
    const i = understand('Put 50,000 aside', ctxOf(x));
    expect(i.kind === 'action' ? i.amount : i.kind === 'ask' ? (i.intent as ActionIntent).amount : null).toBe(50_000);
  });
});

describe('B5 — un seul solde « à aujourd’hui », et « À venir »', () => {
  const d = space({ accounts: [account({ id: 'om', name: 'Orange Money', openingBalance: 100_000 })], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'om', date: '2026-10-28', categoryId: 'cat_housing' })] });
  it('solde affiché 100 000 (comme le total des comptes), à venir −30 000', () => {
    expect(balancesAt(d.accounts, d.transactions, TODAY).om).toBe(positionOf(d, 'XOF', TODAY).totalAccounts);
    expect(upcomingByAccount(d.accounts, d.transactions, TODAY)).toEqual({ om: { amount: -30_000, from: '2026-10-28' } });
  });
  it('retrait d’épargne : contrôlé sur le solde à sa date (un versement futur ne compte pas encore)', () => {
    const x = space({ accounts: [account({ id: 'sav', isSavings: true, type: 'savings', openingBalance: 100_000 }), account({ id: 'c' })], transactions: [tx({ type: 'transfer', amount: 50_000, accountId: 'c', toAccountId: 'sav', date: '2026-10-28' })] });
    expect(validateWithdraw({ savingsAccountId: 'sav', toAccountId: 'c', amount: 120_000, date: TODAY } as never, x as never)).toContain('savings.insufficient');
    expect(validateWithdraw({ savingsAccountId: 'sav', toAccountId: 'c', amount: 100_000, date: TODAY } as never, x as never)).not.toContain('savings.insufficient');
  });
});

describe('B6 — un membre enfant : reste par jour et reste à répartir masqués', () => {
  it('l’IA ne donne ni le reste par jour, ni le reste à répartir à un enfant', () => {
    for (const t of ['per_day', 'until_payday', 'to_allocate'] as const) expect(topicGate(t, { plan: 'family', role: 'child', spaceKind: 'family' }), t).toMatchObject({ key: 'ia.a.childAsk' });
    expect(topicGate('per_day', { plan: 'family', role: 'partner', spaceKind: 'family' })).toBeNull();
  });
});

describe('I1, I2, I5 — le mois : jusqu’à aujourd’hui, à venir, clôtures, autres devises', () => {
  it('I1 — une dépense datée du 28 n’est pas « réglée » le 15 : elle est « à venir »', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'c', date: '2026-10-28', categoryId: 'cat_housing' }), tx({ type: 'income', amount: 200_000, accountId: 'c', date: '2026-10-30', categoryId: 'inc_salary' })] }));
    expect(monthSummary(d, 'XOF', TODAY)).toMatchObject({ income: 0, expense: 0, upcoming: { income: 200_000, expense: 30_000 } });
    expect(ask(d, 'Combien j’ai dépensé ce mois ?').params).toMatchObject({ amount: 0 });
  });
  it('I1 — enveloppe : « dont à venir »', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], envelopes: [envelope({ id: 'e', name: 'Maison', monthlyBudget: 50_000, categoryIds: ['cat_housing'] })], transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'c', date: '2026-10-28', categoryId: 'cat_housing' })] }));
    expect(envelopeUpcoming(d, 'XOF', TODAY)).toEqual({ e: 30_000 });
  });
  it('I2 — frais de clôture d’une tontine : comptés sur l’accueil et dans l’IA comme dans les rapports', () => {
    const t = tontine({ id: 't', startDate: '2026-06-05', membersCount: 3, myTurns: [3], amountPerShare: 10_000, potAmount: 27_000, status: 'finished', closedAt: '2026-10-10' });
    const entries = [1, 2, 3].map((n) => tentry({ tontineId: 't', kind: 'contribution', period: n, amount: 10_000, date: `2026-0${5 + n}-05` }));
    entries.push(tentry({ tontineId: 't', kind: 'payout', period: 3, amount: 27_000, date: '2026-10-05' }));
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], tontines: [t], tontineEntries: entries }));
    expect(monthSummary(d, 'XOF', TODAY).expense).toBe(3_000);
    expect(ask(d, 'Combien j’ai dépensé ce mois ?').params).toMatchObject({ amount: 3_000 });
  });
  it('I5 — une ligne par autre devise (revenus 2 500 €, dépenses 150 €), jamais additionnée', () => {
    const d = withLedgerView(space({
      accounts: [account({ id: 'c', openingBalance: 100_000 }), account({ id: 'eur', name: 'Compte Paris', currency: 'EUR', openingBalance: 200_000 })],
      transactions: [tx({ type: 'expense', amount: 15_000, currency: 'EUR', accountId: 'eur', categoryId: 'cat_family', date: '2026-10-05' }), tx({ type: 'income', amount: 250_000, currency: 'EUR', accountId: 'eur', categoryId: 'inc_salary', date: '2026-10-01' })],
    }));
    const m = monthSummary(d, 'XOF', TODAY);
    expect([m.income, m.expense]).toEqual([0, 0]);
    expect(m.others).toEqual([{ currency: 'EUR', income: 250_000, expense: 15_000 }]);
    // Rapports : la même ligne pour la période affichée.
    expect(otherCurrencyFlows(d, 'XOF', { start: '2026-10-01', end: '2026-10-31' })).toEqual([{ currency: 'EUR', income: 250_000, expense: 15_000 }]);
  });
});

describe('I3 — remboursement d’achat dans le détail par catégorie', () => {
  it('le remboursement apparaît en négatif : le total par catégorie = le total de l’accueil', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], transactions: [tx({ type: 'expense', amount: 20_000, accountId: 'c', categoryId: 'cat_clothing', date: '2026-10-03' }), tx({ type: 'income', amount: 20_000, accountId: 'c', categoryId: 'inc_refund', date: '2026-10-04' })] }));
    const by = expensesByCategory(d.transactions, '2026-10', 'XOF');
    expect(by).toEqual({ cat_clothing: 20_000, inc_refund: -20_000 });
    expect(Object.values(by).reduce((n, v) => n + v, 0)).toBe(monthSummary(d, 'XOF', TODAY).expense);
  });
  it('« Où part mon argent ? » ne désigne jamais la ligne des remboursements', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], transactions: [tx({ type: 'expense', amount: 20_000, accountId: 'c', categoryId: 'cat_clothing', date: '2026-10-03' }), tx({ type: 'expense', amount: 5_000, accountId: 'c', categoryId: 'cat_food', date: '2026-10-03' }), tx({ type: 'income', amount: 20_000, accountId: 'c', categoryId: 'inc_refund', date: '2026-10-04' })] }));
    const a = answerQuestion({ kind: 'question', topic: 'top_category', categoryId: null, amount: null }, { data: d, currency: 'XOF', now: TODAY, categoryName: (x) => x });
    expect(a.bullets?.map((b) => b.params?.name)).toEqual(['cat_clothing', 'cat_food']);
  });
});

describe('I4 — le score de l’écran tient compte du profil (revenus irréguliers)', () => {
  it('écran Score = IA', () => {
    const txs = [tx({ type: 'income', amount: 300_000, accountId: 'c', categoryId: 'inc_business', date: '2026-09-02' })];
    for (let i = 0; i < 12; i++) txs.push(tx({ type: 'expense', amount: 15_000, accountId: 'c', categoryId: i % 2 ? 'cat_food' : 'cat_housing', date: `2026-09-${String(3 + i).padStart(2, '0')}` }));
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 50_000 }), account({ id: 's', isSavings: true, type: 'savings', openingBalance: 500_000 })], transactions: txs }));
    const profile = { incomeNature: 'irregular' as const };
    expect(latestScore(d, 'XOF', TODAY, profile).score).toBe(scoreForMonth(d, 'XOF', '2026-09', profile).score);
  });
});

describe('I6 — IA : transfert entre deux devises', () => {
  const d = space({ accounts: [account({ id: 'om', name: 'Orange Money', openingBalance: 500_000 }), account({ id: 'eur', name: 'Compte Paris', currency: 'EUR' })] });
  const i: ActionIntent = { kind: 'action', action: 'transfer', amount: 100_000, date: TODAY, from: { kind: 'account', id: 'om', label: 'Orange Money' }, to: { kind: 'account', id: 'eur', label: 'Compte Paris' } };
  it('la carte demande le montant reçu', () => {
    expect(buildActionCard(i, { data: d, currency: 'XOF', today: TODAY })).toMatchObject({ needsReceived: 'EUR' });
  });
  it('« Valider » transmet le montant reçu', () => {
    const calls: unknown[] = [];
    const port = { saveTransaction: (draft: unknown) => (calls.push(draft), { id: 'x' }), remove: () => undefined } as unknown as ActionPort;
    runAction({ ...i, toAmount: 15_245 }, port, { data: d, currency: 'XOF', today: TODAY }, []);
    expect(calls[0]).toMatchObject({ type: 'transfer', amount: 100_000, toAmount: 15_245, toAccountId: 'eur' });
  });
});

describe('I7 — le jour de paie du profil fait foi ; un écart avec la récurrence est signalé', () => {
  it('profil le 30, récurrence le 25 → prochaine paie le 30 octobre, écart signalé', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 200_000 })], recurring: [rule({ id: 'sal', type: 'income', label: 'Salaire', amount: 300_000, accountId: 'c', startDate: '2026-01-25' })] }));
    expect(ask(d, 'Prochaine paie ?', { payDay: 30 })).toMatchObject({ key: 'ia.a.nextPaydayDay', params: { date: '2026-10-30' }, bullets: [{ key: 'ia.a.paydayMismatch', params: { name: 'Salaire', day: 25, payDay: 30 } }] });
  });
});

describe('I8 — « C’est quand le loyer ? » cite l’échéance non confirmée', () => {
  it('le loyer du 5 octobre n’est pas confirmé', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c', openingBalance: 200_000 })], recurring: [rule({ id: 'r', type: 'expense', label: 'Loyer', amount: 100_000, accountId: 'c', startDate: '2026-01-05' })] }));
    expect(ask(d, 'C’est quand le loyer ?')).toMatchObject({ key: 'ia.a.recurringLate', params: { name: 'Loyer', late: '2026-10-05', date: '2026-11-05', amount: 100_000 } });
  });
});

describe('C1 — patrimoine : toutes les parts, qui s’additionnent', () => {
  it('biens + comptes + hors comptes + créances − dettes = patrimoine net', () => {
    const d = iaData();
    const a = ask(d, 'Combien vaut mon patrimoine ?', { data: d });
    const p = a.params as Record<string, number>;
    expect(p.assets + p.accounts + p.outside + p.receivables - p.liabilities).toBe(p.net);
    expect(p.net).toBe(netWorth(d, 'XOF', TODAY).net);
  });
});

describe('C2 — export CSV : virgule décimale en français', () => {
  it('« 12,50 » quand l’application est en français', () => {
    const d = space({ accounts: [account({ id: 'c', currency: 'EUR', openingBalance: 0 })], transactions: [tx({ type: 'expense', amount: 1_250, currency: 'EUR', accountId: 'c', date: '2026-10-03', categoryId: 'cat_food' })] });
    const csv = ledgerCsv(d, { headers: ['a'], accountName: () => 'C', categoryName: () => 'X', natureLabel: () => 'N', decimals: () => 2, decimalComma: true });
    expect(csv).toContain(';12,50;');
  });
});

describe('C3 — objectif sans rythme : « date visée », pas « au rythme actuel »', () => {
  it('sans versements réguliers, l’IA cite la date visée', () => {
    const d = withLedgerView(space({ accounts: [account({ id: 'c' })], goals: [goal({ id: 'g', name: 'Ma voiture', targetAmount: 3_000_000, targetDate: '2028-12-31' })] }));
    expect(answerIntent({ kind: 'question', topic: 'goal_eta', ref: { kind: 'goal', id: 'g', label: 'Ma voiture' } }, actx(d))).toMatchObject({ key: 'ia.a.goalTargetDate', params: { date: '2028-12-31' } });
  });
});

describe('C5 — « Koffi m’a prêté 100 000 » quand une dette envers Koffi existe', () => {
  it('une question : nouvelle dette, ou la dette existante', () => {
    const d = space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], debts: [debt({ id: 'd_koffi', counterparty: 'Koffi' })] });
    const i = understand('Koffi m’a prêté 100 000', ctxOf(d));
    expect(i).toMatchObject({ kind: 'ask', field: 'debtMode' });
    if (i.kind === 'ask') {
      expect(i.options.map((o) => o.id)).toEqual(['__new__', 'd_koffi']);
      // « Nouvelle dette » : la carte habituelle ; la dette existante : son écran (rien n'est écrit).
      expect(answerAsk(i, '__new__', ctxOf(d))).toMatchObject({ kind: 'ask', field: 'account', intent: { action: 'debt_create', label: 'Koffi', amount: 100_000 } });
      expect(answerAsk(i, 'd_koffi', ctxOf(d))).toEqual({ kind: 'open', section: 'debts' });
    }
  });
  it('autre personne : aucune question', () => {
    const d = space({ accounts: [account({ id: 'c', openingBalance: 100_000 })], debts: [debt({ id: 'd_koffi', counterparty: 'Koffi' })] });
    expect(understand('Moussa m’a prêté 100 000', ctxOf(d))).toMatchObject({ kind: 'ask', field: 'account', intent: { action: 'debt_create', label: 'Moussa' } });
  });
});

describe('C6 — dépensé en catégorie : la part prise sur la réserve est dite', () => {
  it('« dont 40 000 pris sur la réserve »', () => {
    const d = withLedgerView(space({
      accounts: [account({ id: 'c', openingBalance: 300_000 })],
      goals: [goal({ id: 'r', name: 'Réserve famille', kind: 'reserve', targetAmount: 300_000 })],
      transactions: [tx({ id: 'fun', type: 'expense', amount: 60_000, accountId: 'c', categoryId: 'cat_social', subcategoryId: 'sub_social_funerals', date: '2026-10-08' })],
      goalContributions: [contribution({ goalId: 'r', amount: 100_000, accountId: 'c', date: '2026-09-01' }), contribution({ goalId: 'r', amount: -40_000, accountId: 'c', linkedTransactionId: 'fun', date: '2026-10-08' })],
    }));
    const a = answerIntent({ kind: 'question', topic: 'spent_category', categoryId: 'cat_social', subcategoryId: 'sub_social_funerals', period: 'month' }, actx(d));
    expect(a).toMatchObject({ params: { amount: 60_000 }, bullets: [{ key: 'ia.a.reservePart', params: { amount: 40_000 } }] });
  });
});

describe('Carte « montant d’une enveloppe » : pour tous les mois', () => {
  it('le texte le dit', () => {
    expect(fr['ia.card.envelope']).toContain('tous les mois');
    expect(en['ia.card.envelope']).toContain('every month');
  });
});
