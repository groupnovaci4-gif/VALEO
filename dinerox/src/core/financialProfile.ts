/**
 * Profil financier saisi à l'inscription (et modifiable ensuite).
 *
 * Règles de saisie :
 *  - OBLIGATOIRE : pays et devise seulement — tous deux préremplis, donc
 *    jamais bloquants ;
 *  - FACULTATIF : tout le reste (situation, revenus, comptes, charges,
 *    objectifs) — « Passer » est toujours possible ;
 *  - CONDITIONNEL : un champ n'est demandé que si l'option qui le justifie est
 *    choisie (jour de paie si revenu fixe ; solde d'un compte s'il est coché ;
 *    montant d'une charge si elle est cochée). « Pas de compte bancaire »
 *    retire simplement les comptes bancaires de la sélection.
 */
import type { EmploymentStatus, FamilySituation, FinancialProfile, HousingStatus, IncomeNature } from './types';
import type { CurrencyCode } from './money';
import { isCurrency } from './money';
import { countryProfile } from './countries';
import { ACCOUNT_TEMPLATES, type OnboardingAnswers } from './defaults';

export interface FinancialDraft {
  country: string;
  currency: CurrencyCode;
  familyStatus: FamilySituation | null;
  children: number;
  dependents: number;
  employmentStatus: EmploymentStatus | null;
  housingStatus: HousingStatus | null;
  incomeNature: IncomeNature | null;
  incomeSources: string[];
  monthlyIncome: number | null;
  payDay: number | null;
  paymentMethods: string[];
  noBankAccount: boolean;
  /** Solde actuel déclaré par source (facultatif). */
  balances: Record<string, number | null>;
  /** Charges cochées → montant mensuel (null = montant inconnu). */
  charges: Record<string, number | null>;
  goals: string[];
}

export function emptyDraft(country = 'CI'): FinancialDraft {
  const p = countryProfile(country);
  return {
    country: p.code,
    currency: p.currency,
    familyStatus: null,
    children: 0,
    dependents: 0,
    employmentStatus: null,
    housingStatus: null,
    incomeNature: null,
    incomeSources: [],
    monthlyIncome: null,
    payDay: null,
    paymentMethods: [],
    noBankAccount: false,
    balances: {},
    charges: {},
    goals: [],
  };
}

/** Reprend un profil déjà enregistré (modification depuis les réglages). */
export function draftFromProfile(country: string, currency: string, f: FinancialProfile | undefined): FinancialDraft {
  const d = emptyDraft(country);
  if (isCurrency(currency)) d.currency = currency;
  if (!f) return d;
  return {
    ...d,
    familyStatus: f.familyStatus ?? null,
    children: f.children ?? 0,
    dependents: f.dependents ?? 0,
    employmentStatus: f.employmentStatus ?? null,
    housingStatus: f.housingStatus ?? null,
    incomeNature: f.incomeNature ?? null,
    incomeSources: f.incomeSources ?? [],
    monthlyIncome: f.monthlyIncome ?? null,
    payDay: f.payDay ?? null,
    paymentMethods: f.paymentMethods ?? [],
    noBankAccount: !!f.noBankAccount,
    charges: Object.fromEntries(Object.entries(f.fixedCharges ?? {}).map(([k, v]) => [k, v > 0 ? v : null])),
    goals: f.financialGoals ?? [],
  };
}

/** Changement de pays : la devise suit le pays, sauf si l'utilisateur l'a choisie lui-même. */
export function withCountry(d: FinancialDraft, country: string, currencyTouched: boolean): FinancialDraft {
  const p = countryProfile(country);
  // Les sources d'argent inexistantes dans le nouveau pays sont retirées.
  const paymentMethods = d.paymentMethods.filter((k) => p.paymentMethods.includes(k));
  return { ...d, country: p.code, currency: currencyTouched ? d.currency : p.currency, paymentMethods };
}

const BANK_KEYS = new Set(ACCOUNT_TEMPLATES.filter((a) => a.type === 'bank' || a.type === 'card').map((a) => a.key));
export const isBankMethod = (key: string) => BANK_KEYS.has(key);

/** « Je n'ai pas de compte bancaire » : retire les comptes bancaires et cartes. */
export function withNoBank(d: FinancialDraft, noBank: boolean): FinancialDraft {
  return { ...d, noBankAccount: noBank, paymentMethods: noBank ? d.paymentMethods.filter((k) => !isBankMethod(k)) : d.paymentMethods };
}

/** Bascule d'une valeur dans une sélection multiple. */
export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Seules erreurs possibles : pays ou devise invalides (préremplis : ne bloquent jamais en pratique). */
export function validateDraft(d: FinancialDraft): ('country' | 'currency')[] {
  const errors: ('country' | 'currency')[] = [];
  if (!d.country) errors.push('country');
  if (!isCurrency(d.currency)) errors.push('currency');
  return errors;
}

/** Ce qui est enregistré dans le profil (montants inconnus = 0). */
export function toFinancialProfile(d: FinancialDraft, now: number): FinancialProfile {
  return {
    familyStatus: d.familyStatus,
    children: d.children,
    dependents: d.dependents,
    employmentStatus: d.employmentStatus,
    housingStatus: d.housingStatus,
    incomeNature: d.incomeNature,
    incomeSources: d.incomeNature === 'none' ? [] : d.incomeSources,
    monthlyIncome: d.incomeNature === 'none' ? null : d.monthlyIncome,
    payDay: d.incomeNature === 'fixed' ? d.payDay : null,
    paymentMethods: d.paymentMethods,
    noBankAccount: d.noBankAccount,
    fixedCharges: Object.fromEntries(Object.entries(d.charges).map(([k, v]) => [k, v ?? 0])),
    financialGoals: d.goals,
    updatedAt: now,
  };
}

/** Réponses utilisées pour créer l'environnement de départ. */
export function toOnboardingAnswers(d: FinancialDraft, firstName: string): Partial<OnboardingAnswers> & { firstName: string; currency: CurrencyCode } {
  const p = countryProfile(d.country);
  const monthlySalary = d.incomeNature === 'fixed' && d.incomeSources.includes('inc_salary');
  return {
    firstName,
    currency: d.currency,
    country: p.code,
    zone: p.zone,
    monthlyIncome: d.incomeNature === 'none' ? 0 : (d.monthlyIncome ?? 0),
    incomeFrequency: monthlySalary ? 'monthly' : 'irregular',
    payDay: d.payDay ?? 25,
    mainExpenses: [],
    goals: d.goals,
    budgetMethod: 'envelopes',
    // Aucune source cochée : un compte Espèces (l'argent liquide suffit pour commencer).
    accounts: d.paymentMethods.length ? d.paymentMethods : ['acc.cash'],
    openingBalances: Object.fromEntries(Object.entries(d.balances).filter(([k, v]) => v !== null && d.paymentMethods.includes(k)) as [string, number][]),
    fixedCharges: Object.fromEntries(Object.entries(d.charges).filter(([, v]) => v !== null && v > 0) as [string, number][]),
  };
}
