/**
 * Parcours de démarrage rapide (≈ 60 s) — module PUR : revenu, jour de paie,
 * jusqu'à trois charges fixes créées comme récurrences, puis aperçu immédiat
 * du « reste par jour ».
 */
import { addMonths, type ISODate } from './dates';
import { findSubcategory } from './catalog';
import { dailyAllowance, type DailyAllowance } from './dailyAllowance';
import type { CurrencyCode } from './money';
import type { RecurringRule } from './types';

export const QUICK_MAX_CHARGES = 3;

export interface QuickCharge {
  subcategoryId: string;
  amount: number | null;
  /** Jour d'échéance dans le mois (1-31), null = 1er du mois. */
  day: number | null;
}

/** Prochaine échéance : ce mois-ci si le jour n'est pas passé, sinon le mois suivant (jamais rétroactive). */
export function firstDueDate(day: number | null, today: ISODate): ISODate {
  const d = Math.min(28, Math.max(1, day ?? 1));
  const thisMonth = `${today.slice(0, 7)}-${String(d).padStart(2, '0')}`;
  return thisMonth >= today ? thisMonth : addMonths(thisMonth, 1);
}

/** Charges renseignées (montant > 0), limitées à trois, en règles de récurrence mensuelles. */
export function quickChargeRules(
  charges: QuickCharge[],
  meta: { accountId: string; currency: CurrencyCode; today: ISODate; now: number; uid: string; label: (subcategoryId: string) => string; id: (i: number) => string },
): RecurringRule[] {
  return charges
    .filter((c) => (c.amount ?? 0) > 0)
    .slice(0, QUICK_MAX_CHARGES)
    .map((c, i) => ({
      id: meta.id(i),
      createdAt: meta.now,
      updatedAt: meta.now,
      createdBy: meta.uid,
      type: 'expense' as const,
      label: meta.label(c.subcategoryId),
      amount: c.amount as number,
      currency: meta.currency,
      accountId: meta.accountId,
      categoryId: findSubcategory(c.subcategoryId)?.parent ?? null,
      frequency: 'monthly' as const,
      startDate: firstDueDate(c.day, meta.today),
      active: true,
      lastGenerated: null,
    }));
}

/** Aperçu affiché à la fin du parcours (mêmes règles que l'accueil). */
export function quickPreview(input: { monthlyIncome: number | null; charges: QuickCharge[]; currency: CurrencyCode; today: ISODate }): DailyAllowance {
  const recurring = quickChargeRules(input.charges, { accountId: 'preview', currency: input.currency, today: input.today, now: 0, uid: 'preview', label: (s) => s, id: (i) => `preview${i}` });
  return dailyAllowance({ data: { transactions: [], recurring, goals: [], goalContributions: [] }, currency: input.currency, today: input.today, financial: { monthlyIncome: input.monthlyIncome } });
}
