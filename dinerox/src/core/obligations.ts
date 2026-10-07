/**
 * Famille et obligations — module PUR.
 *
 * Les soutiens réguliers (« Maman — 20 000 / mois », « Scolarité neveu —
 * 15 000 / mois ») sont des récurrences EXISTANTES (`recurring`) de catégorie
 * « Famille » (`cat_family`), avec un libellé de bénéficiaire libre. Ce module
 * ne fait que les lister et les totaliser : par mois, par an, et la part dans
 * les revenus — un chiffre, jamais un jugement. Les libellés (bénéficiaires)
 * restent dans les données de l'utilisateur : ils ne sont jamais envoyés à
 * l'IA (le résumé `buildFinanceSummary` ne contient aucune récurrence).
 */
import type { Frequency, RecurringRule, SpaceData } from './types';
import type { CurrencyCode } from './money';
import { addDays, type ISODate } from './dates';
import { occurrencesBetween } from './recurring';
import { monthlyEquivalent } from './intelligence';

/** Catégorie des soutiens réguliers. */
export const OBLIGATION_CATEGORY = 'cat_family';

/** Occurrences par an selon la fréquence. */
const PER_YEAR: Record<Frequency, number> = { weekly: 52, monthly: 12, yearly: 1 };

export function isObligation(r: Pick<RecurringRule, 'type' | 'categoryId' | 'deleted'>): boolean {
  return !r.deleted && r.type === 'expense' && r.categoryId === OBLIGATION_CATEGORY;
}

/** Soutiens réguliers de l'espace (actifs d'abord, puis par libellé). */
export function familyObligations(data: Pick<SpaceData, 'recurring'>, currency?: CurrencyCode): RecurringRule[] {
  return data.recurring
    .filter((r) => isObligation(r) && (!currency || r.currency === currency))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
}

/** Montant annuel d'une règle (52 semaines, 12 mois ou 1 an). */
export function yearlyAmount(r: Pick<RecurringRule, 'amount' | 'frequency'>): number {
  return r.amount * PER_YEAR[r.frequency];
}

/** Équivalent mensuel : la règle existante du moteur d'intelligence (hebdomadaire × 52 / 12, annuel / 12). */
export { monthlyEquivalent };

export interface ObligationTotals {
  count: number;
  monthly: number;
  yearly: number;
  /** Part des revenus mensuels, en % arrondi ; null sans revenu connu. */
  shareOfIncome: number | null;
}

/** Totaux des soutiens ACTIFS. `monthlyIncome` : revenu mensuel de référence (observé, sinon déclaré). */
export function obligationTotals(rules: RecurringRule[], monthlyIncome: number | null | undefined): ObligationTotals {
  const active = rules.filter((r) => r.active && !r.deleted);
  const yearly = active.reduce((n, r) => n + yearlyAmount(r), 0);
  const monthly = Math.round(yearly / 12);
  return { count: active.length, monthly, yearly, shareOfIncome: monthlyIncome && monthlyIncome > 0 ? Math.round((monthly / monthlyIncome) * 100) : null };
}

/** Soutiens dus à une date donnée (coach `obligation_due` : « à verser demain »). */
export function obligationsDueOn(data: Pick<SpaceData, 'recurring'>, date: ISODate, currency?: CurrencyCode): RecurringRule[] {
  return familyObligations(data, currency).filter((r) => r.active && occurrencesBetween(r, date, date).length > 0 && !(r.lastGenerated && r.lastGenerated >= date));
}

/** Soutiens dus demain. */
export function obligationsDueTomorrow(data: Pick<SpaceData, 'recurring'>, today: ISODate, currency?: CurrencyCode): RecurringRule[] {
  return obligationsDueOn(data, addDays(today, 1), currency);
}
