/**
 * Valeurs initiales : catégories système, modèles de comptes, et création de
 * la première structure financière à partir des réponses de l'onboarding.
 */
import type {
  Account,
  AccountProvider,
  AccountType,
  BudgetMethod,
  Category,
  Envelope,
  Goal,
  IncomeFrequency,
  RecurringRule,
  SpaceData,
} from './types';
import type { CurrencyCode } from './money';
import { proposeBudget, type BudgetBucket } from './budget';
import { today, type ISODate } from './dates';
import { DEFAULT_GOAL_CATEGORIES } from './goalCategories';

interface CatSeed {
  id: string;
  key: string;
  icon: string;
  color: string;
}

/** Catégories de dépenses initiales (identifiants stables : ne pas renommer). */
export const EXPENSE_CATEGORIES: CatSeed[] = [
  { id: 'cat_housing', key: 'cat.housing', icon: 'home', color: '#6366F1' },
  { id: 'cat_food', key: 'cat.food', icon: 'restaurant', color: '#F59E0B' },
  { id: 'cat_transport', key: 'cat.transport', icon: 'car', color: '#0EA5E9' },
  { id: 'cat_health', key: 'cat.health', icon: 'medkit', color: '#EF4444' },
  { id: 'cat_education', key: 'cat.education', icon: 'school', color: '#8B5CF6' },
  { id: 'cat_family', key: 'cat.family', icon: 'heart', color: '#EC4899' },
  { id: 'cat_communication', key: 'cat.communication', icon: 'call', color: '#14B8A6' },
  { id: 'cat_internet', key: 'cat.internet', icon: 'wifi', color: '#06B6D4' },
  { id: 'cat_leisure', key: 'cat.leisure', icon: 'game-controller', color: '#F97316' },
  { id: 'cat_clothing', key: 'cat.clothing', icon: 'shirt', color: '#A855F7' },
  { id: 'cat_debts', key: 'cat.debts', icon: 'receipt', color: '#64748B' },
  { id: 'cat_savings', key: 'cat.savings', icon: 'wallet', color: '#16A34A' },
  { id: 'cat_investment', key: 'cat.investment', icon: 'trending-up', color: '#22C55E' },
  { id: 'cat_other', key: 'cat.other', icon: 'ellipsis-horizontal', color: '#94A3B8' },
];

export const INCOME_CATEGORIES: CatSeed[] = [
  { id: 'inc_salary', key: 'inc.salary', icon: 'briefcase', color: '#16A34A' },
  { id: 'inc_business', key: 'inc.business', icon: 'storefront', color: '#0EA5E9' },
  { id: 'inc_freelance', key: 'inc.freelance', icon: 'laptop', color: '#6366F1' },
  { id: 'inc_commission', key: 'inc.commission', icon: 'pricetag', color: '#F59E0B' },
  { id: 'inc_pension', key: 'inc.pension', icon: 'umbrella', color: '#8B5CF6' },
  { id: 'inc_family', key: 'inc.family', icon: 'people', color: '#EC4899' },
  { id: 'inc_rent', key: 'inc.rent', icon: 'key', color: '#14B8A6' },
  { id: 'inc_other', key: 'inc.other', icon: 'add-circle', color: '#94A3B8' },
];

export function systemCategories(meta: { now: number; uid: string }): Category[] {
  const mk = (kind: 'income' | 'expense') => (c: CatSeed, i: number): Category => ({
    id: c.id,
    kind,
    name: '',
    labelKey: c.key,
    icon: c.icon,
    color: c.color,
    order: i,
    system: true,
    createdAt: meta.now,
    updatedAt: meta.now,
    createdBy: meta.uid,
  });
  return [...EXPENSE_CATEGORIES.map(mk('expense')), ...INCOME_CATEGORIES.map(mk('income'))];
}

export interface AccountTemplate {
  key: string;
  type: AccountType;
  provider: AccountProvider;
  icon: string;
  color: string;
  isSavings?: boolean;
}

/** Modèles proposés à la création d'un compte (gestion MANUELLE, aucune connexion opérateur). */
export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  { key: 'acc.cash', type: 'cash', provider: 'none', icon: 'cash', color: '#16A34A' },
  { key: 'acc.orange', type: 'mobile_money', provider: 'orange_money', icon: 'phone-portrait', color: '#F97316' },
  { key: 'acc.mtn', type: 'mobile_money', provider: 'mtn_momo', icon: 'phone-portrait', color: '#EAB308' },
  { key: 'acc.moov', type: 'mobile_money', provider: 'moov_money', icon: 'phone-portrait', color: '#2563EB' },
  { key: 'acc.wave', type: 'mobile_money', provider: 'wave', icon: 'water', color: '#0EA5E9' },
  { key: 'acc.bank', type: 'bank', provider: 'bank', icon: 'business', color: '#334155' },
  { key: 'acc.savings', type: 'savings', provider: 'none', icon: 'wallet', color: '#16A34A', isSavings: true },
  { key: 'acc.card', type: 'card', provider: 'bank', icon: 'card', color: '#7C3AED' },
];

const BUCKET_ENVELOPE: Record<Exclude<BudgetBucket, 'needs' | 'wants'>, { key: string; icon: string; color: string; categoryIds: string[] }> = {
  housing: { key: 'env.housing', icon: 'home', color: '#6366F1', categoryIds: ['cat_housing', 'cat_internet'] },
  food: { key: 'env.food', icon: 'restaurant', color: '#F59E0B', categoryIds: ['cat_food'] },
  transport: { key: 'env.transport', icon: 'car', color: '#0EA5E9', categoryIds: ['cat_transport'] },
  family: { key: 'env.family', icon: 'heart', color: '#EC4899', categoryIds: ['cat_family', 'cat_education', 'cat_health'] },
  savings: { key: 'env.savings', icon: 'wallet', color: '#16A34A', categoryIds: ['cat_savings'] },
  project: { key: 'env.project', icon: 'rocket', color: '#8B5CF6', categoryIds: ['cat_investment'] },
  free: { key: 'env.free', icon: 'sparkles', color: '#94A3B8', categoryIds: ['cat_leisure', 'cat_clothing', 'cat_communication', 'cat_other'] },
};

export interface OnboardingAnswers {
  firstName: string;
  currency: CurrencyCode;
  monthlyIncome: number;
  incomeFrequency: IncomeFrequency;
  /** Jour de paie (1-28) si revenu mensuel. */
  payDay?: number | null;
  mainExpenses: string[];
  goals: string[]; // ids de modèles d'objectifs (ex. 'buy_moto', 'emergency_fund')
  budgetMethod: BudgetMethod;
  /** Comptes utilisés (clés de ACCOUNT_TEMPLATES). */
  accounts: string[];
}

/** Libellés résolus par l'appelant (i18n) pour garder ce module pur. */
export type Labeler = (key: string) => string;

/**
 * Construit la première structure financière : comptes, catégories,
 * enveloppes budgétées, revenu récurrent et objectifs choisis.
 */
export function buildInitialStructure(
  answers: OnboardingAnswers,
  meta: { now: number; uid: string; date?: ISODate; lang?: 'fr' | 'en'; id: (prefix: string) => string; label: Labeler },
): Partial<SpaceData> {
  const date = meta.date ?? today();
  const base = { createdAt: meta.now, updatedAt: meta.now, createdBy: meta.uid };
  const accountKeys = answers.accounts.length ? answers.accounts : ['acc.cash'];
  const accounts: Account[] = accountKeys
    .map((k) => ACCOUNT_TEMPLATES.find((t) => t.key === k))
    .filter((t): t is AccountTemplate => !!t)
    .map((t, i) => ({
      ...base,
      id: meta.id('acc_'),
      name: meta.label(t.key),
      type: t.type,
      provider: t.provider,
      currency: answers.currency,
      openingBalance: 0,
      color: t.color,
      icon: t.icon,
      active: true,
      isSavings: !!t.isSavings,
      savingsKind: t.isSavings ? 'general' : undefined,
      order: i,
    }));

  const method: BudgetMethod = answers.budgetMethod === '50_30_20' ? 'envelopes' : answers.budgetMethod;
  const lines = proposeBudget(answers.monthlyIncome, method, answers.currency);
  const envelopes: Envelope[] = [];
  const buckets: (keyof typeof BUCKET_ENVELOPE)[] = ['housing', 'food', 'transport', 'family', 'savings', 'project', 'free'];
  buckets.forEach((b, i) => {
    const def = BUCKET_ENVELOPE[b];
    const amount = lines.find((l) => l.bucket === b)?.amount ?? 0;
    envelopes.push({
      ...base,
      id: meta.id('env_'),
      name: meta.label(def.key),
      icon: def.icon,
      color: def.color,
      monthlyBudget: amount,
      categoryIds: def.categoryIds,
      order: i,
      active: true,
    });
  });

  const recurring: RecurringRule[] = [];
  if (answers.monthlyIncome > 0 && answers.incomeFrequency === 'monthly' && accounts[0]) {
    const day = Math.min(28, Math.max(1, answers.payDay ?? 25));
    const start = `${date.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    recurring.push({
      ...base,
      id: meta.id('rec_'),
      type: 'income',
      label: meta.label('inc.salary'),
      amount: answers.monthlyIncome,
      currency: answers.currency,
      accountId: (accounts.find((a) => a.type === 'bank') ?? accounts[0]).id,
      categoryId: 'inc_salary',
      frequency: 'monthly',
      // Pas de génération rétroactive : première échéance = prochain jour de paie.
      startDate: start >= date ? start : nextMonthSameDay(start),
      active: true,
      lastGenerated: null,
    });
  }

  const goals: Goal[] = answers.goals
    .map((tplId, i) => {
      const cat = DEFAULT_GOAL_CATEGORIES.find((c) => c.templates.some((t) => t.id === tplId));
      const tpl = cat?.templates.find((t) => t.id === tplId);
      if (!cat || !tpl) return null;
      const goal: Goal = {
        ...base,
        id: meta.id('goal_'),
        name: tpl.defaultName?.[meta.lang ?? 'fr'] ?? tpl.label[meta.lang ?? 'fr'],
        categoryId: cat.id,
        templateId: tpl.id,
        type: cat.type,
        icon: tpl.icon ?? cat.icon,
        currency: answers.currency,
        targetAmount: 0,
        initialAmount: 0,
        targetDate: null,
        priority: 'normal',
        rank: i + 1,
        accountId: null,
        monthlyContribution: null,
        scope: 'personal',
        status: 'active',
        history: [],
      };
      return goal;
    })
    .filter((g): g is Goal => !!g);

  return {
    accounts,
    categories: systemCategories(meta),
    envelopes,
    recurring,
    goals,
  };
}

function nextMonthSameDay(d: ISODate): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Structure de départ créée automatiquement à la première ouverture (sans
 * questionnaire) : compte Espèces, enveloppes, sans montant inventé.
 * Identifiants FIXES (acc_start1, env_start1…) : si deux appareils la créent
 * en même temps, ils écrivent les mêmes documents au lieu de les dupliquer.
 */
export function starterStructure(
  p: { firstName: string; currency: CurrencyCode },
  meta: { now: number; uid: string; lang?: 'fr' | 'en'; label: Labeler; date?: ISODate },
): Partial<SpaceData> {
  const counters: Record<string, number> = {};
  return buildInitialStructure(
    { firstName: p.firstName, currency: p.currency, monthlyIncome: 0, incomeFrequency: 'irregular', payDay: 25, mainExpenses: [], goals: [], budgetMethod: 'envelopes', accounts: ['acc.cash'] },
    { ...meta, id: (prefix) => `${prefix}start${(counters[prefix] = (counters[prefix] ?? 0) + 1)}` },
  );
}
