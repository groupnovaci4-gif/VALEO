/**
 * Tontine partagée (croissance, étape 3 — Lot T2) : logique PURE du serveur,
 * qui fait foi. Chaque action vérifie QUI la demande et produit le nouvel état,
 * les écritures de paiement et les lignes d'historique (journal en ajout seul).
 *
 * Règles du fondateur (2026-10-14) :
 *  - DineroX SUIT la tontine : aucun argent n'est collecté, gardé ni transféré ;
 *  - personne n'est membre sans avoir demandé à rejoindre (place libre + validation
 *    de l'organisateur) ; aucun numéro de téléphone ; le nom affiché d'un membre
 *    est celui qu'il choisit ; une place libre n'a pas de nom (« Membre N » à l'écran) ;
 *  - groupes partagés : tontine TOURNANTE seulement (une place = une main, un tour) ;
 *  - un seul trésorier, choisi par l'organisateur parmi les membres ; il confirme
 *    ou conteste les paiements comme l'organisateur ; l'historique note qui confirme ;
 *  - « payé » est visible de tous ; « déclaré », « contesté » (et le retard) ne sont
 *    visibles que de l'organisateur, du trésorier et de la personne concernée.
 * Miroir des dates : src/core/tontine.ts › nthDate (parité testée).
 */

export const TG = {
  MIN_SLOTS: 2,
  MAX_SLOTS: 50,
  NAME_MAX: 60,
  LABEL_MAX: 40,
  INVITE_DEFAULT_DAYS: 7,
  INVITE_MAX_DAYS: 30,
  AMOUNT_MAX: 1_000_000_000_000,
} as const;

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];

export interface Slot {
  slotId: string;
  /** Rang du tour (1 = premier à recevoir la cagnotte). */
  turnOrder: number;
  uid: string | null;
  /** Nom choisi par la personne liée ; null pour une place libre (« Membre N » à l'écran). */
  label: string | null;
  /** Place d'une personne partie ou d'un compte supprimé (« Ancien membre »). */
  former?: boolean;
}

export interface Group {
  name: string;
  type: 'rotating';
  currency: string;
  amountPerShare: number;
  frequency: Frequency;
  customDays: number | null;
  /** Début du cycle EN COURS. */
  cycleStart: string;
  cycle: number;
  potAmount: number | null;
  organizerUid: string;
  treasurerUid: string | null;
  memberUids: string[];
  slots: Slot[];
  /** Paiements CONFIRMÉS (« payé », visible de tous) : `${cycle}_${period}_${slotId}`. */
  paid: Record<string, true>;
  drawnAt: number | null;
  status: 'active' | 'orphaned';
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  cycle: number;
  period: number;
  slotId: string;
  /** Titulaire de la place au moment de la déclaration (lecture : lui + gestionnaires). */
  uid: string | null;
  status: 'declared' | 'confirmed' | 'disputed';
  declaredBy: string | null;
  declaredAt: number | null;
  confirmedBy: string | null;
  confirmedAt: number | null;
  disputedBy: string | null;
  disputedAt: number | null;
}

export type HistoryAction =
  | 'create'
  | 'invite'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'order'
  | 'draw'
  | 'treasurer'
  | 'declare'
  | 'confirm'
  | 'dispute'
  | 'leave'
  | 'account_deleted'
  | 'settings'
  | 'new_cycle'
  | 'organizer_transferred';

export interface HistoryEntry {
  at: number;
  by: string;
  action: HistoryAction;
  /** `all` : tous les membres ; `managers` : organisateur, trésorier et la personne concernée (`slotUid`). */
  visibility: 'all' | 'managers';
  slotUid: string | null;
  slotId: string | null;
  cycle: number | null;
  period: number | null;
  /** Détails NON personnels (ordre des places, champs modifiés…). Jamais de numéro de téléphone. */
  info: Record<string, string | number | boolean | null | string[]> | null;
}

export type TgError =
  | 'tg/name'
  | 'tg/currency'
  | 'tg/amount'
  | 'tg/frequency'
  | 'tg/customDays'
  | 'tg/startDate'
  | 'tg/slots'
  | 'tg/organizerSlots'
  | 'tg/label'
  | 'tg/not-member'
  | 'tg/not-organizer'
  | 'tg/not-manager'
  | 'tg/not-your-slot'
  | 'tg/slot'
  | 'tg/slot-taken'
  | 'tg/period'
  | 'tg/already-confirmed'
  | 'tg/not-declared'
  | 'tg/already-drawn'
  | 'tg/order'
  | 'tg/treasurer'
  | 'tg/organizer-cannot-leave'
  | 'tg/already-member'
  | 'tg/full'
  | 'tg/cycle-not-finished'
  | 'tg/orphaned';

export class TgFailure extends Error {
  constructor(public code: TgError) {
    super(code);
  }
}
const fail = (code: TgError): never => {
  throw new TgFailure(code);
};

// ─── Dates (miroir de src/core/tontine.ts) ────────────────────────────

const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

function addMonths(iso: string, n: number): string {
  const [y, m, day] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fmt(target);
}

const STEP: Record<Exclude<Frequency, 'monthly' | 'custom'>, number> = { daily: 1, weekly: 7, biweekly: 14 };

/** Date de la i-ième échéance (0 = première) du cycle en cours. */
export function nthDate(g: Pick<Group, 'frequency' | 'cycleStart' | 'customDays'>, i: number): string {
  if (g.frequency === 'monthly') return addMonths(g.cycleStart, i);
  const step = g.frequency === 'custom' ? Math.max(1, g.customDays ?? 1) : STEP[g.frequency];
  return addDays(g.cycleStart, i * step);
}

/** Nombre d'échéances d'un cycle tournant : une par place (une main = un tour). */
export const periodsOf = (g: Pick<Group, 'slots'>) => g.slots.length;

export const paidKey = (cycle: number, period: number, slotId: string) => `${cycle}_${period}_${slotId}`;
export const paymentId = paidKey;

// ─── Création ─────────────────────────────────────────────────────────

export interface CreateInput {
  name: unknown;
  currency: unknown;
  amountPerShare: unknown;
  frequency: unknown;
  customDays?: unknown;
  startDate: unknown;
  slotsCount: unknown;
  potAmount?: unknown;
  /** Mains tenues par l'organisateur lui-même (au moins 1). */
  organizerSlots?: unknown;
  /** Nom affiché de l'organisateur (choisi par lui). */
  organizerLabel: unknown;
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};
const isPositiveInt = (v: unknown, max: number = TG.AMOUNT_MAX): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < max;

export function validateCreate(i: CreateInput): TgError[] {
  const errors: TgError[] = [];
  if (!cleanText(i.name, TG.NAME_MAX)) errors.push('tg/name');
  if (typeof i.currency !== 'string' || !/^[A-Z]{3}$/.test(i.currency)) errors.push('tg/currency');
  if (!isPositiveInt(i.amountPerShare)) errors.push('tg/amount');
  if (!FREQUENCIES.includes(i.frequency as Frequency)) errors.push('tg/frequency');
  if (i.frequency === 'custom' && !(isPositiveInt(i.customDays, 366))) errors.push('tg/customDays');
  if (!isISO(i.startDate)) errors.push('tg/startDate');
  if (!(typeof i.slotsCount === 'number' && Number.isInteger(i.slotsCount) && i.slotsCount >= TG.MIN_SLOTS && i.slotsCount <= TG.MAX_SLOTS)) errors.push('tg/slots');
  const own = i.organizerSlots ?? 1;
  if (!(typeof own === 'number' && Number.isInteger(own) && own >= 1 && own < (i.slotsCount as number))) errors.push('tg/organizerSlots');
  if (i.potAmount !== undefined && i.potAmount !== null && !isPositiveInt(i.potAmount)) errors.push('tg/amount');
  if (!cleanText(i.organizerLabel, TG.LABEL_MAX)) errors.push('tg/label');
  return errors;
}

export function createGroup(i: CreateInput, organizerUid: string, now: number): { group: Group; history: HistoryEntry[] } {
  const errors = validateCreate(i);
  if (errors.length) fail(errors[0]);
  const count = i.slotsCount as number;
  const own = (i.organizerSlots as number | undefined) ?? 1;
  const label = cleanText(i.organizerLabel, TG.LABEL_MAX);
  const slots: Slot[] = Array.from({ length: count }, (_, k) => ({
    slotId: `s${k + 1}`,
    turnOrder: k + 1,
    uid: k < own ? organizerUid : null,
    label: k < own ? label : null,
  }));
  const group: Group = {
    name: cleanText(i.name, TG.NAME_MAX) as string,
    type: 'rotating',
    currency: i.currency as string,
    amountPerShare: i.amountPerShare as number,
    frequency: i.frequency as Frequency,
    customDays: i.frequency === 'custom' ? (i.customDays as number) : null,
    cycleStart: i.startDate as string,
    cycle: 1,
    potAmount: (i.potAmount as number | null | undefined) ?? null,
    organizerUid,
    treasurerUid: null,
    memberUids: [organizerUid],
    slots,
    paid: {},
    drawnAt: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  return { group, history: [entry(now, organizerUid, 'create', 'all', { info: { slots: count } })] };
}

function entry(at: number, by: string, action: HistoryAction, visibility: HistoryEntry['visibility'], o: Partial<Pick<HistoryEntry, 'slotUid' | 'slotId' | 'cycle' | 'period' | 'info'>> = {}): HistoryEntry {
  return { at, by, action, visibility, slotUid: o.slotUid ?? null, slotId: o.slotId ?? null, cycle: o.cycle ?? null, period: o.period ?? null, info: o.info ?? null };
}

// ─── Droits ───────────────────────────────────────────────────────────

export const isMember = (g: Group, uid: string) => g.memberUids.includes(uid);
export const isOrganizer = (g: Group, uid: string) => g.organizerUid === uid;
export const isManager = (g: Group, uid: string) => g.organizerUid === uid || (!!g.treasurerUid && g.treasurerUid === uid);

function requireActive(g: Group) {
  if (g.status !== 'active') fail('tg/orphaned');
}
function requireOrganizer(g: Group, uid: string) {
  requireActive(g);
  if (!isOrganizer(g, uid)) fail('tg/not-organizer');
}
function requireManager(g: Group, uid: string) {
  requireActive(g);
  if (!isManager(g, uid)) fail('tg/not-manager');
}
const slotOf = (g: Group, slotId: unknown) => g.slots.find((s) => s.slotId === slotId) ?? fail('tg/slot');

export interface Result {
  group: Group;
  history: HistoryEntry[];
  payment?: { id: string; data: Payment };
}

const touch = (g: Group, now: number): Group => ({ ...g, slots: g.slots.map((s) => ({ ...s })), memberUids: [...g.memberUids], paid: { ...g.paid }, updatedAt: now });

// ─── Rejoindre ────────────────────────────────────────────────────────

/** L'organisateur valide une demande : la personne (qui a demandé) prend une ou plusieurs places LIBRES. */
export function approveJoin(g0: Group, actor: string, req: { uid: string; label: unknown }, slotIds: unknown, now: number): Result {
  requireOrganizer(g0, actor);
  const label = cleanText(req.label, TG.LABEL_MAX) ?? fail('tg/label');
  if (!Array.isArray(slotIds) || !slotIds.length) return fail('tg/slot');
  const g = touch(g0, now);
  for (const id of slotIds) {
    const s = slotOf(g, id);
    if (s.uid) fail('tg/slot-taken');
    s.uid = req.uid;
    s.label = label;
    s.former = false;
  }
  if (!g.memberUids.includes(req.uid)) g.memberUids.push(req.uid);
  return { group: g, history: [entry(now, actor, 'join_approved', 'all', { slotUid: req.uid, info: { slots: (slotIds as string[]).join(',') } })] };
}

export const hasFreeSlot = (g: Group) => g.slots.some((s) => !s.uid);

// ─── Ordre des tours ──────────────────────────────────────────────────

/** Ordre fixé par l'organisateur : permutation complète des places. Toujours inscrit à l'historique. */
export function setOrder(g0: Group, actor: string, order: unknown, now: number): Result {
  requireOrganizer(g0, actor);
  const ids = g0.slots.map((s) => s.slotId);
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || !order.every((x) => ids.includes(x as string))) return fail('tg/order');
  const g = touch(g0, now);
  (order as string[]).forEach((id, k) => (slotOf(g, id).turnOrder = k + 1));
  return { group: g, history: [entry(now, actor, 'order', 'all', { info: { order: order as string[] } })] };
}

/** Tirage au sort côté serveur, UNE SEULE FOIS ; `rand` dans [0, 1) (crypto en production). */
export function draw(g0: Group, actor: string, rand: () => number, now: number): Result {
  requireOrganizer(g0, actor);
  if (g0.drawnAt) fail('tg/already-drawn');
  const order = g0.slots.map((s) => s.slotId);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  const r = setOrder(g0, actor, order, now);
  r.group.drawnAt = now;
  return { group: r.group, history: [entry(now, actor, 'draw', 'all', { info: { order } })] };
}

// ─── Trésorier ────────────────────────────────────────────────────────

/** Un seul trésorier, choisi par l'organisateur parmi les membres qui ont accepté ; null = aucun. */
export function setTreasurer(g0: Group, actor: string, uid: unknown, now: number): Result {
  requireOrganizer(g0, actor);
  if (uid !== null && (typeof uid !== 'string' || !g0.memberUids.includes(uid) || uid === g0.organizerUid)) return fail('tg/treasurer');
  const g = touch(g0, now);
  g.treasurerUid = uid as string | null;
  return { group: g, history: [entry(now, actor, 'treasurer', 'all', { slotUid: (uid as string | null) ?? null })] };
}

// ─── Paiements (statuts seulement, aucun argent) ─────────────────────

function checkPeriod(g: Group, period: unknown): number {
  if (typeof period !== 'number' || !Number.isInteger(period) || period < 1 || period > periodsOf(g)) return fail('tg/period');
  return period;
}

const emptyPayment = (g: Group, period: number, slot: Slot): Payment => ({
  cycle: g.cycle,
  period,
  slotId: slot.slotId,
  uid: slot.uid,
  status: 'declared',
  declaredBy: null,
  declaredAt: null,
  confirmedBy: null,
  confirmedAt: null,
  disputedBy: null,
  disputedAt: null,
});

/** Un membre déclare SON propre paiement (« J'ai payé »). */
export function declarePayment(g0: Group, existing: Payment | null, actor: string, input: { period: unknown; slotId: unknown }, now: number): Result {
  requireActive(g0);
  if (!isMember(g0, actor)) fail('tg/not-member');
  const slot = slotOf(g0, input.slotId);
  if (slot.uid !== actor) fail('tg/not-your-slot');
  const period = checkPeriod(g0, input.period);
  if (existing?.status === 'confirmed') fail('tg/already-confirmed');
  const data: Payment = { ...(existing ?? emptyPayment(g0, period, slot)), uid: slot.uid, status: 'declared', declaredBy: actor, declaredAt: now, disputedBy: null, disputedAt: null };
  return {
    group: touch(g0, now),
    payment: { id: paymentId(g0.cycle, period, slot.slotId), data },
    history: [entry(now, actor, 'declare', 'managers', { slotUid: slot.uid, slotId: slot.slotId, cycle: g0.cycle, period })],
  };
}

/** L'organisateur ou le trésorier confirme (aussi pour une place sans compte, payée en main propre). */
export function confirmPayment(g0: Group, existing: Payment | null, actor: string, input: { period: unknown; slotId: unknown }, now: number): Result {
  requireManager(g0, actor);
  const slot = slotOf(g0, input.slotId);
  const period = checkPeriod(g0, input.period);
  if (existing?.status === 'confirmed') fail('tg/already-confirmed');
  const g = touch(g0, now);
  g.paid[paidKey(g.cycle, period, slot.slotId)] = true;
  const data: Payment = { ...(existing ?? emptyPayment(g0, period, slot)), uid: slot.uid, status: 'confirmed', confirmedBy: actor, confirmedAt: now };
  return {
    group: g,
    payment: { id: paymentId(g.cycle, period, slot.slotId), data },
    // « payé » est public ; l'historique note QUI a confirmé.
    history: [entry(now, actor, 'confirm', 'all', { slotUid: slot.uid, slotId: slot.slotId, cycle: g.cycle, period, info: { confirmedBy: actor } })],
  };
}

/** L'organisateur ou le trésorier conteste une déclaration (visible des gestionnaires et de la personne seulement). */
export function disputePayment(g0: Group, existing: Payment | null, actor: string, input: { period: unknown; slotId: unknown }, now: number): Result {
  requireManager(g0, actor);
  const slot = slotOf(g0, input.slotId);
  const period = checkPeriod(g0, input.period);
  if (!existing || existing.status !== 'declared') fail('tg/not-declared');
  const data: Payment = { ...(existing as Payment), status: 'disputed', disputedBy: actor, disputedAt: now };
  return {
    group: touch(g0, now),
    payment: { id: paymentId(g0.cycle, period, slot.slotId), data },
    history: [entry(now, actor, 'dispute', 'managers', { slotUid: slot.uid, slotId: slot.slotId, cycle: g0.cycle, period })],
  };
}

// ─── Départ, compte supprimé ──────────────────────────────────────────

function release(g: Group, uid: string) {
  for (const s of g.slots) {
    if (s.uid === uid) {
      s.uid = null;
      s.label = null;
      s.former = true;
    }
  }
  g.memberUids = g.memberUids.filter((u) => u !== uid);
  if (g.treasurerUid === uid) g.treasurerUid = null;
}

/** Un membre quitte le groupe : il perd l'accès ; l'historique reste intact pour les autres. */
export function leave(g0: Group, actor: string, now: number): Result {
  if (!isMember(g0, actor)) fail('tg/not-member');
  if (isOrganizer(g0, actor)) fail('tg/organizer-cannot-leave');
  const g = touch(g0, now);
  release(g, actor);
  return { group: g, history: [entry(now, actor, 'leave', 'all', { slotUid: actor })] };
}

/**
 * Compte supprimé : places libérées (« Ancien membre »). Si c'était
 * l'organisateur : le trésorier devient organisateur ; sans trésorier, le
 * groupe reste lisible mais n'accepte plus de modification (`orphaned`).
 */
export function accountDeleted(g0: Group, uid: string, now: number): Result {
  const g = touch(g0, now);
  const wasOrganizer = g.organizerUid === uid;
  const treasurer = g.treasurerUid && g.treasurerUid !== uid ? g.treasurerUid : null;
  release(g, uid);
  const history = [entry(now, 'system', 'account_deleted', 'all', { slotUid: null })];
  if (wasOrganizer) {
    if (treasurer) {
      g.organizerUid = treasurer;
      g.treasurerUid = null;
      history.push(entry(now, 'system', 'organizer_transferred', 'all', { slotUid: treasurer }));
    } else {
      g.status = 'orphaned';
    }
  }
  return { group: g, history };
}

// ─── Paramètres, cycles ───────────────────────────────────────────────

/** Paramètres modifiables en cours de route : nom, cotisation, cagnotte (inscrits à l'historique). */
export function updateSettings(g0: Group, actor: string, patch: { name?: unknown; amountPerShare?: unknown; potAmount?: unknown }, now: number): Result {
  requireOrganizer(g0, actor);
  const g = touch(g0, now);
  const changed: string[] = [];
  if (patch.name !== undefined) {
    g.name = cleanText(patch.name, TG.NAME_MAX) ?? fail('tg/name');
    changed.push('name');
  }
  if (patch.amountPerShare !== undefined) {
    if (!isPositiveInt(patch.amountPerShare)) fail('tg/amount');
    g.amountPerShare = patch.amountPerShare as number;
    changed.push('amountPerShare');
  }
  if (patch.potAmount !== undefined) {
    if (patch.potAmount !== null && !isPositiveInt(patch.potAmount)) fail('tg/amount');
    g.potAmount = patch.potAmount as number | null;
    changed.push('potAmount');
  }
  return { group: g, history: [entry(now, actor, 'settings', 'all', { info: { fields: changed } })] };
}

/** Le cycle est terminé quand la date du dernier tour est passée. */
export function cycleFinished(g: Pick<Group, 'frequency' | 'cycleStart' | 'customDays' | 'slots'>, today: string): boolean {
  return today >= nthDate(g, periodsOf(g) - 1);
}

/** Nouveau cycle, mêmes membres et même ordre ; commence à l'échéance qui suit le dernier tour. */
export function newCycle(g0: Group, actor: string, today: string, now: number): Result {
  requireOrganizer(g0, actor);
  if (!cycleFinished(g0, today)) fail('tg/cycle-not-finished');
  const g = touch(g0, now);
  g.cycleStart = nthDate(g0, periodsOf(g0));
  g.cycle += 1;
  return { group: g, history: [entry(now, actor, 'new_cycle', 'all', { cycle: g.cycle })] };
}

// ─── Invitations ──────────────────────────────────────────────────────

export interface Invite {
  groupId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  /** Afficher la cotisation dans l'aperçu (case DÉCOCHÉE par défaut). */
  showAmount: boolean;
}

export function makeInvite(g: Group, groupId: string, actor: string, opts: { days?: unknown; showAmount?: unknown }, now: number): Invite {
  requireOrganizer(g, actor);
  const days = typeof opts.days === 'number' && Number.isInteger(opts.days) && opts.days >= 1 && opts.days <= TG.INVITE_MAX_DAYS ? opts.days : TG.INVITE_DEFAULT_DAYS;
  return { groupId, createdBy: actor, createdAt: now, expiresAt: now + days * 24 * 3600 * 1000, showAmount: opts.showAmount === true };
}

export const inviteExpired = (i: Invite, now: number) => now > i.expiresAt;

/** Aperçu avant de rejoindre : JAMAIS la liste des membres ; la cotisation seulement si l'organisateur l'a choisi. */
export function invitePreview(i: Invite, g: Group, now: number) {
  return {
    name: g.name,
    frequency: g.frequency,
    customDays: g.customDays,
    slots: g.slots.length,
    full: !hasFreeSlot(g),
    expired: inviteExpired(i, now),
    ...(i.showAmount ? { currency: g.currency, amountPerShare: g.amountPerShare } : {}),
  };
}

// ─── Vue d'un membre : ce qu'il a le droit de voir ────────────────────

export type SlotStatus = 'paid' | 'not_yet' | 'declared' | 'disputed' | 'late';

/**
 * Statut d'une place pour un tour, vu par `viewer` : tous voient « payé » ou
 * « pas encore » ; « déclaré », « contesté » et « en retard » seulement
 * l'organisateur, le trésorier et la personne concernée.
 */
export function slotStatusFor(g: Group, payment: Payment | null, slot: Slot, period: number, viewer: string, today: string): SlotStatus {
  if (g.paid[paidKey(g.cycle, period, slot.slotId)]) return 'paid';
  const insider = isManager(g, viewer) || (!!slot.uid && slot.uid === viewer);
  if (!insider) return 'not_yet';
  if (payment?.status === 'declared') return 'declared';
  if (payment?.status === 'disputed') return 'disputed';
  return today > nthDate(g, period - 1) ? 'late' : 'not_yet';
}
