/**
 * Périodes de paie — argent disponible v2 (docs/argent-disponible.md §7.1, D8). Module PUR.
 *
 * H = veille de la prochaine paie si le jour de paie est connu, sinon fin du mois. Le jour
 * réel vaut min(jour, dernier jour du mois) : une paie le 30 tombe le 28 février. Aucune
 * valeur par défaut (fin de `payDay ?? 25`).
 */
import { addDays, addMonths, diffDays, endOfMonth, parseISODate, startOfMonth, toISODate, type ISODate } from './dates';

/** Date du jour de paie dans un mois (décalé de `monthOffset`) : min(jour, dernier jour du mois). */
export function payDate(ref: ISODate, monthOffset: number, payDay: number): ISODate {
  const d = parseISODate(startOfMonth(ref));
  const first = new Date(d.getFullYear(), d.getMonth() + monthOffset, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return toISODate(new Date(first.getFullYear(), first.getMonth(), Math.min(Math.max(1, Math.floor(payDay)), last), 12));
}

export interface Horizon {
  /** H : dernier jour compté. */
  until: ISODate;
  /** H − aujourd'hui + 1. */
  daysLeft: number;
  /** Début de la période en cours (dernière paie, sinon 1er du mois). */
  cycleStart: ISODate;
  /** Dernière paie prévue ≤ aujourd'hui (null sans jour de paie). */
  lastPayday: ISODate | null;
}

/** Horizon du reste par jour (D8). */
export function payHorizon(today: ISODate, payDay: number | null | undefined): Horizon {
  if (!payDay || payDay < 1) {
    const until = endOfMonth(today);
    return { until, daysLeft: diffDays(today, until) + 1, cycleStart: startOfMonth(today), lastPayday: null };
  }
  const thisMonth = payDate(today, 0, payDay);
  const next = thisMonth > today ? thisMonth : payDate(today, 1, payDay);
  const lastPayday = thisMonth <= today ? thisMonth : payDate(today, -1, payDay);
  const until = addDays(next, -1);
  return { until, daysLeft: diffDays(today, until) + 1, cycleStart: lastPayday, lastPayday };
}

/** Prochaine paie strictement après aujourd'hui (null sans jour de paie). */
export function nextPayday(today: ISODate, payDay: number | null | undefined): ISODate | null {
  if (!payDay || payDay < 1) return null;
  return addDays(payHorizon(today, payDay).until, 1);
}

/**
 * Début de la période PRÉCÉDENTE (§7.2) : une échéance non confirmée de la période en cours
 * ou de la précédente est « en retard » (dans E) ; plus ancienne, elle est « À régulariser ».
 */
export function previousCycleStart(h: Pick<Horizon, 'cycleStart' | 'lastPayday'>, payDay: number | null | undefined): ISODate {
  if (h.lastPayday && payDay && payDay >= 1) return payDate(h.lastPayday, -1, payDay);
  return startOfMonth(addMonths(h.cycleStart, -1));
}
