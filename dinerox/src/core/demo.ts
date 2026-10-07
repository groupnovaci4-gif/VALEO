/**
 * Données de démonstration (mode développement). Générées dans un espace
 * « Démo » séparé et local : jamais mélangées aux données réelles.
 * Scénario de référence : revenu 450 000, logement 100 000, nourriture
 * 80 000, transport 40 000, famille 50 000, objectif Moto 1 200 000.
 * Réserve famille et cérémonies : 25 000 par mois, plafond 300 000, une
 * cérémonie du mois dernier prise dessus.
 */
import type { Account, Envelope, Goal, GoalContribution, SpaceData, Transaction } from './types';
import { addMonths, lastMonths, type ISODate } from './dates';
import { systemCategories } from './defaults';

export function buildDemoData(meta: { now: number; uid: string; today: ISODate; label: (k: string) => string }): SpaceData {
  const base = { createdAt: meta.now, updatedAt: meta.now, createdBy: meta.uid };
  const acc = (id: string, name: string, type: Account['type'], provider: Account['provider'], opening: number, color: string, icon: string, isSavings = false, order = 0): Account => ({
    ...base, id, name, type, provider, currency: 'XOF', openingBalance: opening, color, icon, active: true, isSavings, order,
  });
  const accounts = [
    acc('demo_cash', meta.label('acc.cash'), 'cash', 'none', 25_000, '#16A34A', 'cash', false, 0),
    acc('demo_om', meta.label('acc.orange'), 'mobile_money', 'orange_money', 40_000, '#F97316', 'phone-portrait', false, 1),
    acc('demo_bank', meta.label('acc.bank'), 'bank', 'bank', 60_000, '#334155', 'business', false, 2),
    acc('demo_sav', meta.label('acc.savings'), 'savings', 'none', 300_000, '#16A34A', 'wallet', true, 3),
  ];
  const env = (id: string, key: string, budget: number, cats: string[], icon: string, color: string, order: number): Envelope => ({
    ...base, id, name: meta.label(key), icon, color, monthlyBudget: budget, categoryIds: cats, order, active: true,
  });
  const envelopes = [
    env('demo_env_home', 'env.housing', 100_000, ['cat_housing', 'cat_internet'], 'home', '#6366F1', 0),
    env('demo_env_food', 'env.food', 80_000, ['cat_food'], 'restaurant', '#F59E0B', 1),
    env('demo_env_tr', 'env.transport', 40_000, ['cat_transport'], 'car', '#0EA5E9', 2),
    env('demo_env_fam', 'env.family', 50_000, ['cat_family', 'cat_health', 'cat_education'], 'heart', '#EC4899', 3),
    env('demo_env_sav', 'env.savings', 50_000, ['cat_savings'], 'wallet', '#16A34A', 4),
    env('demo_env_free', 'env.free', 100_000, ['cat_leisure', 'cat_clothing', 'cat_communication', 'cat_other'], 'sparkles', '#94A3B8', 5),
  ];
  const transactions: Transaction[] = [];
  let n = 0;
  const t = (date: ISODate, type: Transaction['type'], amount: number, accountId: string, categoryId: string | null, payee: string | null, extra: Partial<Transaction> = {}) =>
    transactions.push({ ...base, id: `demo_tx_${++n}`, type, amount, currency: 'XOF', date, accountId, categoryId, payee, ...extra });
  const months = lastMonths(3, meta.today);
  months.forEach((m, i) => {
    const d = (day: number) => `${m}-${String(day).padStart(2, '0')}`;
    const isCurrent = i === months.length - 1;
    const day = Number(meta.today.slice(8, 10));
    const ok = (dd: number) => !isCurrent || dd <= day;
    if (ok(1)) t(d(1), 'income', 450_000, 'demo_bank', 'inc_salary', 'Salaire');
    if (ok(2)) t(d(2), 'expense', 100_000, 'demo_bank', 'cat_housing', 'Loyer');
    if (ok(3)) t(d(3), 'transfer', 150_000, 'demo_bank', null, null, { toAccountId: 'demo_om' });
    if (ok(4)) t(d(4), 'expense', 25_000, 'demo_om', 'cat_housing', 'CIE');
    if (ok(5)) t(d(5), 'expense', 30_000 + i * 6_000, 'demo_om', 'cat_food', 'Marché');
    if (ok(8)) t(d(8), 'expense', 15_000, 'demo_om', 'cat_internet', 'Internet');
    if (ok(10)) t(d(10), 'expense', 50_000, 'demo_om', 'cat_family', 'Maman');
    if (ok(12)) t(d(12), 'expense', 28_000 + i * 2_500, 'demo_cash', 'cat_transport', 'Taxi');
    if (ok(15)) t(d(15), 'expense', 35_000 + i * 8_000, 'demo_cash', 'cat_food', 'Restaurant');
    if (ok(18)) t(d(18), 'expense', 10_000, 'demo_om', 'cat_leisure', 'Canal+');
    if (ok(20)) t(d(20), 'transfer', 50_000, 'demo_bank', null, 'Moto', { toAccountId: 'demo_sav', goalId: 'demo_goal_moto' });
    if (ok(22)) t(d(22), 'expense', 8_000, 'demo_cash', 'cat_communication', 'Crédit');
    // Cérémonie du mois dernier, prise sur la réserve (utilisation liée plus bas).
    if (i === months.length - 2) t(d(14), 'expense', 20_000, 'demo_om', 'cat_social', null, { id: 'demo_tx_ceremony', subcategoryId: 'sub_social_ceremonies' });
  });
  const goals: Goal[] = [
    {
      ...base, id: 'demo_goal_moto', name: 'Ma moto', categoryId: 'vehicle', templateId: 'buy_moto', type: 'purchase', icon: '🏍️', currency: 'XOF',
      targetAmount: 1_200_000, initialAmount: 300_000, targetDate: addMonths(meta.today, 10), priority: 'high', rank: 1, accountId: 'demo_sav',
      monthlyContribution: 50_000, scope: 'personal', status: 'active', history: [],
    },
    {
      ...base, id: 'demo_goal_emergency', name: "Mon fonds d'urgence", categoryId: 'finance', templateId: 'emergency_fund', type: 'financial', icon: '🛡️', currency: 'XOF',
      targetAmount: 1_000_000, initialAmount: 0, targetDate: null, priority: 'normal', rank: 2, accountId: null, monthlyContribution: 25_000,
      scope: 'personal', status: 'active', history: [],
    },
  ];
  goals.push({
    ...base, id: 'demo_reserve', kind: 'reserve', name: meta.label('reserve.defaultName'), categoryId: 'family', templateId: 'family_reserve', type: 'family', icon: '🤝', currency: 'XOF',
    targetAmount: 300_000, initialAmount: 50_000, targetDate: null, priority: 'normal', rank: 3, accountId: null, monthlyContribution: 25_000,
    scope: 'personal', status: 'active', history: [],
  });
  const goalContributions: GoalContribution[] = transactions
    .filter((x) => x.goalId === 'demo_goal_moto')
    .map((x, i) => ({ ...base, id: `demo_gc_${i}`, goalId: 'demo_goal_moto', amount: x.amount, date: x.date, accountId: 'demo_bank', transferId: x.id, note: null }));
  // Réserve : apport le 2 de chaque mois écoulé, et la cérémonie du mois dernier prise dessus.
  months.slice(0, -1).forEach((m, i) => goalContributions.push({ ...base, id: `demo_res_in_${i}`, goalId: 'demo_reserve', amount: 25_000, date: `${m}-02`, accountId: 'demo_bank', transferId: null, note: null }));
  const ceremony = transactions.find((x) => x.id === 'demo_tx_ceremony');
  if (ceremony) goalContributions.push({ ...base, id: 'demo_res_use', goalId: 'demo_reserve', amount: -ceremony.amount, date: ceremony.date, accountId: ceremony.accountId, transferId: null, linkedTransactionId: ceremony.id, note: null });
  return {
    accounts,
    categories: systemCategories(meta),
    transactions,
    recurring: [
      // Échéances récurrentes (calendrier financier) : aucune génération rétroactive.
      { ...base, id: 'demo_rec_salary', type: 'income', label: meta.label('inc.salary'), amount: 450_000, currency: 'XOF', accountId: 'demo_bank', categoryId: 'inc_salary', frequency: 'monthly', startDate: `${meta.today.slice(0, 7)}-25`, active: true, lastGenerated: `${meta.today.slice(0, 7)}-25` },
      { ...base, id: 'demo_rec_rent', type: 'expense', label: meta.label('cat.housing'), amount: 100_000, currency: 'XOF', accountId: 'demo_bank', categoryId: 'cat_housing', frequency: 'monthly', startDate: `${meta.today.slice(0, 7)}-05`, active: true, lastGenerated: `${meta.today.slice(0, 7)}-05` },
      { ...base, id: 'demo_rec_tontine', type: 'expense', label: meta.label('acc.tontine'), amount: 10_000, currency: 'XOF', accountId: 'demo_cash', categoryId: 'cat_informal', frequency: 'weekly', startDate: meta.today, active: true, lastGenerated: meta.today },
    ],
    envelopes,
    budgets: [],
    goals,
    goalContributions,
    debts: [
      { ...base, id: 'demo_debt', direction: 'i_owe', kind: 'family', counterparty: 'Tonton Yao', principal: 200_000, currency: 'XOF', startDate: addMonths(meta.today, -2), dueDay: 28, installment: 50_000, status: 'active' },
    ],
    debtPayments: [{ ...base, id: 'demo_dp', debtId: 'demo_debt', amount: 50_000, date: addMonths(meta.today, -1), accountId: null, transactionId: null }],
    assets: [{ ...base, id: 'demo_asset', name: 'Terrain Bingerville', type: 'land', value: 3_000_000, currency: 'XOF', acquiredAt: '2024-05-01' }],
  };
}
