/**
 * Événements du coach liés à la famille et aux cérémonies — module PUR.
 *
 *  - `reserve_low`      : solde d'une réserve sous 25 % de son plafond ;
 *  - `reserve_refilled` : plafond atteint (célébration) ;
 *  - `season_upcoming`  : moment fort à 30 jours ou moins, épargne en retard ;
 *  - `obligation_due`   : soutien régulier à verser demain.
 *
 * Ils passent par la même politique que les autres (`planDelivery` :
 * dédoublonnage, délais, quotas de voix). Textes SOBRES : jamais de
 * bénéficiaire, de nom de défunt ni de libellé saisi par l'utilisateur dans
 * les paramètres (l'application peut être entendue par d'autres) — seulement
 * des montants (jamais lus à voix haute sans accord) et des libellés du catalogue.
 */
import type { SpaceData } from '../types';
import type { CurrencyCode } from '../money';
import { addDays, monthKey, toISODate, type ISODate } from '../dates';
import { activeReserves, reserveState } from '../reserve';
import { activeSeasons, seasonBehind, seasonPlanFor } from '../seasons';
import { obligationsDueTomorrow } from '../obligations';
import { SEVERITY_PRIORITY, type CoachEvent } from './events';

type Draft = Omit<CoachEvent, 'priority'> & { boost?: number };
const ev = ({ boost = 0, ...e }: Draft): CoachEvent => ({ ...e, priority: SEVERITY_PRIORITY[e.severity] + boost });

export function familyEvents(
  data: SpaceData,
  currency: CurrencyCode,
  today: ISODate,
  spaceId: string,
  now: number,
  opts: { firstName?: string | null; seasonLabel: (templateId: string | null | undefined) => string },
): CoachEvent[] {
  const out: CoachEvent[] = [];
  const month = monthKey(today);

  for (const g of activeReserves(data.goals, currency)) {
    const s = reserveState(g, data.goalContributions);
    if (s.full) {
      // Une célébration par remplissage : liée à l'apport qui a complété la réserve (ce mois-ci).
      const last = data.goalContributions
        .filter((c) => !c.deleted && c.goalId === g.id && c.amount > 0)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
      if (last && monthKey(last.date) === month) {
        out.push(ev({ id: `reserve_full_${g.id}_${last.id}`, kind: 'reserve_refilled', severity: 'celebration', boost: 6, spaceId, period: month, textKey: 'coach.reserve.refilled', params: { name: opts.firstName ?? '' }, pref: 'goalProgress', ref: { type: 'goal', id: g.id }, createdAt: now }));
      }
    } else if (s.low) {
      out.push(ev({ id: `reserve_low_${g.id}_${month}`, kind: 'reserve_low', severity: 'info', boost: 4, spaceId, period: month, textKey: 'coach.reserve.low', params: { balance: s.balance, target: s.target }, pref: 'goalProgress', ref: { type: 'goal', id: g.id }, createdAt: now }));
    }
  }

  for (const g of activeSeasons(data.goals)) {
    if (g.status !== 'active' || g.currency !== currency || !g.targetDate) continue;
    if (!seasonBehind(g, data.goalContributions, today, toISODate(new Date(g.createdAt)))) continue;
    const p = seasonPlanFor(g, data.goalContributions, today);
    out.push(
      ev({
        id: `season_upcoming_${g.id}_${g.targetDate}`,
        kind: 'season_upcoming',
        severity: 'advice',
        boost: 5,
        spaceId,
        period: today,
        textKey: 'coach.season.upcoming',
        // Libellé du CATALOGUE (jamais le nom saisi : « Funérailles de… » ne doit pas être lu).
        params: { event: opts.seasonLabel(g.templateId), days: p.daysLeft ?? 0, remaining: p.plan.remaining, weekly: p.weekly ?? 0 },
        pref: 'goalProgress',
        ref: { type: 'goal', id: g.id },
        createdAt: now,
      }),
    );
  }

  const tomorrow = addDays(today, 1);
  for (const r of obligationsDueTomorrow(data, today, currency)) {
    // Jamais le libellé (bénéficiaire) : un montant seulement, lu à voix haute uniquement avec accord.
    out.push(ev({ id: `obligation_due_${r.id}_${tomorrow}`, kind: 'obligation_due', severity: 'info', boost: 2, spaceId, period: tomorrow, textKey: 'coach.obligation.due', params: { amount: r.amount }, pref: 'debtDue', createdAt: now }));
  }
  return out;
}
