/**
 * Le mois en cours en UN seul calcul (audit I1, I2, I5) — celui des rapports (`periodReport`, qui
 * connaît les clôtures de tontine), utilisé par l'accueil, l'IA et les rapports :
 *  - revenus « perçus » et dépenses « réglées » : du 1er à AUJOURD'HUI ;
 *  - « À venir ce mois » : les opérations datées après aujourd'hui, jusqu'à la fin du mois ;
 *  - une ligne par AUTRE devise (jamais convertie, jamais additionnée).
 * Module PUR.
 */
import { periodReport, type LedgerData } from './ledger';
import { addDays, endOfMonth, monthKey, type ISODate } from './dates';
import type { CurrencyCode } from './money';

export interface MonthSummary {
  income: number;
  expense: number;
  /** Épargne nette du mois, jusqu'à aujourd'hui. */
  savings: number;
  upcoming: { income: number; expense: number };
  others: { currency: CurrencyCode; income: number; expense: number }[];
}

/** Bornes du mois de `today` : réalisé (1er → aujourd'hui) et à venir (demain → fin du mois). */
export function monthRanges(today: ISODate) {
  const start = `${monthKey(today)}-01`;
  const end = endOfMonth(today);
  return { done: { start, end: today }, upcoming: { start: addDays(today, 1), end } };
}

/** Revenus et dépenses de la période dans chaque AUTRE devise (rapports, accueil) : jamais convertis. */
export function otherCurrencyFlows(d: LedgerData, currency: CurrencyCode, period: { start: ISODate; end: ISODate }): MonthSummary['others'] {
  const curs = new Set<CurrencyCode>();
  for (const t of d.transactions) if (!t.deleted && t.currency !== currency && t.date >= period.start && t.date <= period.end) curs.add(t.currency as CurrencyCode);
  return [...curs]
    .sort()
    .map((cur) => {
      const o = periodReport(d, period, cur);
      return { currency: cur, income: o.revenus, expense: o.depenses };
    })
    .filter((o) => o.income !== 0 || o.expense !== 0);
}

export function monthSummary(d: LedgerData, currency: CurrencyCode, today: ISODate): MonthSummary {
  const r = monthRanges(today);
  const done = periodReport(d, r.done, currency);
  const next = r.upcoming.start <= r.upcoming.end ? periodReport(d, r.upcoming, currency) : null;
  const others = otherCurrencyFlows(d, currency, r.done);
  return {
    income: done.revenus,
    expense: done.depenses,
    savings: done.epargneNette,
    upcoming: { income: next?.revenus ?? 0, expense: next?.depenses ?? 0 },
    others,
  };
}
