/**
 * Correctif « argent mis de côté » (fondateur, 2026-10-14) — le CERCLE FERMÉ :
 * comptes d'épargne, objectifs, tontines et réserve. Cet argent n'est jamais
 * disponible pour les dépenses ; il circule librement dans le cercle ; une
 * dépense n'est jamais prise sur un compte d'épargne (ni par défaut, ni par
 * choix) ; une cotisation de tontine est de l'épargne, pas une dépense.
 *
 * Parcours du fondateur (revenu 100 000) : a) épargne 60 000 tapée à
 * l'inscription ; a') seul « Épargne » coché ; b) revenu sur Espèces puis
 * versement de 60 000 ; c) une dépense « sur l'épargne » puis des dépenses
 * ordinaires. Puis cotisations depuis Espèces, l'épargne, un objectif.
 */
import { describe, expect, it } from 'vitest';
import { starterStructure } from '../src/core/defaults';
import { parseEntryText, type EntryContext } from '../src/core/entry/parse';
import { aiLinesToDrafts } from '../src/core/entry/aiGuard';
import { dailyAllowance } from '../src/core/dailyAllowance';
import { flowTotals, moneyPosition } from '../src/core/balance';
import { buildReport, buildSeries, transactionsToCsv } from '../src/core/reports';
import { envelopeStatuses } from '../src/core/budget';
import { expensesByCategory, monthFlows } from '../src/core/insights';
import { buildFinanceSummary } from '../src/core/ai/summary';
import { categoryDown, savedInMonth } from '../src/core/coach/events';
import { touchedByWrite } from '../src/core/coach/envelopeAlerts';
import { budgetTransactions } from '../src/core/reserve';
import { periodOf } from '../src/core/dates';
import { emptySpaceData, type Account, type Envelope, type Goal, type GoalContribution, type SpaceData, type Transaction } from '../src/core/types';
import { isCircleMovement, isConsumption, isTontineContribution } from '../src/core/savingsFlows';
import { defaultSpendingAccountId, expenseAccountFor, expenseAccountOptions, moneyTracked, planTontinePayment, shortfallAfter, spendingAccounts, withdrawSources } from '../src/core/savingsCircle';
import { financialSnapshot } from '../src/core/intelligence';
import { behaviorScore } from '../src/core/coach/score';
import { computeInsights, detectRecurringPayments, savingsCapacity } from '../src/core/insights';
import { personalBudget } from '../src/core/personalBudget';
import { fr } from '../src/i18n/fr';

const TODAY = '2026-10-14';
const NOW = Date.UTC(2026, 9, 14, 9);
let k = 0;
const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId'>): Transaction => ({ id: `t${++k}`, createdAt: NOW, updatedAt: NOW, createdBy: 'u1', currency: 'XOF', date: TODAY, ...p }) as Transaction;
const TONTINE = { categoryId: 'cat_social', subcategoryId: 'sub_informal_tontine' } as const;

function signup(accounts: string[], balances: Record<string, number> = {}) {
  let i = 0;
  const s = starterStructure(
    { firstName: 'Awa', currency: 'XOF', monthlyIncome: 100_000, incomeFrequency: 'monthly', accounts, openingBalances: balances, mainExpenses: [], goals: [], budgetMethod: 'envelopes', country: 'CI', zone: 'africa' },
    { now: NOW, uid: 'u1', label: (x: string) => (fr as Record<string, string>)[x] ?? x, date: TODAY, id: (p: string) => `${p}${++i}` } as never,
  );
  return { accounts: s.accounts as Account[], categories: s.categories ?? [], recurring: s.recurring ?? [] };
}
const cashOf = (a: Account[]) => a.find((x) => !x.isSavings)!.id;
const savOf = (a: Account[]) => a.find((x) => x.isSavings)!.id;

function home(accounts: Account[], transactions: Transaction[], extra: { goals?: Goal[]; goalContributions?: GoalContribution[]; declared?: number } = {}) {
  const goals = extra.goals ?? [];
  const contributions = extra.goalContributions ?? [];
  const pos = moneyPosition(accounts, transactions, goals, contributions, 'XOF');
  const d = dailyAllowance({ data: { transactions, recurring: [], goals, goalContributions: contributions, accounts }, currency: 'XOF', today: TODAY, financial: { monthlyIncome: extra.declared ?? 100_000 } });
  return { disponible: pos.free, epargne: pos.savings, base: d.status === 'ok' ? d.available : d.status === 'deficit' ? -d.deficit : null, parJour: d.status === 'ok' ? d.perDay : null };
}

/** Compte de chaque façon de saisir « taxi 2000 » (la feuille, la voix avec IA, le formulaire, l'assistant). */
function entryAccounts(accounts: Account[], categories: SpaceData['categories'], last: string | null) {
  const def = defaultSpendingAccountId(accounts, last, 'XOF');
  const ctx: EntryContext = { today: TODAY, currency: 'XOF', accounts, categories, defaultAccountId: def, goals: [] };
  const p = parseEntryText('taxi 2000', ctx);
  const ai = aiLinesToDrafts([{ type: 'expense', amount: 2000, currencyFromSpace: true, categoryId: 'cat_transport', subcategoryId: null, accountName: null, date: null, sourceText: 'taxi 2000', confidence: 0.9, question: null }], 'taxi 2000', ctx);
  return [def, p.kind === 'entries' ? p.items[0].accountId : null, ai[0].accountId];
}

describe('A — aucune dépense ne part de l’épargne par défaut', () => {
  it('a) épargne 60 000 tapée à l’inscription : dépenses sur Espèces ; reste par jour calculé sur 40 000', () => {
    const a = signup(['acc.cash', 'acc.savings'], { 'acc.savings': 60_000 });
    for (const id of entryAccounts(a.accounts, a.categories, null)) expect(id).toBe(cashOf(a.accounts));
    expect(home(a.accounts, [])).toEqual({ disponible: 0, epargne: 60_000, base: 40_000, parJour: 2222 });
  });

  it('a’) seul « Épargne » coché : « Espèces » est créé ; dépenses et salaire de départ sur Espèces', () => {
    const a = signup(['acc.savings'], { 'acc.savings': 60_000 });
    expect(a.accounts.map((x) => [x.type, x.isSavings])).toEqual([
      ['savings', true],
      ['cash', false],
    ]);
    const cash = cashOf(a.accounts);
    for (const id of entryAccounts(a.accounts, a.categories, null)) expect(id).toBe(cash);
    expect(a.recurring[0]?.accountId).toBe(cash);
  });

  it('b) revenu sur Espèces puis versement de 60 000 : disponible 40 000 (inchangé, déjà juste)', () => {
    const b = signup(['acc.cash', 'acc.savings']);
    const txs = [tx({ type: 'income', amount: 100_000, accountId: cashOf(b.accounts), categoryId: 'inc_salary' }), tx({ type: 'transfer', amount: 60_000, accountId: cashOf(b.accounts), toAccountId: savOf(b.accounts) })];
    expect(home(b.accounts, txs)).toEqual({ disponible: 40_000, epargne: 60_000, base: 40_000, parJour: 2222 });
  });

  it('c) « dernier compte utilisé » = épargne : ignoré ; une dépense sur l’épargne est reportée sur un compte courant', () => {
    const c = signup(['acc.cash', 'acc.savings']);
    const cash = cashOf(c.accounts);
    const sav = savOf(c.accounts);
    for (const id of entryAccounts(c.accounts, c.categories, sav)) expect(id).toBe(cash);
    expect(expenseAccountFor({ type: 'expense', accountId: sav, categoryId: 'cat_housing', subcategoryId: null }, c.accounts, cash)).toEqual({ accountId: cash, redirected: true });
    expect(expenseAccountFor({ type: 'income', accountId: sav, categoryId: 'inc_other', subcategoryId: null }, c.accounts, cash)).toEqual({ accountId: sav, redirected: false });
    expect(expenseAccountFor({ type: 'expense', accountId: sav, ...TONTINE }, c.accounts, cash)).toEqual({ accountId: sav, redirected: false });
    const txs = [
      tx({ type: 'income', amount: 100_000, accountId: cash, categoryId: 'inc_salary' }),
      tx({ type: 'transfer', amount: 60_000, accountId: cash, toAccountId: sav }),
      tx({ type: 'expense', amount: 10_000, accountId: cash, categoryId: 'cat_housing' }),
      tx({ type: 'expense', amount: 7000, accountId: cash, categoryId: 'cat_food' }),
    ];
    expect(home(c.accounts, txs)).toEqual({ disponible: 23_000, epargne: 60_000, base: 23_000, parJour: 1277 });
  });

  it('listes de comptes d’une DÉPENSE : jamais d’épargne (Épargne, Investissement, Tontine) ; une ancienne dépense garde son compte affiché', () => {
    const s = signup(['acc.cash', 'acc.wave', 'acc.savings', 'acc.investment', 'acc.tontine']);
    expect(spendingAccounts(s.accounts).map((a) => a.type)).toEqual(['cash', 'mobile_money']);
    expect(expenseAccountOptions(s.accounts).map((a) => a.type)).toEqual(['cash', 'mobile_money']);
    expect(expenseAccountOptions(s.accounts, savOf(s.accounts)).map((a) => a.id)).toContain(savOf(s.accounts));
  });
});

describe('phrases qui nomment l’épargne', () => {
  const s = signup(['acc.cash', 'acc.savings']);
  const ctx: EntryContext = { today: TODAY, currency: 'XOF', accounts: s.accounts, categories: s.categories, defaultAccountId: cashOf(s.accounts), goals: [] };
  it('« loyer 10 000 avec l’épargne » : une DÉPENSE sur le compte courant, avec le message (jamais un versement)', () => {
    for (const phrase of ["loyer 10 000 avec l'épargne", "j'ai payé le loyer 10 000 avec mon épargne", "j'ai pris 10 000 sur l'épargne pour le loyer"]) {
      const r = parseEntryText(phrase, ctx);
      expect(r.kind, phrase).toBe('entries');
      if (r.kind !== 'entries') continue;
      expect(r.items[0]).toMatchObject({ type: 'expense', amount: 10_000, accountId: cashOf(s.accounts), savingsRedirect: true });
    }
  });
  it('« cotisation tontine 30 000 » : le mot « tontine » l’emporte sur « cotisation » (sous-catégorie Tontine)', () => {
    const r = parseEntryText('cotisation tontine 30 000', ctx);
    expect(r.kind === 'entries' && r.items[0].subcategoryId).toBe('sub_informal_tontine');
    const dues = parseEntryText('cotisation association 5 000', ctx);
    expect(dues.kind === 'entries' && isTontineContribution(dues.items[0] as never)).toBe(false);
  });
  it('« cotisation tontine 30 000 avec l’épargne » : cotisation payée depuis l’épargne (mouvement dans le cercle)', () => {
    const r = parseEntryText("cotisation tontine 30 000 avec l'épargne", ctx);
    expect(r.kind).toBe('entries');
    if (r.kind === 'entries') expect(r.items[0]).toMatchObject({ type: 'expense', amount: 30_000, accountId: savOf(s.accounts) });
    if (r.kind === 'entries') expect(isTontineContribution(r.items[0] as Pick<Transaction, 'type' | 'categoryId' | 'subcategoryId'>)).toBe(true);
    if (r.kind === 'entries') expect(r.items[0].savingsRedirect).toBeFalsy();
  });
  it('les vrais versements restent des versements', () => {
    expect(parseEntryText("j'ai épargné 50 000", ctx).kind).toBe('savings');
    expect(parseEntryText("j'ai mis 50 000 de côté", ctx).kind).toBe('savings');
    expect(parseEntryText("j'ai versé 20 000 sur mon épargne", ctx).kind).toBe('savings');
  });
  it('voix avec l’IA : un compte d’épargne nommé pour une dépense → compte courant + message ; pour une cotisation → l’épargne', () => {
    const line = (categoryId: string, subcategoryId: string | null) => ({ type: 'expense' as const, amount: 10_000, currencyFromSpace: true, categoryId, subcategoryId, accountName: 'Compte épargne', date: null, sourceText: "loyer 10 000 avec l'épargne", confidence: 0.9, question: null });
    expect(aiLinesToDrafts([line('cat_housing', null)], "loyer 10 000 avec l'épargne", ctx)[0]).toMatchObject({ accountId: cashOf(s.accounts), savingsRedirect: true });
    expect(aiLinesToDrafts([line('cat_social', 'sub_informal_tontine')], "tontine 10 000 avec l'épargne", ctx)[0].accountId).toBe(savOf(s.accounts));
  });
});

describe('cotisation de tontine : de l’épargne, pas une dépense', () => {
  const s = signup(['acc.cash', 'acc.savings']);
  const cash = cashOf(s.accounts);
  const sav = savOf(s.accounts);
  const income = tx({ type: 'income', amount: 100_000, accountId: cash, categoryId: 'inc_salary' });
  const deposit = tx({ type: 'transfer', amount: 60_000, accountId: cash, toAccountId: sav });
  const goal = (p: Partial<Goal> = {}): Goal => ({ id: 'g1', createdAt: NOW, updatedAt: NOW, createdBy: 'u1', name: 'Moto', icon: '🏍️', color: '#000', currency: 'XOF', targetAmount: 500_000, initialAmount: 0, targetDate: null, monthlyContribution: 20_000, status: 'active', order: 0, ...p }) as Goal;
  const contrib = (p: Partial<GoalContribution>): GoalContribution => ({ id: `gc${++k}`, createdAt: NOW, updatedAt: NOW, createdBy: 'u1', goalId: 'g1', amount: 0, date: '2026-09-02', ...p }) as GoalContribution;

  it('un seul critère (fondateur) : Tontine et Épargne communautaire, oui ; Cotisation, Association, Prêt à un proche, catégorie sans sous-catégorie, non', () => {
    expect(isTontineContribution({ type: 'expense', ...TONTINE })).toBe(true);
    expect(isTontineContribution({ type: 'expense', categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine' })).toBe(true);
    expect(isTontineContribution({ type: 'expense', categoryId: 'cat_informal', subcategoryId: 'sub_informal_community' })).toBe(true);
    for (const sub of ['sub_informal_dues', 'sub_informal_association', 'sub_informal_loan_given', null]) {
      expect(isTontineContribution({ type: 'expense', categoryId: 'cat_social', subcategoryId: sub }), String(sub)).toBe(false);
      expect(isTontineContribution({ type: 'expense', categoryId: 'cat_informal', subcategoryId: sub }), String(sub)).toBe(false);
    }
    expect(isTontineContribution({ type: 'income', categoryId: 'inc_tontine', subcategoryId: null })).toBe(false);
    expect(isCircleMovement({ type: 'expense', categoryId: 'cat_savings', subcategoryId: null })).toBe(true);
    expect(isConsumption({ type: 'expense', ...TONTINE })).toBe(false);
    expect(isConsumption({ type: 'expense', categoryId: 'cat_food', subcategoryId: null })).toBe(true);
  });

  for (const planned of [false, true]) {
    const goals = planned ? [goal()] : [];
    const note = planned ? ' (objectif prévu 20 000 ce mois)' : '';
    it(`depuis Espèces${note} : le reste par jour baisse de 30 000 entiers, jamais fondus dans la mise de côté`, () => {
      const before = home(s.accounts, [income], { goals });
      const after = home(s.accounts, [income, tx({ type: 'expense', amount: 30_000, accountId: cash, ...TONTINE })], { goals });
      expect(before.base! - after.base!).toBe(30_000);
      expect(before.disponible - after.disponible).toBe(30_000);
    });
    it(`depuis l’épargne${note} : disponible et reste par jour inchangés, épargne −30 000`, () => {
      const before = home(s.accounts, [income, deposit], { goals });
      const after = home(s.accounts, [income, deposit, tx({ type: 'expense', amount: 30_000, accountId: sav, ...TONTINE })], { goals });
      expect(after.disponible).toBe(before.disponible);
      expect(after.base).toBe(before.base);
      expect(before.epargne - after.epargne).toBe(30_000);
    });
    it(`depuis un objectif (argent mis de côté sur Espèces)${note} : disponible inchangé, objectif −30 000`, () => {
      const g = goal({ initialAmount: 0 });
      const put = contrib({ amount: 50_000, accountId: cash, transferId: null });
      const plan = planTontinePayment({ source: { kind: 'goal', goalId: 'g1' }, amount: 30_000, accounts: s.accounts, goals: [g], contributions: [put], defaultAccountId: cash });
      expect(plan).toEqual({ accountId: cash, fundingGoalId: 'g1' });
      const pay = tx({ type: 'expense', amount: 30_000, accountId: plan.accountId, ...TONTINE });
      const use = contrib({ amount: -30_000, accountId: cash, linkedTransactionId: pay.id, transferId: null, date: TODAY });
      const before = home(s.accounts, [income], { goals: [g], goalContributions: [put] });
      const after = home(s.accounts, [income, pay], { goals: [g], goalContributions: [put, use] });
      expect(after.disponible).toBe(before.disponible);
      expect(after.base).toBe(before.base);
      expect(moneyPosition(s.accounts, [income, pay], [g], [put, use], 'XOF').allocatedToGoals).toBe(20_000);
    });
  }

  it('depuis un objectif rangé sur un compte d’épargne : payée depuis ce compte, objectif −30 000', () => {
    const g = goal({ accountId: sav });
    const put = contrib({ amount: 50_000, accountId: sav, transferId: 'tr1' });
    expect(planTontinePayment({ source: { kind: 'goal', goalId: 'g1' }, amount: 30_000, accounts: s.accounts, goals: [g], contributions: [put], defaultAccountId: cash })).toEqual({ accountId: sav, fundingGoalId: 'g1' });
  });
  it('objectif sans assez d’argent mis de côté : refusé (jamais un objectif négatif)', () => {
    expect(() => planTontinePayment({ source: { kind: 'goal', goalId: 'g1' }, amount: 30_000, accounts: s.accounts, goals: [goal()], contributions: [contrib({ amount: 10_000 })], defaultAccountId: cash })).toThrow('goal.withdrawTooMuch');
  });
  it('depuis un compte d’épargne ou un compte courant : ce compte, sans objectif', () => {
    expect(planTontinePayment({ source: { kind: 'account', accountId: sav }, amount: 30_000, accounts: s.accounts, goals: [], contributions: [], defaultAccountId: cash })).toEqual({ accountId: sav, fundingGoalId: null });
    expect(planTontinePayment({ source: { kind: 'account', accountId: cash }, amount: 30_000, accounts: s.accounts, goals: [], contributions: [], defaultAccountId: cash })).toEqual({ accountId: cash, fundingGoalId: null });
  });

  it('jamais comptée deux fois avec la cotisation « à venir » du carnet', () => {
    const tontine = { id: 'tn1', createdAt: NOW, updatedAt: NOW, createdBy: 'u1', type: 'rotating', name: 'Marché', organizerName: null, currency: 'XOF', amountPerShare: 30_000, sharesHeld: 1, frequency: 'monthly', customDays: null, startDate: '2026-10-10', membersCount: 4, myTurns: [4], potAmount: null, organizerFee: null, latePenalty: null, cycleDays: null, collectorCommission: null, accountId: cash, status: 'active', linkedRecurringId: null } as unknown as NonNullable<SpaceData['tontines']>[number];
    const run = (transactions: Transaction[], entries: NonNullable<SpaceData['tontineEntries']>) => dailyAllowance({ data: { transactions, recurring: [], goals: [], goalContributions: [], accounts: s.accounts, tontines: [tontine], tontineEntries: entries }, currency: 'XOF', today: TODAY });
    const unpaid = run([income], []);
    const pay = tx({ type: 'expense', amount: 30_000, accountId: cash, ...TONTINE });
    const paid = run([income, pay], [{ id: 'e1', createdAt: NOW, updatedAt: NOW, createdBy: 'u1', tontineId: 'tn1', kind: 'contribution', period: 1, amount: 30_000, date: TODAY, transactionId: pay.id, status: 'done', note: null } as never]);
    expect(unpaid.status === 'ok' && paid.status === 'ok' && unpaid.available).toBe(paid.status === 'ok' ? paid.available : -1);
    expect(paid.status === 'ok' && paid.available).toBe(70_000);
  });

  // ── Chaque calcul utilise le même critère ──
  const env = (p: Partial<Envelope>): Envelope => ({ id: 'e', createdAt: 1, updatedAt: 1, createdBy: 'u1', name: 'Env', icon: 'x', color: '#000', monthlyBudget: 50_000, categoryIds: [], order: 0, active: true, ...p }) as Envelope;
  const food = tx({ type: 'expense', amount: 8000, accountId: cash, categoryId: 'cat_food' });
  const cot = tx({ type: 'expense', amount: 30_000, accountId: cash, ...TONTINE });
  const data: SpaceData = { ...emptySpaceData(), accounts: s.accounts, categories: s.categories, transactions: [income, food, cot], envelopes: [env({ id: 'eSoc', categoryIds: ['cat_social'] }), env({ id: 'eFood', categoryIds: ['cat_food'] })] };
  const month = periodOf('month', TODAY);
  it('dépenses du mois, rapports (ligne « Mis de côté › Tontine »), série, export', () => {
    expect(flowTotals(data.transactions, month, 'XOF').expense).toBe(8000);
    expect(monthFlows(data.transactions, '2026-10', 'XOF').expense).toBe(8000);
    expect(expensesByCategory(data.transactions, '2026-10', 'XOF')).toEqual({ cat_food: 8000 });
    const r = buildReport(data, 'month', TODAY, 'XOF');
    expect([r.expense, r.saved, r.savedTontine, r.byCategory.map((c) => c.categoryId)]).toEqual([8000, 30_000, 30_000, ['cat_food']]);
    expect(buildSeries(data.transactions, month, 'XOF').reduce((n, p) => n + p.expense, 0)).toBe(8000);
    const csv = transactionsToCsv([cot], { accountName: () => 'Cash', categoryName: () => 'Tontine', categories: [], decimals: () => 0, headers: ['d', 't'], typeLabel: (ty) => ty, circleLabel: 'Mis de côté › Tontine' });
    expect(csv.split('\n')[1].split(';')[1]).toBe('Mis de côté › Tontine');
  });
  it('rapports : payée depuis l’épargne, ni dépense ni nouvelle épargne', () => {
    const r = buildReport({ ...data, transactions: [income, deposit, tx({ type: 'expense', amount: 30_000, accountId: sav, ...TONTINE })] }, 'month', TODAY, 'XOF');
    expect([r.expense, r.saved, r.savedTontine]).toEqual([0, 60_000, 0]);
  });
  it('budget : l’enveloppe qui contenait « Tontine » ne la compte plus ; les autres inchangées', () => {
    const st = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, []), [], '2026-10', 'XOF', data.accounts);
    expect(Object.fromEntries(st.map((x) => [x.envelope.id, x.spent]))).toEqual({ eSoc: 0, eFood: 8000 });
    expect(touchedByWrite([cot], data.envelopes).size).toBe(0);
  });
  it('coach : pas une baisse de dépense ; une cotisation depuis le disponible compte comme une épargne du mois', () => {
    expect(savedInMonth({ ...data, transactions: [income, cot] }, '2026-10', 'XOF')).toBe(true);
    expect(savedInMonth({ ...data, transactions: [income, food] }, '2026-10', 'XOF')).toBe(false);
    expect(categoryDown).toBeTypeOf('function');
  });
  it('score : la cotisation ne dépasse aucun budget ; payée depuis le disponible, c’est un mois d’épargne', () => {
    const budgeted = { ...data, envelopes: [env({ id: 'eSoc', categoryIds: ['cat_social'], monthlyBudget: 10_000 })], transactions: [income, cot] };
    const ten = Array.from({ length: 10 }, (_, i) => tx({ type: 'expense', amount: 100, accountId: cash, categoryId: 'cat_food', id: `f${i}` }));
    const sc = behaviorScore({ ...budgeted, transactions: [...budgeted.transactions, ...ten] }, 'XOF', '2026-10');
    expect(sc.components.find((c) => c.id === 'budgets')?.value).toBe(100);
    expect(sc.components.find((c) => c.id === 'savings')?.value).toBe(100);
  });
  it('conseils : aucune alerte d’enveloppe, capacité d’épargne et paiements récurrents sans la cotisation', () => {
    const budgeted = { ...data, envelopes: [env({ id: 'eSoc', categoryIds: ['cat_social'], monthlyBudget: 10_000 })] };
    const ins = computeInsights({ data: budgeted, currency: 'XOF', now: TODAY, categoryName: (_c, id) => id });
    expect(ins.filter((i) => i.kind === 'envelope_threshold')).toEqual([]);
    const months = ['2026-07-05', '2026-08-05', '2026-09-05'];
    const hist = months.flatMap((d) => [tx({ type: 'income', amount: 100_000, accountId: cash, categoryId: 'inc_salary', date: d }), tx({ type: 'expense', amount: 30_000, accountId: cash, ...TONTINE, payee: 'Marché', date: d })]);
    expect(savingsCapacity(hist, TODAY, 'XOF')).toBe(100_000);
    expect(detectRecurringPayments(hist, TODAY, 'XOF')).toEqual([]);
    const pb = personalBudget({ envelopes: budgeted.envelopes, transactions: hist, currency: 'XOF', now: TODAY, income: 100_000, goalNeeds: 0 });
    expect(JSON.stringify(pb)).not.toContain('30000');
  });
  it('résumé envoyé à l’assistant IA et analyse : la cotisation n’est pas une dépense', () => {
    const summary = buildFinanceSummary(data, 'XOF', TODAY, (id) => id);
    expect(summary.month.expense).toBe(8000);
    expect(summary.topCategories.map((c) => c.name)).toEqual(['cat_food']);
    const snap = financialSnapshot({ data, currency: 'XOF', now: TODAY, available: 0 });
    expect(snap.categoryTrends.map((c) => c.categoryId)).not.toContain('cat_social');
  });
});

describe('pas assez d’argent disponible', () => {
  const s = signup(['acc.cash', 'acc.savings']);
  const cash = cashOf(s.accounts);
  it('suivi seulement si la personne a renseigné son argent (solde d’un compte courant, revenu, ou argent reçu sur un compte courant)', () => {
    expect(moneyTracked(s.accounts, [], 'XOF')).toBe(false);
    expect(moneyTracked(s.accounts, [tx({ type: 'expense', amount: 5000, accountId: cash, categoryId: 'cat_food' })], 'XOF')).toBe(false);
    expect(moneyTracked(signup(['acc.cash', 'acc.savings'], { 'acc.savings': 60_000 }).accounts, [], 'XOF')).toBe(false);
    expect(moneyTracked(signup(['acc.cash'], { 'acc.cash': 10_000 }).accounts, [], 'XOF')).toBe(true);
    expect(moneyTracked(s.accounts, [tx({ type: 'income', amount: 1, accountId: cash, categoryId: 'inc_other' })], 'XOF')).toBe(true);
    expect(moneyTracked(s.accounts, [tx({ type: 'transfer', amount: 1, accountId: savOf(s.accounts), toAccountId: cash })], 'XOF')).toBe(true);
    expect(moneyTracked(s.accounts, [tx({ type: 'adjustment', direction: 'in', amount: 1, accountId: cash })], 'XOF')).toBe(true);
  });
  it('message après une dépense : seulement si le disponible devient NÉGATIF (jamais « il manque 0 »)', () => {
    expect(shortfallAfter(10_000, 4000)).toBeNull();
    expect(shortfallAfter(10_000, 10_000)).toBeNull();
    expect(shortfallAfter(10_000, 12_500)).toBe(2500);
    expect(shortfallAfter(-3000, 1000)).toBe(4000);
  });
  it('d’où retirer : comptes d’épargne et objectifs qui ont de l’argent, réserve comprise', () => {
    const sav = savOf(s.accounts);
    const goals = [{ id: 'g1', name: 'Moto', currency: 'XOF', status: 'active', initialAmount: 15_000 }, { id: 'g2', name: 'Vide', currency: 'XOF', status: 'active', initialAmount: 0 }, { id: 'r1', name: 'Réserve', kind: 'reserve', currency: 'XOF', status: 'active', initialAmount: 5000 }] as Goal[];
    const list = withdrawSources({ accounts: s.accounts, balances: { [sav]: 40_000, [cash]: 0 }, goals, contributions: [], currency: 'XOF' });
    expect(list).toEqual([
      { kind: 'account', id: sav, name: s.accounts.find((a) => a.id === sav)!.name, amount: 40_000 },
      { kind: 'goal', id: 'g1', name: 'Moto', amount: 15_000 },
      { kind: 'goal', id: 'r1', name: 'Réserve', amount: 5000 },
    ]);
  });
});
