/**
 * Récurrences à confirmer — argent disponible v2 (docs/argent-disponible.md §8, D7).
 * Module PUR (testé : tests/argent-reste-par-jour.test.ts).
 *
 * Une récurrence n'est JAMAIS enregistrée seule. Le jour prévu, une carte demande
 * « payé ? » (dépense) ou « reçu ? » (revenu) ; la confirmation crée l'opération avec
 * l'identifiant DÉTERMINISTE de l'échéance (`recurringTxId`) : deux téléphones ne
 * créent pas deux loyers.
 *  - Dépense : chaque échéance non confirmée depuis le début de la période en cours.
 *  - Revenu : seulement la dernière échéance passée — jamais de rattrapage (une seule carte).
 * Une échéance déjà générée par l'ancien moteur (`lastGenerated`) est confirmée.
 */
import { occurrencesBetween, recurringTxId } from './recurring';
import { addMonths, startOfMonth, type ISODate } from './dates';
import type { RecurringRule, SpaceData } from './types';

export interface ConfirmCard {
  ruleId: string;
  type: RecurringRule['type'];
  date: ISODate;
  amount: number;
  /** Identifiant de l'opération à créer à la confirmation. */
  id: string;
}

/** L'échéance `date` de la règle est-elle déjà confirmée (ou générée par l'ancien moteur) ? */
export function occurrenceConfirmed(rule: Pick<RecurringRule, 'id' | 'lastGenerated'>, date: ISODate, txIds: Set<string>): boolean {
  return (!!rule.lastGenerated && date <= rule.lastGenerated) || txIds.has(recurringTxId(rule.id, date));
}

export function recurringToConfirm(data: Pick<SpaceData, 'recurring' | 'transactions'>, today: ISODate, periodStart: ISODate = startOfMonth(today)): ConfirmCard[] {
  const txIds = new Set(data.transactions.filter((t) => !t.deleted).map((t) => t.id));
  const out: ConfirmCard[] = [];
  for (const r of data.recurring) {
    if (r.deleted || !r.active) continue;
    if (r.type === 'income') {
      // Dernière échéance passée (une année et un mois suffisent, même pour une règle annuelle).
      const from = addMonths(today, -13);
      const last = occurrencesBetween(r, r.startDate > from ? r.startDate : from, today).pop();
      if (last && !occurrenceConfirmed(r, last, txIds)) out.push({ ruleId: r.id, type: r.type, date: last, amount: r.amount, id: recurringTxId(r.id, last) });
      continue;
    }
    for (const d of occurrencesBetween(r, periodStart, today)) {
      if (!occurrenceConfirmed(r, d, txIds)) out.push({ ruleId: r.id, type: r.type, date: d, amount: r.amount, id: recurringTxId(r.id, d) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
