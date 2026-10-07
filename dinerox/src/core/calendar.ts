/**
 * Calendrier financier : échéances à venir dérivées des données de
 * l'utilisateur (récurrences, dettes, objectifs). Rien n'est inventé.
 */
import type { SpaceData } from './types';
import type { CurrencyCode } from './money';
import { addDays, addMonths, type ISODate } from './dates';
import { debtStatus } from './debts';
import { goalPlanFor } from './goals';
import { occurrencesBetween } from './recurring';
import { isReserve, isSeason } from './reserve';

/** `season` : moment fort de l'année (objectif à date de la catégorie « moments forts »). */
export type CalendarKind = 'income' | 'expense' | 'tontine' | 'debt' | 'goal' | 'season';

export interface CalendarEvent {
  id: string;
  date: ISODate;
  kind: CalendarKind;
  label: string;
  amount: number | null;
  currency: CurrencyCode;
  link: string;
}

export function financialCalendar(data: Pick<SpaceData, 'recurring' | 'debts' | 'debtPayments' | 'goals' | 'goalContributions'>, from: ISODate, days = 60): CalendarEvent[] {
  const until = addDays(from, days);
  const out: CalendarEvent[] = [];
  for (const r of data.recurring) {
    if (r.deleted || !r.active) continue;
    for (const d of occurrencesBetween(r, from, until)) {
      const kind: CalendarKind = r.type === 'income' ? 'income' : r.categoryId === 'cat_informal' ? 'tontine' : 'expense';
      out.push({ id: `${r.id}_${d}`, date: d, kind, label: r.label, amount: r.amount, currency: r.currency, link: `/recurring/edit?id=${r.id}` });
    }
  }
  for (const d of data.debts) {
    if (d.deleted || d.direction !== 'i_owe') continue;
    const s = debtStatus(d, data.debtPayments, from);
    if (s.settled || !s.nextDue) continue;
    // Échéances successives, sans jamais dépasser le restant dû ; une échéance en
    // retard (date passée) reste affichée.
    let due: ISODate = s.nextDue;
    let left = s.remaining;
    for (let i = 0; i < 12 && due <= until && left > 0; i++) {
      const amount = Math.min(d.installment ?? left, left);
      out.push({ id: `${d.id}_${due}`, date: due, kind: 'debt', label: d.counterparty, amount, currency: d.currency, link: `/debts/${d.id}` });
      left -= amount;
      if (!d.installment) break;
      due = addMonths(due, 1);
    }
  }
  for (const g of data.goals) {
    if (g.deleted || isReserve(g) || g.status !== 'active' || !g.targetDate || g.targetDate < from || g.targetDate > until) continue;
    const plan = goalPlanFor(g, data.goalContributions, from);
    out.push({ id: `goal_${g.id}`, date: g.targetDate, kind: isSeason(g) ? 'season' : 'goal', label: g.name, amount: plan.remaining, currency: g.currency, link: `/goals/${g.id}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
