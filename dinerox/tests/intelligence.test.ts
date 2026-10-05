import { describe, expect, it } from 'vitest';
import { financialSnapshot, isFixedExpense, monthlyEquivalent, recommendations } from '../src/core/intelligence';
import { personalBudget } from '../src/core/personalBudget';
import { simulateIndependence } from '../src/core/independence';
import { financialCalendar } from '../src/core/calendar';
import { emptyDraft, toFinancialProfile, toOnboardingAnswers, validateDraft, withCountry, withNoBank } from '../src/core/financialProfile';
import { emptySpaceData, type Debt, type RecurringRule } from '../src/core/types';
import { envelope, goal, tx } from './helpers';

const NOW = '2026-10-15';
const base = { createdAt: 1, updatedAt: 1, createdBy: 'u1' };
const data = () => emptySpaceData();
const rec = (p: Partial<RecurringRule>): RecurringRule => ({ ...base, id: 'r1', type: 'expense', label: 'Loyer', amount: 100_000, currency: 'XOF', accountId: 'a', frequency: 'monthly', startDate: '2026-01-05', active: true, ...p });
const debt = (p: Partial<Debt>): Debt => ({ ...base, id: 'd1', direction: 'i_owe', kind: 'bank', counterparty: 'Banque', principal: 600_000, currency: 'XOF', startDate: '2026-01-01', installment: 50_000, dueDay: 20, status: 'active', ...p });

/** Trois mois complets identiques : revenus 500 000, loyer 200 000, nourriture 100 000, transport 50 000, famille 50 000, autres 50 000. */
function threeMonths() {
  const d = data();
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    d.transactions.push(
      tx({ type: 'income', amount: 500_000, accountId: 'a', date: `${m}-01`, categoryId: 'inc_salary' }),
      tx({ type: 'expense', amount: 200_000, accountId: 'a', date: `${m}-03`, categoryId: 'cat_housing', subcategoryId: 'sub_housing_rent' }),
      tx({ type: 'expense', amount: 100_000, accountId: 'a', date: `${m}-10`, categoryId: 'cat_food' }),
      tx({ type: 'expense', amount: 50_000, accountId: 'a', date: `${m}-12`, categoryId: 'cat_transport' }),
      tx({ type: 'expense', amount: 50_000, accountId: 'a', date: `${m}-14`, categoryId: 'cat_family' }),
      tx({ type: 'expense', amount: 50_000, accountId: 'a', date: `${m}-20`, categoryId: 'cat_other' }),
      // Un transfert entre ses propres comptes n'est pas une dépense.
      tx({ type: 'transfer', amount: 70_000, accountId: 'a', toAccountId: 'b', date: `${m}-21` }),
    );
  }
  return d;
}

describe("moteur d'intelligence financière", () => {
  it('capacité d’épargne de l’exemple : 500 000 − 450 000 = 50 000 (données utilisateur)', () => {
    const s = financialSnapshot({ data: threeMonths(), currency: 'XOF', now: NOW, available: 300_000 });
    expect(s.income).toEqual({ value: 500_000, source: 'user' });
    expect(s.expenses.value).toBe(450_000);
    expect(s.savingsCapacity).toEqual({ value: 50_000, source: 'user' });
    expect(s.monthsOfData).toBe(3);
  });
  it('charges fixes et leur part dans les revenus (loyer = 40 %)', () => {
    const s = financialSnapshot({ data: threeMonths(), currency: 'XOF', now: NOW, available: 0 });
    expect(s.fixedCharges.value).toBe(200_000);
    expect(s.fixedRatio).toBe(40);
    expect(s.variableSpending.value).toBe(250_000);
  });
  it('transfert interne : jamais compté comme dépense', () => {
    const d = data();
    d.transactions.push(tx({ type: 'transfer', amount: 70_000, accountId: 'a', toAccountId: 'b', date: '2026-09-02' }));
    const s = financialSnapshot({ data: d, currency: 'XOF', now: NOW, available: 0 });
    expect(s.expenses.value).toBe(0);
  });
  it('sans opérations : estimation à partir du profil déclaré', () => {
    const s = financialSnapshot({ data: data(), currency: 'XOF', now: NOW, available: 0, financial: { monthlyIncome: 300_000, fixedCharges: { sub_housing_rent: 100_000 } } });
    expect(s.income).toEqual({ value: 300_000, source: 'declared' });
    expect(s.fixedCharges).toEqual({ value: 100_000, source: 'declared' });
    expect(s.savingsCapacity).toEqual({ value: 200_000, source: 'estimate' });
  });
  it('hausse inhabituelle d’une catégorie (+32 % en alimentation)', () => {
    const d = threeMonths();
    d.transactions.push(tx({ type: 'expense', amount: 132_000, accountId: 'a', date: '2026-10-05', categoryId: 'cat_food' }));
    const s = financialSnapshot({ data: d, currency: 'XOF', now: NOW, available: 0 });
    const r = recommendations(s, []);
    const spike = r.find((x) => x.kind === 'category_spike')!;
    expect(spike.params).toMatchObject({ categoryId: 'cat_food', percent: 32 });
    expect(spike.source).toBe('user');
  });
  it('risque de solde insuffisant : sorties prévues > disponible', () => {
    const d = data();
    d.recurring.push(rec({ startDate: '2026-10-20' }));
    d.debts.push(debt({}));
    d.transactions.push(tx({ type: 'income', amount: 20_000, accountId: 'a', date: '2026-10-01' }));
    const s = financialSnapshot({ data: d, currency: 'XOF', now: NOW, available: 60_000 });
    expect(s.upcomingOutflows).toBe(150_000);
    expect(recommendations(s, []).some((x) => x.kind === 'low_balance_risk')).toBe(true);
  });
  it('objectifs non finançables avec la capacité actuelle', () => {
    const d = threeMonths();
    d.goals.push(goal({ targetAmount: 1_200_000, targetDate: '2027-08-15' }));
    const s = financialSnapshot({ data: d, currency: 'XOF', now: NOW, available: 0 });
    expect(s.goalNeeds).toBeGreaterThan(50_000);
    expect(recommendations(s, d.goals).find((x) => x.kind === 'goals_underfunded')).toBeTruthy();
  });
  it('aucune donnée : invitation à saisir, aucune estimation inventée', () => {
    const s = financialSnapshot({ data: data(), currency: 'XOF', now: NOW, available: 0 });
    expect(recommendations(s, []).map((r) => r.kind)).toEqual(['no_data']);
  });
  it('équivalents mensuels et charges fixes', () => {
    expect(monthlyEquivalent({ amount: 10_000, frequency: 'weekly' })).toBe(43_333);
    expect(monthlyEquivalent({ amount: 120_000, frequency: 'yearly' })).toBe(10_000);
    expect(isFixedExpense({ categoryId: 'cat_food', subcategoryId: null, recurringId: null }, [])).toBe(false);
    expect(isFixedExpense({ categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine', recurringId: null }, [])).toBe(true);
  });
});

describe('budget personnalisé', () => {
  it('base = dépenses réelles ; épargne = effort des objectifs ; réduit seulement le variable', () => {
    const d = threeMonths();
    const envs = [
      envelope({ id: 'home', categoryIds: ['cat_housing'], monthlyBudget: 150_000 }),
      envelope({ id: 'food', categoryIds: ['cat_food'], monthlyBudget: 60_000 }),
      envelope({ id: 'sav', categoryIds: ['cat_savings'], monthlyBudget: 0 }),
    ];
    const b = personalBudget({ envelopes: envs, transactions: d.transactions, currency: 'XOF', now: NOW, income: 500_000, goalNeeds: 90_000 });
    expect(b.lines.find((l) => l.envelopeId === 'home')).toMatchObject({ suggested: 200_000, basis: 'observed', fixed: true });
    expect(b.lines.find((l) => l.envelopeId === 'food')).toMatchObject({ suggested: 100_000, basis: 'observed' });
    expect(b.lines.find((l) => l.envelopeId === 'sav')).toMatchObject({ suggested: 90_000, basis: 'goals' });
    const tight = personalBudget({ envelopes: envs, transactions: d.transactions, currency: 'XOF', now: NOW, income: 250_000, goalNeeds: 90_000 });
    expect(tight.adjusted).toBe(true);
    expect(tight.lines.find((l) => l.envelopeId === 'home')!.suggested).toBe(200_000);
    expect(tight.total).toBeLessThanOrEqual(250_000);
  });
  it('sans historique : charges déclarées', () => {
    const b = personalBudget({ envelopes: [envelope({ id: 'home', categoryIds: ['cat_housing'] })], transactions: [], currency: 'XOF', now: NOW, income: 0, goalNeeds: 0, financial: { fixedCharges: { sub_housing_rent: 85_000 } } });
    expect(b.lines[0]).toMatchObject({ suggested: 85_000, basis: 'declared' });
  });
});

describe('indépendance financière (simulation)', () => {
  it('capital visé = dépenses annuelles ÷ taux de retrait', () => {
    const r = simulateIndependence({ monthlyExpenses: 300_000, monthlySavings: 100_000, currentCapital: 0, annualReturnPct: 0, withdrawalRatePct: 4 });
    expect(r.target).toBe(90_000_000);
    // Sans rendement : 90 000 000 / 100 000 = 900 mois = 75 ans > horizon de 60 ans.
    expect(r.years).toBeNull();
  });
  it('rendement et capital de départ réduisent la durée', () => {
    const a = simulateIndependence({ monthlyExpenses: 300_000, monthlySavings: 200_000, currentCapital: 5_000_000, annualReturnPct: 5, withdrawalRatePct: 4 });
    const b = simulateIndependence({ monthlyExpenses: 300_000, monthlySavings: 200_000, currentCapital: 0, annualReturnPct: 5, withdrawalRatePct: 4 });
    expect(a.years).not.toBeNull();
    expect(a.years!).toBeLessThan(b.years!);
    expect(a.passiveIncomeToday).toBe(16_667);
  });
  it('déjà atteint', () => {
    expect(simulateIndependence({ monthlyExpenses: 1000, monthlySavings: 0, currentCapital: 1_000_000, annualReturnPct: 0, withdrawalRatePct: 4 }).years).toBe(0);
  });
});

describe('calendrier financier', () => {
  it('loyer, tontine, échéance de dette et date d’objectif dans les 60 jours, triés', () => {
    const d = data();
    d.recurring.push(rec({ id: 'rent', startDate: '2026-01-05' }), rec({ id: 'ton', label: 'Tontine', amount: 20_000, frequency: 'weekly', startDate: '2026-10-17', categoryId: 'cat_informal' }));
    d.debts.push(debt({}));
    d.goals.push(goal({ id: 'g', name: 'Moto', targetAmount: 500_000, targetDate: '2026-11-30' }));
    const ev = financialCalendar(d, NOW, 60);
    expect(ev[0].date >= NOW).toBe(true);
    expect(ev.filter((e) => e.kind === 'expense').map((e) => e.date)).toEqual(['2026-11-05', '2026-12-05']);
    expect(ev.filter((e) => e.kind === 'tontine').length).toBeGreaterThanOrEqual(8);
    expect(ev.find((e) => e.kind === 'debt')).toMatchObject({ amount: 50_000 });
    expect(ev.find((e) => e.kind === 'goal')).toMatchObject({ date: '2026-11-30', amount: 500_000 });
    expect([...ev].sort((a, b) => a.date.localeCompare(b.date)).map((e) => e.id)).toEqual(ev.map((e) => e.id));
  });
});

describe('profil financier : rien de bloquant', () => {
  it('un brouillon vide est valide (pays et devise préremplis)', () => {
    expect(validateDraft(emptyDraft())).toEqual([]);
    expect(validateDraft(emptyDraft('FR'))).toEqual([]);
  });
  it('aucune source cochée : un compte Espèces ; aucun revenu : rien d’inventé', () => {
    const d = { ...emptyDraft('SN'), incomeNature: 'none' as const, monthlyIncome: 120_000 };
    const a = toOnboardingAnswers(d, 'Moussa');
    expect(a.accounts).toEqual(['acc.cash']);
    expect(a.monthlyIncome).toBe(0);
    expect(toFinancialProfile(d, 1).monthlyIncome).toBeNull();
  });
  it('« pas de compte bancaire » retire banque et carte, garde le Mobile Money', () => {
    const d = withNoBank({ ...emptyDraft('CI'), paymentMethods: ['acc.cash', 'acc.bank', 'acc.orange'] }, true);
    expect(d.paymentMethods).toEqual(['acc.cash', 'acc.orange']);
  });
  it('changer de pays : la devise suit, sauf choix explicite ; les moyens inexistants sont retirés', () => {
    const d = { ...emptyDraft('SN'), paymentMethods: ['acc.cash', 'acc.wave'] };
    expect(withCountry(d, 'FR', false)).toMatchObject({ currency: 'EUR', paymentMethods: ['acc.cash'] });
    expect(withCountry({ ...d, currency: 'EUR' }, 'BJ', true).currency).toBe('EUR');
  });
  it('jour de paie demandé seulement pour un revenu fixe ; montants inconnus = 0', () => {
    const d = { ...emptyDraft(), incomeNature: 'irregular' as const, payDay: 25, charges: { sub_housing_rent: null, sub_informal_tontine: 10_000 } };
    const p = toFinancialProfile(d, 1);
    expect(p.payDay).toBeNull();
    expect(p.fixedCharges).toEqual({ sub_housing_rent: 0, sub_informal_tontine: 10_000 });
    expect(toOnboardingAnswers(d, 'A').fixedCharges).toEqual({ sub_informal_tontine: 10_000 });
  });
});
