/**
 * Tontine partagée (étape 3) — partie PURE de l'application : ce que chacun
 * a le droit de voir, échéancier, rappels locaux, résumé de cycle.
 *
 * Le serveur fait foi (firebase/functions/src/tontineGroup.ts) ; les statuts et
 * les dates sont dupliqués ici à l'identique (parité testée). Aucun argent ne
 * transite : on suit des statuts. Un groupe rejoint n'est PAS une tontine
 * personnelle (aucune limite de formule n'est consommée) : `asPersonalView`
 * le présente aux calculs existants du carnet, en mémoire seulement.
 */
import { nthDate } from './tontine';
import type { ISODate } from './dates';
import type { CurrencyCode } from './money';
import type { Tontine, TontineFrequency } from './types';

export interface GroupSlot {
  slotId: string;
  turnOrder: number;
  uid: string | null;
  label: string | null;
  former?: boolean;
}

export interface TontineGroup {
  id: string;
  name: string;
  type: 'rotating';
  currency: CurrencyCode;
  amountPerShare: number;
  frequency: TontineFrequency;
  customDays: number | null;
  cycleStart: ISODate;
  cycle: number;
  potAmount: number | null;
  organizerUid: string;
  treasurerUid: string | null;
  memberUids: string[];
  slots: GroupSlot[];
  paid: Record<string, true>;
  drawnAt: number | null;
  status: 'active' | 'orphaned';
  createdAt: number;
  updatedAt: number;
}

export interface GroupPayment {
  cycle: number;
  period: number;
  slotId: string;
  uid: string | null;
  status: 'declared' | 'confirmed' | 'disputed';
  declaredBy: string | null;
  confirmedBy: string | null;
}

export type SlotStatus = 'paid' | 'not_yet' | 'declared' | 'disputed' | 'late';

export const paidKey = (cycle: number, period: number, slotId: string) => `${cycle}_${period}_${slotId}`;
export const isGroupManager = (g: Pick<TontineGroup, 'organizerUid' | 'treasurerUid'>, uid: string | null | undefined) => !!uid && (g.organizerUid === uid || g.treasurerUid === uid);

/** Date d'échéance du tour `period` (1 = premier) du cycle en cours. */
export function periodDate(g: Pick<TontineGroup, 'frequency' | 'cycleStart' | 'customDays'>, period: number): ISODate {
  return nthDate({ frequency: g.frequency, startDate: g.cycleStart, customDays: g.customDays }, period - 1);
}

/** Échéancier du cycle : une échéance par place ; le bénéficiaire est la place dont c'est le tour. */
export function groupSchedule(g: Pick<TontineGroup, 'frequency' | 'cycleStart' | 'customDays' | 'slots'>): { period: number; date: ISODate; beneficiarySlotId: string | null }[] {
  return g.slots.map((_, k) => ({
    period: k + 1,
    date: periodDate(g, k + 1),
    beneficiarySlotId: g.slots.find((s) => s.turnOrder === k + 1)?.slotId ?? null,
  }));
}

/**
 * Statut d'une place pour un tour, vu par `viewer` (décision 7 du fondateur) :
 * tous voient « payé » ou « pas encore » ; « déclaré », « contesté » et « en
 * retard » seulement l'organisateur, le trésorier et la personne concernée.
 */
export function slotStatusFor(g: TontineGroup, payment: GroupPayment | null, slot: GroupSlot, period: number, viewer: string, today: ISODate): SlotStatus {
  if (g.paid[paidKey(g.cycle, period, slot.slotId)]) return 'paid';
  const insider = isGroupManager(g, viewer) || (!!slot.uid && slot.uid === viewer);
  if (!insider) return 'not_yet';
  if (payment?.status === 'declared') return 'declared';
  if (payment?.status === 'disputed') return 'disputed';
  return today > periodDate(g, period) ? 'late' : 'not_yet';
}

/** Mes places (une place = une main). */
export const mySlots = (g: Pick<TontineGroup, 'slots'>, uid: string) => g.slots.filter((s) => s.uid === uid);

/**
 * Vue « carnet » en MÉMOIRE (jamais enregistrée) : permet de réutiliser les
 * rappels et l'échéancier du carnet personnel sans compter dans ses limites.
 */
export function asPersonalView(g: TontineGroup, uid: string): Tontine {
  const mine = mySlots(g, uid);
  return {
    id: `group:${g.id}`,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    createdBy: g.organizerUid,
    type: 'rotating',
    name: g.name,
    organizerName: null,
    currency: g.currency,
    amountPerShare: g.amountPerShare,
    sharesHeld: mine.length,
    frequency: g.frequency,
    customDays: g.customDays,
    startDate: g.cycleStart,
    membersCount: g.slots.length,
    myTurns: mine.map((s) => s.turnOrder).sort((a, b) => a - b),
    potAmount: g.potAmount,
    status: 'active',
  };
}

/** Prochaine échéance non encore passée (pour le rappel préparé par l'organisateur). */
export function nextPeriod(g: Pick<TontineGroup, 'frequency' | 'cycleStart' | 'customDays' | 'slots'>, today: ISODate): { period: number; date: ISODate } | null {
  const item = groupSchedule(g).find((x) => x.date >= today);
  return item ? { period: item.period, date: item.date } : null;
}

/**
 * Paramètres du rappel PRÉPARÉ par l'organisateur (décision 5) : nom du groupe,
 * numéro du tour, date limite ; la cotisation seulement s'il la coche. Aucun
 * nom de membre — l'application n'envoie rien : l'organisateur partage lui-même.
 */
export function reminderParams(g: Pick<TontineGroup, 'name' | 'amountPerShare' | 'currency'>, period: { period: number; date: ISODate }, showAmount: boolean) {
  return { name: g.name, turn: period.period, date: period.date, ...(showAmount ? { amount: g.amountPerShare, currency: g.currency } : {}) };
}

/** Cycle terminé : la date du dernier tour est passée. */
export function cycleFinished(g: Pick<TontineGroup, 'frequency' | 'cycleStart' | 'customDays' | 'slots'>, today: ISODate): boolean {
  return today >= periodDate(g, g.slots.length);
}

/** Résumé de fin de cycle (organisateur, trésorier) : tours, paiements confirmés, manquants, total suivi. */
export function cycleSummary(g: TontineGroup): { turns: number; confirmed: number; missing: number; total: number } {
  const turns = g.slots.length;
  let confirmed = 0;
  for (let p = 1; p <= turns; p++) for (const s of g.slots) if (g.paid[paidKey(g.cycle, p, s.slotId)]) confirmed++;
  const pot = g.potAmount && g.potAmount > 0 ? g.potAmount : g.amountPerShare * turns;
  return { turns, confirmed, missing: turns * turns - confirmed, total: pot * turns };
}
