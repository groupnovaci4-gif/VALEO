/**
 * Tontines — module PUR (carnet de suivi : aucun argent n'est collecté,
 * détenu ni transféré par l'application).
 *
 * Trois types :
 *  - `rotating` (tournante) : chaque échéance, chacun verse sa mise ; à chaque
 *    tour, une main reçoit la cagnotte. Ma cotisation = mise × mains détenues ;
 *    cagnotte = `potAmount` saisi (frais retenus), sinon mise × mains au total.
 *    À chacun de mes tours je reçois une cagnotte entière par main ; une
 *    demi-main reçoit la moitié de la cagnotte du tour partagé.
 *  - `collector` (épargne avec un collecteur) : une mise par échéance pendant
 *    `cycleDays` jours, rendue en fin de cycle moins la commission SAISIE.
 *  - `fixed_contribution` : cotisation régulière, sans redistribution.
 * Aucune règle locale n'est inventée : frais, commission, pénalités et ordre
 * des tours viennent de l'utilisateur.
 */
import type { Category, RecurringRule, SpaceData, Tontine, TontineEntry, TontineFrequency } from './types';
import type { CurrencyCode } from './money';
import { addDays, addMonths, diffDays, endOfMonth, monthKey, type ISODate, type MonthKey } from './dates';

/** Échéances générées au plus pour une cotisation sans fin (fixe). */
export const OPEN_ENDED_MAX = 400;
/** Horizon par défaut d'une cotisation fixe : un an après aujourd'hui. */
export const OPEN_ENDED_DAYS = 366;

const STEP_DAYS: Record<Exclude<TontineFrequency, 'monthly' | 'custom'>, number> = { daily: 1, weekly: 7, biweekly: 14 };

/** Date de la i-ième échéance (0 = première). Mensuel : jour borné (31 janvier → 28/29 février). */
export function nthDate(t: Pick<Tontine, 'frequency' | 'startDate' | 'customDays'>, i: number): ISODate {
  if (t.frequency === 'monthly') return addMonths(t.startDate, i);
  const step = t.frequency === 'custom' ? Math.max(1, t.customDays ?? 1) : STEP_DAYS[t.frequency];
  return addDays(t.startDate, i * step);
}

/** Ma cotisation par échéance (mise × mains), arrondie à l'unité. */
export function myContribution(t: Pick<Tontine, 'amountPerShare' | 'sharesHeld'>): number {
  return Math.round(t.amountPerShare * Math.max(0, t.sharesHeld));
}

/** Cagnotte d'un tour (tournante) : saisie si l'organisateur retient des frais, sinon mise × mains au total. */
export function potOf(t: Pick<Tontine, 'amountPerShare' | 'membersCount' | 'potAmount'>): number {
  if (t.potAmount && t.potAmount > 0) return t.potAmount;
  return Math.round(t.amountPerShare * Math.max(0, t.membersCount ?? 0));
}

/** Part de cagnotte de chacun de mes tours : 1 par main entière, la fraction (demi-main) sur le dernier. */
export function turnShares(t: Pick<Tontine, 'myTurns' | 'sharesHeld'>): Map<number, number> {
  const turns = [...new Set(t.myTurns ?? [])].sort((a, b) => a - b);
  const full = Math.floor(t.sharesHeld);
  const frac = Math.round((t.sharesHeld - full) * 100) / 100;
  const out = new Map<number, number>();
  turns.forEach((turn, i) => out.set(turn, i < full ? 1 : i === full && frac > 0 ? frac : 0));
  return out;
}

/** Nombre de tours attendus pour mes mains (validation de la saisie). */
export function expectedTurns(sharesHeld: number): number {
  return Math.ceil(Math.max(0, sharesHeld) - 1e-9);
}

export interface ScheduleItem {
  /** Numéro d'échéance (1 = première). */
  period: number;
  date: ISODate;
  /** Ma cotisation à cette échéance. */
  contribution: number;
  /** Tournante : numéro du tour (= échéance) ; null sinon. */
  turn: number | null;
  /** Je reçois à cette échéance (« Vous » ; sinon « Tour n »). */
  mine: boolean;
  /** Cagnotte du tour (tournante) ou montant rendu (collecteur, dernière échéance). */
  pot: number | null;
  /** Ce que JE reçois à cette échéance (0 si ce n'est pas mon tour). */
  payout: number;
}

/** Nombre d'échéances : tours (tournante), mises du cycle (collecteur), horizon (fixe). */
function periodCount(t: Tontine, until: ISODate): number {
  if (t.type === 'rotating') return Math.max(0, Math.floor(t.membersCount ?? 0));
  if (t.type === 'collector') {
    const days = Math.max(1, t.cycleDays ?? 0);
    let n = 0;
    while (n < OPEN_ENDED_MAX && diffDays(t.startDate, nthDate(t, n)) < days) n++;
    return n;
  }
  let n = 0;
  while (n < OPEN_ENDED_MAX && nthDate(t, n) <= until) n++;
  return n;
}

/** Montant total d'un cycle de collecteur et montant rendu (moins la commission saisie). */
export function collectorTotals(t: Tontine): { total: number; commission: number; returned: number; count: number; percent: number } {
  const count = periodCount(t, t.startDate);
  const total = myContribution(t) * count;
  const commission = Math.max(0, t.collectorCommission ?? 0);
  return { total, commission, returned: Math.max(0, total - commission), count, percent: total > 0 ? Math.round((commission / total) * 1000) / 10 : 0 };
}

/**
 * Échéancier calculé : dates des cotisations, tour, bénéficiaire, cagnotte.
 * `until` : horizon d'une cotisation fixe (sans fin) ; défaut : un an après le début.
 */
export function buildSchedule(t: Tontine, opts: { until?: ISODate } = {}): ScheduleItem[] {
  const until = opts.until ?? addDays(t.startDate, OPEN_ENDED_DAYS);
  const n = periodCount(t, until);
  const mine = myContribution(t);
  const items: ScheduleItem[] = [];
  if (t.type === 'rotating') {
    const pot = potOf(t);
    const shares = turnShares(t);
    for (let p = 1; p <= n; p++) {
      const share = shares.get(p) ?? 0;
      items.push({ period: p, date: nthDate(t, p - 1), contribution: mine, turn: p, mine: share > 0, pot, payout: Math.round(pot * share) });
    }
    return items;
  }
  for (let p = 1; p <= n; p++) items.push({ period: p, date: nthDate(t, p - 1), contribution: mine, turn: null, mine: false, pot: null, payout: 0 });
  if (t.type === 'collector' && items.length) {
    const last = items[items.length - 1];
    const { returned } = collectorTotals(t);
    Object.assign(last, { mine: true, pot: returned, payout: returned });
  }
  return items;
}

// ─── État : payé, reporté, en retard ─────────────────────────────────

export type ItemStatus = 'done' | 'late' | 'due' | 'postponed';

export interface ItemState extends ScheduleItem {
  status: ItemStatus;
  /** Date à laquelle la cotisation est attendue (reportée le cas échéant). */
  dueDate: ISODate;
  /** Ma cagnotte de ce tour a été reçue et confirmée. */
  received: boolean;
}

const entriesOf = (tontineId: string, entries: TontineEntry[]) => entries.filter((e) => !e.deleted && e.tontineId === tontineId);

/**
 * Statut de chaque échéance : `done` (cotisation enregistrée), `postponed`
 * (reportée, pas encore échue), `late` (échue sans cotisation), `due` (à venir).
 */
export function scheduleState(t: Tontine, entries: TontineEntry[], today: ISODate, opts: { until?: ISODate } = {}): ItemState[] {
  const mine = entriesOf(t.id, entries);
  const until = opts.until ?? (t.type === 'fixed_contribution' ? addDays(today, 62) : undefined);
  return buildSchedule(t, { until }).map((item) => {
    const c = mine.find((e) => e.kind === 'contribution' && e.period === item.period);
    const received = mine.some((e) => e.kind === 'payout' && e.period === item.period && e.status === 'done');
    if (c?.status === 'done') return { ...item, status: 'done', dueDate: item.date, received };
    const dueDate = c?.status === 'planned' && c.date > item.date ? c.date : item.date;
    const status: ItemStatus = dueDate < today ? 'late' : c?.status === 'planned' && c.date > item.date ? 'postponed' : 'due';
    return { ...item, status, dueDate, received };
  });
}

/** Prochaine cotisation à faire (la plus ancienne en retard d'abord). */
export function nextContribution(states: ItemState[]): ItemState | null {
  return states.find((s) => s.status !== 'done' && s.contribution > 0) ?? null;
}

/** Prochaine échéance où je reçois (cagnotte non encore reçue). */
export function nextPayout(states: ItemState[]): ItemState | null {
  return states.find((s) => s.payout > 0 && !s.received) ?? null;
}

// ─── Position nette ───────────────────────────────────────────────────

export type NetPosition =
  | {
      type: 'rotating';
      /** Avant mon (premier) tour, entre deux de mes tours, après, cycle terminé. */
      phase: 'before' | 'between' | 'after' | 'finished';
      paid: number;
      received: number;
      /** paid − received : > 0 épargne (créance sur le groupe), < 0 crédit sans intérêt (dette envers le groupe). */
      net: number;
      next: { turn: number; date: ISODate; amount: number } | null;
      remainingToPay: number;
      remainingCount: number;
      /** Tours effectués (échéances passées ou payées) / tours au total. */
      currentTurn: number;
      totalTurns: number;
    }
  | { type: 'collector'; paid: number; commission: number; expected: number; date: ISODate | null; received: boolean; percent: number }
  | { type: 'fixed_contribution'; paid: number; next: { date: ISODate; amount: number } | null };

export function netPosition(t: Tontine, entries: TontineEntry[], today: ISODate): NetPosition {
  const mine = entriesOf(t.id, entries);
  const paid = mine.filter((e) => e.kind === 'contribution' && e.status === 'done').reduce((n, e) => n + e.amount, 0);
  const received = mine.filter((e) => e.kind === 'payout' && e.status === 'done').reduce((n, e) => n + e.amount, 0);
  const states = scheduleState(t, entries, today);
  if (t.type === 'collector') {
    const c = collectorTotals(t);
    return { type: 'collector', paid, commission: c.commission, expected: c.returned, date: states.length ? states[states.length - 1].date : null, received: received > 0, percent: c.percent };
  }
  if (t.type === 'fixed_contribution') {
    const n = nextContribution(states);
    return { type: 'fixed_contribution', paid, next: n ? { date: n.dueDate, amount: n.contribution } : null };
  }
  const unpaid = states.filter((s) => s.status !== 'done');
  const myItems = states.filter((s) => s.payout > 0);
  const pending = myItems.filter((s) => !s.received);
  const next = pending[0] ? { turn: pending[0].turn ?? pending[0].period, date: pending[0].date, amount: pending[0].payout } : null;
  const phase = received <= 0 ? 'before' : pending.length ? 'between' : unpaid.length ? 'after' : 'finished';
  const currentTurn = states.filter((s) => s.date <= today || s.status === 'done').length;
  return {
    type: 'rotating',
    phase,
    paid,
    received,
    net: paid - received,
    next,
    remainingToPay: unpaid.reduce((n, s) => n + s.contribution, 0),
    remainingCount: unpaid.length,
    currentTurn: Math.min(currentTurn, states.length),
    totalTurns: states.length,
  };
}

/** Tontines suivies (actives) dans une devise. */
export function activeTontines(tontines: Tontine[], currency?: CurrencyCode): Tontine[] {
  return tontines.filter((t) => !t.deleted && t.status === 'active' && (!currency || t.currency === currency));
}

/** Une récurrence d'origine encore active compte déjà ces cotisations (reste par jour) : pas de double comptage. */
export function countedByRecurring(t: Pick<Tontine, 'linkedRecurringId'>, recurring: Pick<RecurringRule, 'id' | 'active' | 'deleted'>[]): boolean {
  return !!t.linkedRecurringId && recurring.some((r) => r.id === t.linkedRecurringId && r.active && !r.deleted);
}

/**
 * Cotisations du mois pas encore versées (pour le reste par jour, comme des
 * récurrences à venir). Une cagnotte attendue n'est JAMAIS comptée : elle ne
 * le sera qu'une fois reçue et confirmée (opération de revenu).
 */
export function tontineDueThisMonth(data: Pick<SpaceData, 'tontines' | 'tontineEntries' | 'recurring'>, currency: CurrencyCode, today: ISODate): number {
  const month = monthKey(today);
  let total = 0;
  for (const t of activeTontines(data.tontines, currency)) {
    if (countedByRecurring(t, data.recurring)) continue;
    for (const s of scheduleState(t, data.tontineEntries, today, { until: endOfMonth(today) })) {
      if (s.status !== 'done' && monthKey(s.dueDate) === month) total += s.contribution;
    }
  }
  return total;
}

/** Échéances non payées dans les `days` prochains jours (accueil : 3 jours), en retard comprises. */
export function upcomingDue(data: Pick<SpaceData, 'tontines' | 'tontineEntries'>, today: ISODate, days: number): { tontine: Tontine; item: ItemState }[] {
  const limit = addDays(today, days);
  const out: { tontine: Tontine; item: ItemState }[] = [];
  for (const t of activeTontines(data.tontines)) {
    for (const s of scheduleState(t, data.tontineEntries, today, { until: limit })) {
      if (s.status !== 'done' && s.contribution > 0 && s.dueDate <= limit) out.push({ tontine: t, item: s });
    }
  }
  return out.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate));
}

/** Rappels : la veille et le jour même de chaque cotisation à venir (au plus `max`). */
export function tontineReminders(data: Pick<SpaceData, 'tontines' | 'tontineEntries'>, today: ISODate, opts: { days?: number; max?: number } = {}): { tontineId: string; period: number; date: ISODate; when: 'eve' | 'day' }[] {
  const out: { tontineId: string; period: number; date: ISODate; when: 'eve' | 'day' }[] = [];
  for (const { tontine, item } of upcomingDue(data, today, opts.days ?? 30)) {
    if (item.dueDate < today) continue;
    const eve = addDays(item.dueDate, -1);
    if (eve >= today) out.push({ tontineId: tontine.id, period: item.period, date: eve, when: 'eve' });
    out.push({ tontineId: tontine.id, period: item.period, date: item.dueDate, when: 'day' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, opts.max ?? 20);
}

/**
 * Patrimoine : position de chaque tontine tournante (et collecteur avant
 * remise) — créance avant mon tour, dette envers le groupe après.
 */
export function tontinePositions(data: Pick<SpaceData, 'tontines' | 'tontineEntries'>, currency: CurrencyCode, today: ISODate): { receivable: number; liability: number } {
  let receivable = 0;
  let liability = 0;
  for (const t of data.tontines) {
    if (t.deleted || t.status === 'paused' || t.currency !== currency) continue;
    const p = netPosition(t, data.tontineEntries, today);
    if (p.type === 'rotating') {
      if (p.net > 0) receivable += p.net;
      else liability += -p.net;
    } else if (p.type === 'collector' && !p.received) receivable += p.paid;
  }
  return { receivable, liability };
}

/** Toutes les cotisations dues le mois `month` ont-elles été faites au plus tard à leur date ? (≥ 1 cotisation) */
export function allOnTime(data: Pick<SpaceData, 'tontines' | 'tontineEntries'>, month: MonthKey, currency: CurrencyCode): boolean {
  let count = 0;
  for (const t of data.tontines) {
    if (t.deleted || t.currency !== currency) continue;
    const entries = entriesOf(t.id, data.tontineEntries);
    for (const s of buildSchedule(t, { until: endOfMonth(`${month}-01`) })) {
      if (monthKey(s.date) !== month || s.contribution <= 0) continue;
      const c = entries.find((e) => e.kind === 'contribution' && e.period === s.period && e.status === 'done');
      if (!c || c.date > s.date) return false;
      count++;
    }
  }
  return count > 0;
}


// ─── Saisie : validation et conversion ───────────────────────────────

export type TontineDraftError = 'name' | 'amount' | 'shares' | 'members' | 'turns' | 'cycle' | 'commission' | 'customDays';

/** Contrôle d'une tontine saisie (aucune valeur imposée : seulement la cohérence). */
export function validateTontine(t: Pick<Tontine, 'type' | 'name' | 'amountPerShare' | 'sharesHeld' | 'frequency' | 'customDays' | 'membersCount' | 'myTurns' | 'cycleDays' | 'collectorCommission'>): TontineDraftError[] {
  const errors: TontineDraftError[] = [];
  if (!t.name.trim()) errors.push('name');
  if (!(t.amountPerShare > 0)) errors.push('amount');
  if (!(t.sharesHeld > 0) || Math.round(t.sharesHeld * 2) !== t.sharesHeld * 2) errors.push('shares');
  if (t.frequency === 'custom' && !((t.customDays ?? 0) >= 1)) errors.push('customDays');
  if (t.type === 'rotating') {
    const n = t.membersCount ?? 0;
    if (!(n >= 2) || n < t.sharesHeld) errors.push('members');
    const turns = t.myTurns ?? [];
    if (turns.length !== expectedTurns(t.sharesHeld) || new Set(turns).size !== turns.length || turns.some((x) => !Number.isInteger(x) || x < 1 || x > n)) errors.push('turns');
  }
  if (t.type === 'collector') {
    if (!((t.cycleDays ?? 0) >= 1)) errors.push('cycle');
    if ((t.collectorCommission ?? 0) < 0) errors.push('commission');
  }
  return errors;
}

/**
 * Brouillon de tontine à partir d'une récurrence de tontine existante
 * (conversion proposée, jamais imposée). La récurrence reste intacte.
 */
export function tontineFromRecurring(rule: RecurringRule): Omit<Tontine, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> {
  const frequency: TontineFrequency = rule.frequency === 'yearly' ? 'custom' : rule.frequency;
  return {
    type: 'rotating',
    name: rule.label,
    organizerName: null,
    currency: rule.currency,
    amountPerShare: rule.amount,
    sharesHeld: 1,
    frequency,
    customDays: rule.frequency === 'yearly' ? 365 : null,
    startDate: rule.startDate,
    membersCount: null,
    myTurns: [],
    potAmount: null,
    organizerFee: null,
    latePenalty: null,
    cycleDays: null,
    collectorCommission: null,
    accountId: rule.accountId,
    status: 'active',
    linkedRecurringId: rule.id,
  };
}

/** Sous-catégorie « Tontine » (identifiant stable, quel que soit son parent). */
export const TONTINE_SUBCATEGORY = 'sub_informal_tontine';

/**
 * Opération ou récurrence de tontine, reconnue PAR IDENTIFIANT : ancienne
 * catégorie « Tontines et cotisations » (`cat_informal`), ou sous-catégorie
 * « Tontine », quel que soit son parent (1.8 : « Finance sociale & obligations »).
 */
export function isTontineCategory(categoryId?: string | null, subcategoryId?: string | null): boolean {
  return categoryId === 'cat_informal' || subcategoryId === TONTINE_SUBCATEGORY;
}

/**
 * Catégorie d'une cotisation, retrouvée par identifiant : le parent ACTUEL de
 * la sous-catégorie « Tontine » (avant la mise à jour 1.8 : `cat_informal` ;
 * après, ou pour un nouvel utilisateur : `cat_social`), sinon l'ancienne
 * catégorie, sinon « Finance sociale », sinon « Autres ». Jamais par libellé.
 */
export function tontineContributionCategory(categories: Pick<Category, 'id' | 'parentId' | 'deleted'>[]): { categoryId: string; subcategoryId: string | null } {
  const live = (id: string) => categories.find((c) => c.id === id && !c.deleted);
  const sub = live(TONTINE_SUBCATEGORY);
  if (sub?.parentId && live(sub.parentId)) return { categoryId: sub.parentId, subcategoryId: TONTINE_SUBCATEGORY };
  for (const id of ['cat_informal', 'cat_social']) if (live(id)) return { categoryId: id, subcategoryId: null };
  return { categoryId: 'cat_other', subcategoryId: null };
}

/** Récurrence de tontine pas encore convertie. */
export function convertibleRecurring(data: Pick<SpaceData, 'recurring' | 'tontines'>): RecurringRule[] {
  const linked = new Set(data.tontines.filter((t) => !t.deleted).map((t) => t.linkedRecurringId));
  return data.recurring.filter((r) => !r.deleted && r.type === 'expense' && isTontineCategory(r.categoryId, r.subcategoryId) && !linked.has(r.id));
}
