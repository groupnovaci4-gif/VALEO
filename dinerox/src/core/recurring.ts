/**
 * Revenus/dépenses récurrents.
 *
 * Les échéances dues sont matérialisées en opérations avec un identifiant
 * DÉTERMINISTE `rec_<règle>_<date>` : si deux appareils génèrent la même
 * échéance hors-ligne, ils écrivent le même document — pas de doublon.
 */
import type { RecurringRule, Transaction } from './types';
import { addDays, addMonths, diffDays, type ISODate } from './dates';

export function recurringTxId(ruleId: string, date: ISODate): string {
  return `rec_${ruleId}_${date.replace(/-/g, '')}`;
}

export function nextOccurrence(rule: Pick<RecurringRule, 'frequency'>, date: ISODate): ISODate {
  switch (rule.frequency) {
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addMonths(date, 12);
  }
}

/**
 * Échéances dues (≤ `until`) non encore générées. Bornées à `max` pour ne
 * jamais générer des centaines d'opérations d'un coup après une longue absence.
 */
export function dueOccurrences(rule: RecurringRule, until: ISODate, max = 24): ISODate[] {
  if (!rule.active || rule.deleted) return [];
  const out: ISODate[] = [];
  // Les mois sont calculés depuis la date de début (et non de proche en
  // proche) : une règle du 31 retombe bien le 31 après un mois de 30 jours.
  for (let i = 0; out.length < max; i++) {
    const d =
      rule.frequency === 'weekly'
        ? addDays(rule.startDate, 7 * i)
        : addMonths(rule.startDate, i * (rule.frequency === 'yearly' ? 12 : 1));
    if (d > until) break;
    if (rule.endDate && d > rule.endDate) break;
    if (!rule.lastGenerated || d > rule.lastGenerated) out.push(d);
  }
  return out;
}

/** Prochaine échéance future (pour l'affichage). */
export function upcomingOccurrence(rule: RecurringRule, from: ISODate): ISODate | null {
  if (!rule.active) return null;
  for (let i = 0; i < 1000; i++) {
    const d =
      rule.frequency === 'weekly'
        ? addDays(rule.startDate, 7 * i)
        : addMonths(rule.startDate, i * (rule.frequency === 'yearly' ? 12 : 1));
    if (rule.endDate && d > rule.endDate) return null;
    if (d >= from) return d;
  }
  return null;
}

export function materialize(
  rule: RecurringRule,
  date: ISODate,
  meta: { now: number; uid: string },
): Transaction {
  return {
    id: recurringTxId(rule.id, date),
    type: rule.type,
    amount: rule.amount,
    currency: rule.currency,
    date,
    accountId: rule.accountId,
    categoryId: rule.categoryId ?? null,
    ...(rule.subcategoryId ? { subcategoryId: rule.subcategoryId } : {}),
    envelopeId: rule.envelopeId ?? null,
    payee: rule.label,
    note: null,
    recurringId: rule.id,
    createdAt: meta.now,
    updatedAt: meta.now,
    createdBy: meta.uid,
  };
}

/**
 * Dernière échéance STRICTEMENT antérieure à `date` (null s'il n'y en a pas).
 * Sert à créer une règle dont la date de début est passée sans générer
 * rétroactivement toutes les échéances.
 */
export function lastOccurrenceBefore(rule: Pick<RecurringRule, 'frequency' | 'startDate'>, date: ISODate): ISODate | null {
  let last: ISODate | null = null;
  for (let i = 0; i < 5000; i++) {
    const d =
      rule.frequency === 'weekly'
        ? addDays(rule.startDate, 7 * i)
        : addMonths(rule.startDate, i * (rule.frequency === 'yearly' ? 12 : 1));
    if (d >= date) break;
    last = d;
  }
  return last;
}

/** Toutes les occurrences d'une règle entre deux dates incluses (calendrier, prévisions). */
export function occurrencesBetween(rule: Pick<RecurringRule, 'frequency' | 'startDate' | 'endDate' | 'active'>, from: ISODate, to: ISODate, max = 400): ISODate[] {
  const out: ISODate[] = [];
  if (!rule.active) return out;
  // Saut direct près de `from` pour les règles anciennes (pas de limite d'ancienneté).
  let i = 0;
  if (rule.frequency === 'weekly' && rule.startDate < from) i = Math.max(0, Math.floor(diffDays(rule.startDate, from) / 7) - 1);
  for (let n = 0; n < max; n++, i++) {
    const d = rule.frequency === 'weekly' ? addDays(rule.startDate, 7 * i) : addMonths(rule.startDate, i * (rule.frequency === 'yearly' ? 12 : 1));
    if (d > to || (rule.endDate && d > rule.endDate)) break;
    if (d >= from) out.push(d);
  }
  return out;
}
