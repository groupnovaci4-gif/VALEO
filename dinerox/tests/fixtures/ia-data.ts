/**
 * Espace de référence du corpus de l'IA (docs/ia-comprend-tout.md §7) : une personne en
 * Côte d'Ivoire, avec les noms du document — comptes (Espèces, Orange Money, Wave, Banque,
 * Mon épargne), enveloppes, objectifs (Ma moto, Ma voiture, Mon mariage, Mon fonds d'urgence),
 * réserve famille, moments forts (Rentrée scolaire, Tabaski), DEUX tontines (bureau, marché),
 * dettes (Koffi, prêt banque) et créance (Awa), récurrences (Loyer, Maman, Salaire, Canal+), biens.
 */
import { catalogStarterDocs } from '../../src/core/categoryCatalog';
import { systemCategories } from '../../src/core/defaults';
import type { Asset, SpaceData } from '../../src/core/types';
import { account, contribution, debt, envelope, goal, payment, rule, space, tentry, tontine, tx } from '../helpers';

export const TODAY = '2026-10-15';

const meta = { now: 1, uid: 'u1' };
const categories = [...catalogStarterDocs('CI', meta), ...systemCategories({ ...meta, zone: 'africa' }).filter((c) => c.kind === 'income')];

const asset = (p: Partial<Asset> & Pick<Asset, 'id' | 'name' | 'value'>): Asset => ({ createdAt: 1, updatedAt: 1, createdBy: 'u1', type: 'land', currency: 'XOF', ...p });

export function iaData(): SpaceData {
  return space({
    categories,
    accounts: [
      account({ id: 'cash', name: 'Espèces', type: 'cash', openingBalance: 150_000, order: 0 }),
      account({ id: 'om', name: 'Orange Money', type: 'mobile_money', provider: 'orange_money', openingBalance: 80_000, order: 1 }),
      account({ id: 'wave', name: 'Wave', type: 'mobile_money', provider: 'wave', openingBalance: 40_000, order: 2 }),
      account({ id: 'bank', name: 'Banque', type: 'bank', provider: 'bank', openingBalance: 300_000, order: 3 }),
      account({ id: 'sav', name: 'Mon épargne', type: 'savings', isSavings: true, openingBalance: 200_000, order: 4 }),
    ],
    envelopes: [
      envelope({ id: 'env_home', name: 'Maison', monthlyBudget: 120_000, categoryIds: ['cat_housing'] }),
      envelope({ id: 'env_food', name: 'Alimentation & boissons', monthlyBudget: 80_000, categoryIds: ['cat_food'] }),
      envelope({ id: 'env_tr', name: 'Transport', monthlyBudget: 30_000, categoryIds: ['cat_transport'] }),
      envelope({ id: 'env_fam', name: 'Famille', monthlyBudget: 50_000, categoryIds: ['cat_family'] }),
      envelope({ id: 'env_free', name: 'Libre', monthlyBudget: 40_000, categoryIds: ['cat_leisure', 'cat_other'] }),
    ],
    goals: [
      goal({ id: 'g_moto', name: 'Ma moto', targetAmount: 600_000, targetDate: '2027-06-30', rank: 1 }),
      goal({ id: 'g_car', name: 'Ma voiture', targetAmount: 3_000_000, targetDate: '2028-12-31', rank: 2 }),
      goal({ id: 'g_wedding', name: 'Mon mariage', targetAmount: 1_500_000, rank: 3 }),
      goal({ id: 'g_emergency', name: "Mon fonds d'urgence", targetAmount: 500_000, templateId: 'emergency_fund', categoryId: 'finance', rank: 4 }),
      goal({ id: 'r_family', name: 'Réserve famille', kind: 'reserve', categoryId: 'family', targetAmount: 300_000, rank: 5 }),
      goal({ id: 's_school', name: 'Rentrée scolaire', categoryId: 'seasons', targetAmount: 120_000, targetDate: '2026-12-14', rank: 6 }),
      goal({ id: 's_tabaski', name: 'Tabaski', categoryId: 'seasons', targetAmount: 200_000, targetDate: '2027-05-27', rank: 7 }),
    ],
    goalContributions: [
      contribution({ goalId: 'g_moto', amount: 200_000, accountId: 'sav', date: '2026-09-01' }),
      contribution({ goalId: 'r_family', amount: 90_000, accountId: 'sav', date: '2026-09-02' }),
    ],
    tontines: [
      tontine({ id: 't_bureau', name: 'Tontine du bureau', amountPerShare: 20_000, startDate: '2026-07-05', membersCount: 10, myTurns: [6] }),
      tontine({ id: 't_marche', name: 'Tontine du marché', amountPerShare: 5_000, frequency: 'weekly', startDate: '2026-09-07', membersCount: 12, myTurns: [9] }),
    ],
    tontineEntries: [1, 2, 3].map((n) => tentry({ tontineId: 't_bureau', kind: 'contribution', period: n, amount: 20_000, date: `2026-0${6 + n}-05` })),
    debts: [
      debt({ id: 'd_koffi', direction: 'i_owe', kind: 'family', counterparty: 'Koffi', principal: 150_000, installment: 50_000, dueDay: 28 }),
      debt({ id: 'd_bank', direction: 'i_owe', kind: 'bank', counterparty: 'Prêt banque', principal: 1_000_000, installment: 100_000, dueDay: 10 }),
      debt({ id: 'd_awa', direction: 'owed_to_me', kind: 'personal', counterparty: 'Awa', principal: 20_000 }),
    ],
    debtPayments: [payment({ debtId: 'd_koffi', amount: 50_000, date: '2026-09-28' })],
    recurring: [
      rule({ id: 'rec_rent', type: 'expense', label: 'Loyer', amount: 100_000, accountId: 'bank', categoryId: 'cat_housing', subcategoryId: 'sub_housing_rent', startDate: '2026-01-05' }),
      rule({ id: 'rec_mum', type: 'expense', label: 'Maman', amount: 50_000, accountId: 'om', categoryId: 'cat_family', startDate: '2026-01-10' }),
      rule({ id: 'rec_salary', type: 'income', label: 'Salaire', amount: 450_000, accountId: 'bank', categoryId: 'inc_salary', startDate: '2026-01-25' }),
      rule({ id: 'rec_canal', type: 'expense', label: 'Canal+', amount: 15_000, accountId: 'wave', categoryId: 'cat_leisure', startDate: '2026-01-02' }),
    ],
    assets: [asset({ id: 'as_land', name: 'Terrain Bingerville', value: 3_000_000 }), asset({ id: 'as_shop', name: 'Boutique Adjamé', type: 'business', value: 800_000 })],
    transactions: [
      tx({ id: 'x_rent', type: 'expense', amount: 100_000, accountId: 'bank', categoryId: 'cat_housing', subcategoryId: 'sub_housing_rent', date: '2026-10-05' }),
      tx({ id: 'x_maquis', type: 'expense', amount: 6_000, accountId: 'cash', categoryId: 'cat_food', subcategoryId: 'sub_food_maquis', date: '2026-10-13' }),
      tx({ id: 'x_taxi', type: 'expense', amount: 35_000, accountId: 'cash', categoryId: 'cat_transport', subcategoryId: 'sub_transport_taxi', date: '2026-10-12' }),
      tx({ id: 'x_salary', type: 'income', amount: 450_000, accountId: 'bank', categoryId: 'inc_salary', date: '2026-09-25' }),
      tx({ id: 'x_sep_food', type: 'expense', amount: 70_000, accountId: 'cash', categoryId: 'cat_food', subcategoryId: 'sub_food_market', date: '2026-09-14' }),
    ],
  });
}
