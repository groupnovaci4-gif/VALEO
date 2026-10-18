/**
 * Tontines dans le grand livre — argent disponible v2 (docs/argent-disponible.md §5.4).
 * Module PUR (testé : tests/argent-natures-rapports.test.ts, tests/argent-corrections.test.ts).
 *
 *  - Cotisation (tournante, collecteur) : un déplacement vers la tontine, la créance augmente.
 *  - Cagnotte reçue P (D5) : créance = cotisé − déjà reçu juste avant ;
 *      retour d'épargne = min(P, max(0, créance)) ;
 *      avance du groupe = P − retour (dette envers le groupe) ; JAMAIS un revenu.
 *  - Après la cagnotte, les cotisations REMBOURSENT l'avance jusqu'à extinction (Financement,
 *    pas épargne) : sur un cycle complet, l'épargne nette d'une tournante vaut 0 (E19c).
 *  - Clôture : toujours CONFIRMÉE par la personne (`status: 'finished'` + `closedAt`). Une
 *    dernière échéance passée ne fait que la PROPOSER (`closureSuggested`). À la clôture,
 *    écart = cotisé − reçu : positif → frais de tontine, négatif → gain ; aucune opération
 *    n'est créée (reclassement à la date de clôture) ; ensuite la position vaut 0.
 *  - Cotisation sans tour (`fixed_contribution`, D6) : une dépense, aucune créance.
 */
import { buildSchedule } from './tontine';
import type { CurrencyCode } from './money';
import type { ISODate } from './dates';
import type { SpaceData, Tontine, TontineEntry, Transaction } from './types';

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

/** Dernière échéance d'une tournante ou d'un collecteur (null : cotisation sans tour, sans fin). */
function lastDate(t: Tontine): ISODate | null {
  if (t.type === 'fixed_contribution') return null;
  const schedule = buildSchedule(t);
  return schedule.length ? schedule[schedule.length - 1].date : null;
}

/** Proposer la clôture (« Cette tontine semble terminée : la clôturer ? ») : dernière échéance passée, non clôturée (E19d). */
export function closureSuggested(t: Tontine, today: ISODate): boolean {
  if (t.deleted || t.status === 'finished') return false;
  const last = lastDate(t);
  return !!last && last < today;
}

export interface TontineClosure {
  /** Clôture confirmée par la personne (`status: 'finished'`). */
  closed: boolean;
  paid: number;
  received: number;
  /** Écart positif à la clôture : frais de tontine (commission du collecteur comprise). */
  fees: number;
  /** Écart négatif à la clôture : gain de tontine (un revenu). */
  gain: number;
}

export function tontineClosure(t: Tontine, entries: TontineEntry[], _today?: ISODate): TontineClosure {
  const mine = done(t.id, entries);
  const paid = mine.filter((e) => e.kind === 'contribution').reduce((n, e) => n + e.amount, 0);
  const received = mine.filter((e) => e.kind === 'payout').reduce((n, e) => n + e.amount, 0);
  const closed = t.type !== 'fixed_contribution' && t.status === 'finished';
  const gap = paid - received;
  return { closed, paid, received, fees: closed && gap > 0 ? gap : 0, gain: closed && gap < 0 ? -gap : 0 };
}

export interface TontineMovement {
  date: ISODate;
  kind: 'contribution' | 'payout';
  amount: number;
  /** Opération réelle liée (pour savoir quel compte a payé ou reçu). */
  transactionId: string | null;
  /** Cotisation : part d'épargne (créance) et part qui rembourse l'avance du groupe. */
  savings: number;
  repay: number;
  /** Cagnotte : retour d'épargne et avance du groupe. */
  retour: number;
  avance: number;
}

/**
 * Mouvements d'une tontine dans l'ordre (le même jour, la cotisation avant la cagnotte),
 * avec leur part d'épargne et de financement. Source : les entrées du carnet si la tontine
 * en a, sinon les opérations qui lui sont liées.
 */
export function tontineMovements(t: Pick<Tontine, 'id'>, entries: TontineEntry[], transactions: Transaction[]): TontineMovement[] {
  const mine = done(t.id, entries).filter((e) => e.kind === 'contribution' || e.kind === 'payout');
  const raw: { date: ISODate; kind: 'contribution' | 'payout'; amount: number; transactionId: string | null; order: number }[] = mine.length
    ? mine.map((e) => ({ date: e.date, kind: e.kind as 'contribution' | 'payout', amount: e.amount, transactionId: e.transactionId ?? null, order: e.period }))
    : transactions
        .filter((x) => !x.deleted && x.tontineId === t.id && (x.type === 'expense' || x.type === 'income'))
        .map((x) => ({ date: x.date, kind: x.type === 'expense' ? ('contribution' as const) : ('payout' as const), amount: x.amount, transactionId: x.id, order: 0 }));
  raw.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.order - b.order : a.kind === 'contribution' ? -1 : 1));
  let paid = 0;
  let received = 0;
  return raw.map((m) => {
    if (m.kind === 'contribution') {
      const repay = Math.min(m.amount, Math.max(0, received - paid));
      paid += m.amount;
      return { ...m, savings: m.amount - repay, repay, retour: 0, avance: 0 };
    }
    const retour = Math.min(m.amount, Math.max(0, paid - received));
    received += m.amount;
    return { ...m, savings: 0, repay: 0, retour, avance: m.amount - retour };
  });
}

/**
 * Position de chaque tontine au patrimoine : créance (cotisé − reçu > 0) ou avance
 * du groupe (< 0). Une tontine clôturée vaut 0 ; une cotisation sans tour, rien.
 * Une tontine en pause ou dont la dernière échéance est passée reste au patrimoine.
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
