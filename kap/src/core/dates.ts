/**
 * Dates « civiles » : les opérations portent une date locale 'YYYY-MM-DD'
 * (ISODate), sans heure ni fuseau, pour qu'une dépense saisie le 31 au soir
 * ne bascule pas au mois suivant selon le fuseau du serveur.
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type MonthKey = string; // 'YYYY-MM'

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** 'YYYY-MM-DD' → Date locale à midi (évite les sauts d'heure d'été). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function monthKey(date: ISODate | Date): MonthKey {
  const s = typeof date === 'string' ? date : toISODate(date);
  return s.slice(0, 7);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Ajoute des mois en bornant le jour (31 janvier + 1 mois = 28/29 février). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = parseISODate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const d = parseISODate(date);
  return `${date.slice(0, 7)}-${pad(daysInMonth(d.getFullYear(), d.getMonth()))}`;
}

export function previousMonth(key: MonthKey): MonthKey {
  return monthKey(addMonths(`${key}-01`, -1));
}

export function nextMonth(key: MonthKey): MonthKey {
  return monthKey(addMonths(`${key}-01`, 1));
}

/** Nombre de jours entre deux dates (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/**
 * Nombre de mois ENTIERS restants pour atteindre `target` depuis `from`,
 * au minimum 1 si la date est dans le futur, 0 si elle est passée.
 * Ex. du 4 oct. 2026 au 31 déc. 2028 → 26 mois.
 */
export function monthsUntil(from: ISODate, target: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(target);
  if (b.getTime() <= a.getTime()) return 0;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(1, months);
}

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export interface Period {
  kind: PeriodKind;
  start: ISODate;
  end: ISODate; // inclus
}

/** Période (jour, semaine ISO lundi-dimanche, mois, année) contenant `date`. */
export function periodOf(kind: PeriodKind, date: ISODate): Period {
  switch (kind) {
    case 'day':
      return { kind, start: date, end: date };
    case 'week': {
      const d = parseISODate(date);
      const dow = (d.getDay() + 6) % 7; // lundi = 0
      const start = addDays(date, -dow);
      return { kind, start, end: addDays(start, 6) };
    }
    case 'month':
      return { kind, start: startOfMonth(date), end: endOfMonth(date) };
    case 'year':
      return { kind, start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` };
  }
}

/** Période précédente de même nature. */
export function previousPeriod(p: Period): Period {
  switch (p.kind) {
    case 'day':
      return periodOf('day', addDays(p.start, -1));
    case 'week':
      return periodOf('week', addDays(p.start, -7));
    case 'month':
      return periodOf('month', addMonths(p.start, -1));
    case 'year':
      return periodOf('year', addMonths(p.start, -12));
  }
}

export function inPeriod(date: ISODate, p: { start: ISODate; end: ISODate }): boolean {
  return date >= p.start && date <= p.end;
}

/** Les `count` dernières clés de mois, la plus ancienne en premier. */
export function lastMonths(count: number, ref: ISODate): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(monthKey(addMonths(startOfMonth(ref), -i)));
  return out;
}
