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
import type { Zone } from './countries';
import { findSubcategory, subcategoryDocs } from './catalog';

interface CatSeed {
  id: string;
  key: string;
  icon: string;
  color: string;
  /** Zones où la catégorie est proposée (absente = partout). Une suggestion, jamais une obligation. */
  zones?: Zone[];
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
  { id: 'cat_social', key: 'cat.social', icon: 'people-circle', color: '#DB2777', zones: ['africa'] },
  { id: 'cat_informal', key: 'cat.informal', icon: 'people', color: '#0D9488', zones: ['africa'] },
  { id: 'cat_taxes', key: 'cat.taxes', icon: 'document-text', color: '#475569' },
  { id: 'cat_insurance', key: 'cat.insurance', icon: 'shield-checkmark', color: '#0369A1' },
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
  { id: 'inc_agri', key: 'inc.agri', icon: 'leaf', color: '#65A30D', zones: ['africa'] },
  { id: 'inc_allowance', key: 'inc.allowance', icon: 'gift', color: '#0EA5E9', zones: ['europe'] },
  { id: 'inc_investment', key: 'inc.investment', icon: 'trending-up', color: '#22C55E' },
  { id: 'inc_sale', key: 'inc.sale', icon: 'pricetags', color: '#F97316' },
  { id: 'inc_side', key: 'inc.side', icon: 'construct', color: '#6366F1' },
  { id: 'inc_gift', key: 'inc.gift', icon: 'gift', color: '#EC4899' },
  // 1.7 : cagnotte de tontine reçue (les cotisations restent dans « Tontines et cotisations »).
  { id: 'inc_tontine', key: 'inc.tontine', icon: 'people', color: '#0D9488', zones: ['africa'] },
  { id: 'inc_refund', key: 'inc.refund', icon: 'return-down-back', color: '#64748B' },
  { id: 'inc_other', key: 'inc.other', icon: 'add-circle', color: '#94A3B8' },
];

/** Catégories système proposées dans une zone (toutes si la zone est inconnue). */
export function categorySeedsFor(zone?: Zone | null): { expense: CatSeed[]; income: CatSeed[] } {
  const keep = (c: CatSeed) => !zone || !c.zones || c.zones.includes(zone);
  return { expense: EXPENSE_CATEGORIES.filter(keep), income: INCOME_CATEGORIES.filter(keep) };
}

export function systemCategories(meta: { now: number; uid: string; zone?: Zone | null }): Category[] {
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
  const seeds = categorySeedsFor(meta.zone);
  return [...seeds.expense.map(mk('expense')), ...seeds.income.map(mk('income'))];
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
  { key: 'acc.free', type: 'mobile_money', provider: 'free_money', icon: 'phone-portrait', color: '#DC2626' },
  { key: 'acc.airtel', type: 'mobile_money', provider: 'airtel_money', icon: 'phone-portrait', color: '#E11D48' },
  { key: 'acc.mobile', type: 'mobile_money', provider: 'mobile_other', icon: 'phone-portrait', color: '#0D9488' },
  { key: 'acc.bank', type: 'bank', provider: 'bank', icon: 'business', color: '#334155' },
  { key: 'acc.current', type: 'bank', provider: 'bank', icon: 'business', color: '#334155' },
  { key: 'acc.joint', type: 'bank', provider: 'bank', icon: 'people', color: '#0369A1' },
  { key: 'acc.savings', type: 'savings', provider: 'none', icon: 'wallet', color: '#16A34A', isSavings: true },
  { key: 'acc.card', type: 'card', provider: 'bank', icon: 'card', color: '#7C3AED' },
  { key: 'acc.investment', type: 'investment', provider: 'none', icon: 'trending-up', color: '#22C55E', isSavings: true },
  { key: 'acc.tontine', type: 'other', provider: 'tontine', icon: 'people', color: '#0D9488', isSavings: true },
];

const BUCKET_ENVELOPE: Record<Exclude<BudgetBucket, 'needs' | 'wants'>, { key: string; icon: string; color: string; categoryIds: string[] }> = {
  housing: { key: 'env.housing', icon: 'home', color: '#6366F1', categoryIds: ['cat_housing', 'cat_internet', 'cat_taxes', 'cat_insurance'] },
  food: { key: 'env.food', icon: 'restaurant', color: '#F59E0B', categoryIds: ['cat_food'] },
  transport: { key: 'env.transport', icon: 'car', color: '#0EA5E9', categoryIds: ['cat_transport'] },
  family: { key: 'env.family', icon: 'heart', color: '#EC4899', categoryIds: ['cat_family', 'cat_education', 'cat_health', 'cat_social'] },
  savings: { key: 'env.savings', icon: 'wallet', color: '#16A34A', categoryIds: ['cat_savings', 'cat_informal'] },
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
  /** Pays (contextualisation : sous-catégories locales). Défaut : aucune sous-catégorie. */
  country?: string;
  zone?: Zone;
  /** Solde actuel déclaré par compte (clé de modèle → montant). Facultatif. */
  openingBalances?: Record<string, number>;
  /** Charges principales déclarées (sous-catégorie → montant mensuel, 0 = inconnu). */
  fixedCharges?: Record<string, number>;
  /** Noms de comptes dans le pays (ex. tontine → « Susu » au Ghana). */
  accountLabel?: (key: string) => string;
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
      name: answers.accountLabel?.(t.key) ?? meta.label(t.key),
      type: t.type,
      provider: t.provider,
      currency: answers.currency,
      openingBalance: Math.max(0, Math.round(answers.openingBalances?.[t.key] ?? 0)),
      color: t.color,
      icon: t.icon,
      active: true,
      isSavings: !!t.isSavings,
      savingsKind: t.isSavings ? 'general' : undefined,
      order: i,
    }));

  const method: BudgetMethod = answers.budgetMethod === '50_30_20' ? 'envelopes' : answers.budgetMethod;
  const lines = proposeBudget(answers.monthlyIncome, method, answers.currency);
  // Charges déclarées : elles fixent le budget minimal de l'enveloppe correspondante
  // (le montant réel de l'utilisateur prime sur une proportion théorique).
  const declared: Partial<Record<string, number>> = {};
  for (const [subId, amount] of Object.entries(answers.fixedCharges ?? {})) {
    const sc = findSubcategory(subId);
    if (!sc || !(amount > 0)) continue;
    const bucket = (Object.keys(BUCKET_ENVELOPE) as (keyof typeof BUCKET_ENVELOPE)[]).find((b) => BUCKET_ENVELOPE[b].categoryIds.includes(sc.parent)) ?? 'free';
    declared[bucket] = (declared[bucket] ?? 0) + Math.round(amount);
  }
  const envelopes: Envelope[] = [];
  const buckets: (keyof typeof BUCKET_ENVELOPE)[] = ['housing', 'food', 'transport', 'family', 'savings', 'project', 'free'];
  // Budget de départ : les charges déclarées d'abord ; le reste du revenu est réparti
  // sur les autres enveloppes au prorata de la proposition, sans jamais dépasser le revenu.
  const amounts: Record<string, number> = {};
  for (const b of buckets) amounts[b] = Math.max(lines.find((l) => l.bucket === b)?.amount ?? 0, declared[b] ?? 0);
  const totalProposed = buckets.reduce((n, b) => n + amounts[b], 0);
  if (answers.monthlyIncome > 0 && totalProposed > answers.monthlyIncome) {
    const declaredTotal = buckets.reduce((n, b) => n + (declared[b] ?? 0), 0);
    const room = Math.max(0, answers.monthlyIncome - declaredTotal);
    const flexible = buckets.filter((b) => !declared[b]);
    const flexTotal = flexible.reduce((n, b) => n + amounts[b], 0);
    for (const b of flexible) amounts[b] = flexTotal > 0 ? Math.floor((amounts[b] * room) / flexTotal) : 0;
    // Les arrondis profitent à l'enveloppe « libre » (total = revenu, ou charges déclarées si elles le dépassent).
    const used = buckets.reduce((n, b) => n + amounts[b], 0);
    if (!declared.free && used < answers.monthlyIncome) amounts.free += answers.monthlyIncome - used;
  }
  buckets.forEach((b, i) => {
    const def = BUCKET_ENVELOPE[b];
    const amount = amounts[b];
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

  const categories = systemCategories({ ...meta, zone: answers.zone });
  if (answers.country && answers.zone) {
    const parents = new Set(categories.map((c) => c.id));
    categories.push(...subcategoryDocs(answers.country, answers.zone, { now: meta.now, uid: meta.uid, lang: meta.lang ?? 'fr', parents }));
  }

  return {
    accounts,
    categories,
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
 * Environnement DINEROX de départ (fin de l'inscription, ou « Plus tard »).
 * Tout est facultatif : sans réponse, un compte Espèces et des enveloppes à 0.
 * Identifiants FIXES (acc_start1, env_start1…) : si deux appareils le créent
 * en même temps, ils écrivent les mêmes documents au lieu de les dupliquer.
 */
export function starterStructure(
  p: Partial<OnboardingAnswers> & { firstName: string; currency: CurrencyCode },
  meta: { now: number; uid: string; lang?: 'fr' | 'en'; label: Labeler; date?: ISODate },
): Partial<SpaceData> {
  const counters: Record<string, number> = {};
  return buildInitialStructure(
    {
      monthlyIncome: 0,
      incomeFrequency: 'irregular',
      payDay: 25,
      mainExpenses: [],
      goals: [],
      budgetMethod: 'envelopes',
      ...p,
      accounts: p.accounts?.length ? p.accounts : ['acc.cash'],
    },
    { ...meta, id: (prefix) => `${prefix}start${(counters[prefix] = (counters[prefix] ?? 0) + 1)}` },
  );
}
