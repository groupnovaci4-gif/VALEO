/**
 * Événements du coach liés aux tontines — module PUR, branché sur le moteur
 * existant (`CoachEvent`, `planDelivery` : dédoublonnage, délais, quotas de voix).
 *
 *  - `tontine_due`         : cotisation demain ;
 *  - `tontine_late`        : échéance passée sans cotisation ;
 *  - `tontine_payout_soon` : ma cagnotte dans 7 jours ou moins ;
 *  - `tontine_all_on_time` : toutes les cotisations du mois dernier à l'heure (célébration).
 *
 * Les montants restent des paramètres (jamais lus à voix haute sans
 * `speakAmounts` : variantes `.voice` sans montant ni nom de tontine).
 */
import type { SpaceData } from '../types';
import type { CurrencyCode } from '../money';
import { addDays, diffDays, monthKey, previousMonth, type ISODate } from '../dates';
import { activeTontines, allOnTime, scheduleState } from '../tontine';
import { SEVERITY_PRIORITY, type CoachEvent } from './events';

/** Fenêtre de « ma cagnotte arrive bientôt ». */
export const PAYOUT_SOON_DAYS = 7;

type Draft = Omit<CoachEvent, 'priority'> & { boost?: number };
const ev = ({ boost = 0, ...e }: Draft): CoachEvent => ({ ...e, priority: SEVERITY_PRIORITY[e.severity] + boost });

export function tontineEvents(data: Pick<SpaceData, 'tontines' | 'tontineEntries'>, currency: CurrencyCode, today: ISODate, spaceId: string, now: number, opts: { firstName?: string | null } = {}): CoachEvent[] {
  const out: CoachEvent[] = [];
  const tomorrow = addDays(today, 1);
  for (const t of activeTontines(data.tontines, currency)) {
    for (const s of scheduleState(t, data.tontineEntries, today, { until: addDays(today, PAYOUT_SOON_DAYS) })) {
      if (s.status === 'late' && s.contribution > 0) {
        out.push(ev({ id: `tontine_late_${t.id}_${s.period}`, kind: 'tontine_late', severity: 'warning', boost: 3, spaceId, period: s.dueDate, textKey: 'coach.tontine.late', params: { name: t.name, amount: s.contribution, days: diffDays(s.dueDate, today) }, pref: 'tontineDue', createdAt: now }));
      } else if (s.status !== 'done' && s.dueDate === tomorrow && s.contribution > 0) {
        out.push(ev({ id: `tontine_due_${t.id}_${s.period}`, kind: 'tontine_due', severity: 'info', boost: 4, spaceId, period: tomorrow, textKey: 'coach.tontine.due', params: { name: t.name, amount: s.contribution }, pref: 'tontineDue', createdAt: now }));
      }
      const days = diffDays(today, s.date);
      if (s.payout > 0 && !s.received && days >= 0 && days <= PAYOUT_SOON_DAYS) {
        out.push(ev({ id: `tontine_payout_${t.id}_${s.period}`, kind: 'tontine_payout_soon', severity: 'info', boost: 5, spaceId, period: s.date, textKey: 'coach.tontine.payout', params: { name: t.name, amount: s.payout, days }, pref: 'tontineDue', createdAt: now }));
      }
    }
  }
  const prev = previousMonth(monthKey(today));
  if (allOnTime(data, prev, currency)) {
    out.push(ev({ id: `tontine_on_time_${prev}`, kind: 'tontine_all_on_time', severity: 'celebration', boost: 3, spaceId, period: prev, textKey: 'coach.tontine.onTime', params: { name: opts.firstName ?? '' }, pref: 'tontineDue', createdAt: now }));
  }
  return out;
}
