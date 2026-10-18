/**
 * Tontines dans le grand livre — argent disponible v2 (docs/argent-disponible.md §5.4).
 * Module PUR (testé : tests/argent-natures-rapports.test.ts, tests/argent-position.test.ts).
 *
 *  - Cotisation (tournante, collecteur) : un déplacement vers la tontine, la créance augmente.
 *  - Cagnotte reçue P (D5) : créance = cotisé − déjà reçu juste avant ;
 *      retour d'épargne = min(P, max(0, créance)) ;
 *      avance du groupe = P − retour (dette envers le groupe) ; JAMAIS un revenu.
 *  - Clôture du cycle (« terminée », ou dernière échéance passée) : écart = cotisé − reçu ;
 *      positif → frais de tontine (commission du collecteur comprise), négatif → gain ;
 *      ensuite la position vaut 0.
 *  - Cotisation sans tour (`fixed_contribution`, D6) : une dépense, aucune créance.
 */
import { buildSchedule } from './tontine';
import type { CurrencyCode } from './money';
import type { ISODate } from './dates';
import type { SpaceData, Tontine, TontineEntry } from './types';

const done = (tontineId: string, entries: TontineEntry[]) => entries.filter((e) => !e.deleted && e.tontineId === tontineId && e.status === 'done');
const byDate = (a: TontineEntry, b: TontineEntry) => a.date.localeCompare(b.date) || a.period - b.period;

/** Part « retour d'épargne » et part « avance du groupe » d'une cagnotte reçue. */
export function payoutSplit(t: Pick<Tontine, 'id'>, entries: TontineEntry[], payoutEntryId: string): { retour: number; avance: number } {
  const mine = done(t.id, entries);
  const payout = mine.find((e) => e.id === payoutEntryId && e.kind === 'payout');
  if (!payout) return { retour: 0, avance: 0 };
  let paid = 0;
  let received = 0;
  for (const e of mine) {
    if (e.kind === 'contribution' && e.date <= payout.date) paid += e.amount;
    // Cagnottes reçues AVANT celle-ci (même jour : la plus petite échéance d'abord).
    if (e.kind === 'payout' && e.id !== payout.id && byDate(e, payout) < 0) received += e.amount;
  }
  const retour = Math.min(payout.amount, Math.max(0, paid - received));
  return { retour, avance: payout.amount - retour };
}

/** Une tontine (tournante ou collecteur) est-elle close ? « Terminée », ou toutes ses échéances passées. */
function isClosed(t: Tontine, today: ISODate): boolean {
  if (t.type === 'fixed_contribution') return false;
  if (t.status === 'finished') return true;
  const schedule = buildSchedule(t);
  return schedule.length > 0 && schedule[schedule.length - 1].date < today;
}

export interface TontineClosure {
  closed: boolean;
  paid: number;
  received: number;
  /** Écart positif à la clôture : frais de tontine (commission du collecteur comprise). */
  fees: number;
  /** Écart négatif à la clôture : gain de tontine (un revenu). */
  gain: number;
}

export function tontineClosure(t: Tontine, entries: TontineEntry[], today: ISODate): TontineClosure {
  const mine = done(t.id, entries);
  const paid = mine.filter((e) => e.kind === 'contribution').reduce((n, e) => n + e.amount, 0);
  const received = mine.filter((e) => e.kind === 'payout').reduce((n, e) => n + e.amount, 0);
  const closed = isClosed(t, today);
  const gap = paid - received;
  return { closed, paid, received, fees: closed && gap > 0 ? gap : 0, gain: closed && gap < 0 ? -gap : 0 };
}

/**
 * Position de chaque tontine au patrimoine : créance (cotisé − reçu > 0) ou avance
 * du groupe (< 0). Une tontine close vaut 0 ; une cotisation sans tour, rien.
 * Une tontine en pause reste au patrimoine (§5.4).
 */
export function tontineLedgerPositions(data: Pick<SpaceData, 'tontines' | 'tontineEntries'>, currency: CurrencyCode, today: ISODate): { receivable: number; advance: number } {
  let receivable = 0;
  let advance = 0;
  for (const t of data.tontines) {
    if (t.deleted || t.currency !== currency || t.type === 'fixed_contribution') continue;
    const c = tontineClosure(t, data.tontineEntries, today);
    if (c.closed) continue;
    const net = c.paid - c.received;
    if (net > 0) receivable += net;
    else advance += -net;
  }
  return { receivable, advance };
}
