/**
 * Parrainage — logique PURE côté serveur (le serveur fait foi).
 *
 * Miroir côté application : src/core/referral.ts (mêmes constantes, même
 * format de code, même lecture du referrer ; `tests/referral.test.ts` vérifie
 * qu'ils restent identiques).
 *
 * Règle (validée par le fondateur le 2026-10-13) :
 *  - un filleul est VALIDÉ quand il utilise DineroX régulièrement pendant une
 *    semaine : sur 7 jours consécutifs, au moins 5 jours actifs, 5 dépenses,
 *    1 revenu et 2 objectifs créés, le tout dans les 30 jours après son
 *    inscription ;
 *  - seul le PARRAIN est récompensé : 1 mois de Plus par tranche de 5 filleuls
 *    validés (chaque filleul compte une seule fois) ; le filleul ne reçoit rien ;
 *  - plafond de mois offerts par mois civil (plus élevé pour un ambassadeur,
 *    réglable par l'admin) ; au-delà, les filleuls validés restent en réserve
 *    et sont convertis le mois suivant (report).
 * Aucune donnée financière ne sort de ce module : seulement des compteurs.
 */

const DAY_MS = 24 * 3600 * 1000;

export const REFERRAL = {
  /** Code personnel : 6 caractères, sans 0/O, 1/I/L. */
  CODE_LENGTH: 6,
  CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  /** Un code peut être appliqué jusqu'à 7 jours après l'inscription. */
  APPLY_WINDOW_DAYS: 7,
  /** Le filleul a 30 jours après son inscription pour valider sa semaine. */
  VALIDATION_DEADLINE_DAYS: 30,
  WEEK_DAYS: 7,
  MIN_ACTIVE_DAYS: 5,
  MIN_EXPENSES: 5,
  MIN_INCOMES: 1,
  MIN_GOALS: 2,
  /** Une opération supprimée moins de 48 h après sa création ne compte pas. */
  QUICK_DELETE_MS: 48 * 3600 * 1000,
  /** Doublon évident : même montant, même catégorie, moins d'une minute d'écart. */
  DUPLICATE_WINDOW_MS: 60 * 1000,
  /** Récompense du parrain : 1 mois de Plus par tranche de 5 filleuls validés. */
  FILLEULS_PER_REWARD: 5,
  MONTHS_PER_REWARD: 1,
  /** Plafond de mois offerts par mois civil (5 filleuls × 2 = 10 filleuls récompensés). */
  MAX_REWARDS_PER_MONTH: 2,
  /** Plafond par défaut d'un ambassadeur (réglable par l'admin pour chacun). */
  AMBASSADOR_MAX_REWARDS_PER_MONTH: 20,
  /** Borne de sécurité du réglage admin. */
  AMBASSADOR_MAX_SETTABLE: 1000,
} as const;

// ─── Codes ────────────────────────────────────────────────────────────

/** Tire un code ; `rand` renvoie un nombre dans [0, 1) (crypto côté serveur). */
export function generateCode(rand: () => number): string {
  let out = '';
  for (let i = 0; i < REFERRAL.CODE_LENGTH; i++) out += REFERRAL.CODE_ALPHABET[Math.floor(rand() * REFERRAL.CODE_ALPHABET.length)];
  return out;
}

/** Saisie tolérante : majuscules, sans espaces ni tirets ; 0→O… ne sont PAS corrigés (code exact). */
export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]/g, '') : '';
}

export function isValidCode(code: string): boolean {
  if (code.length !== REFERRAL.CODE_LENGTH) return false;
  for (const ch of code) if (!REFERRAL.CODE_ALPHABET.includes(ch)) return false;
  return true;
}

// ─── Referrer Google Play et paramètres des liens ─────────────────────

export interface LinkParams {
  code?: string;
  /** Source (`src`), campagne (`cmp`), contenu (`cnt`) : préparés pour l'étape 5. */
  src?: string;
  cmp?: string;
  cnt?: string;
}

/** Valeur de suivi acceptée : minuscules, chiffres, `-` et `_`, 40 caractères au plus. */
export function cleanTag(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : undefined;
}

/** Lit des paramètres `ref`, `src`, `cmp`, `cnt` (le reste est ignoré : jamais de donnée libre). */
export function readLinkParams(get: (k: string) => string | null | undefined): LinkParams {
  const out: LinkParams = {};
  const code = normalizeCode(get('ref') ?? '');
  if (isValidCode(code)) out.code = code;
  const src = cleanTag(get('src'));
  const cmp = cleanTag(get('cmp'));
  const cnt = cleanTag(get('cnt'));
  if (src) out.src = src;
  if (cmp) out.cmp = cmp;
  if (cnt) out.cnt = cnt;
  return out;
}

/**
 * Referrer d'installation Google Play, par exemple `ref=ABC123&src=whatsapp`
 * (sans lien DineroX, Play renvoie `utm_source=google-play&utm_medium=organic`).
 */
export function parseInstallReferrer(raw: unknown): LinkParams {
  if (typeof raw !== 'string' || !raw || raw.length > 1000) return {};
  const pairs = new Map<string, string>();
  for (const part of raw.split('&')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      pairs.set(decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' ')));
    } catch {
      // Paire mal encodée : ignorée, les autres restent lisibles.
      continue;
    }
  }
  return readLinkParams((k) => pairs.get(k));
}

/** Valeur du paramètre `referrer` de la fiche Play Store (à encoder une fois dans l'URL). */
export function referrerValue(p: LinkParams): string {
  const parts: string[] = [];
  if (p.code) parts.push(`ref=${p.code}`);
  if (p.src) parts.push(`src=${p.src}`);
  if (p.cmp) parts.push(`cmp=${p.cmp}`);
  if (p.cnt) parts.push(`cnt=${p.cnt}`);
  return parts.join('&');
}

// ─── Application d'un code ────────────────────────────────────────────

export type ApplyRefusal =
  | 'referral/invalid-code'
  | 'referral/unknown-code'
  | 'referral/self'
  | 'referral/already-referred'
  | 'referral/too-late'
  | 'referral/device-used'
  | 'referral/device-required';

export interface ApplyCheck {
  code: string;
  /** Propriétaire du code, null si inconnu. */
  parrainUid: string | null;
  filleulUid: string;
  /** Date d'inscription du filleul (création du compte Firebase Auth : non modifiable par le client). */
  signupAt: number;
  now: number;
  alreadyReferred: boolean;
  /** Empreinte (hachée) de l'appareil du filleul ; null si absente. */
  deviceHash: string | null;
  /** Comptes déjà vus sur cet appareil, et filleul déjà enregistré pour cet appareil. */
  deviceUids: string[];
  deviceFilleulUid: string | null;
}

/** Contrôles anti-triche, dans l'ordre (le premier refus l'emporte). */
export function checkApply(c: ApplyCheck): ApplyRefusal | null {
  if (!isValidCode(c.code)) return 'referral/invalid-code';
  if (!c.parrainUid) return 'referral/unknown-code';
  if (c.parrainUid === c.filleulUid) return 'referral/self';
  if (c.alreadyReferred) return 'referral/already-referred';
  if (c.now - c.signupAt > REFERRAL.APPLY_WINDOW_DAYS * DAY_MS) return 'referral/too-late';
  if (!c.deviceHash) return 'referral/device-required';
  // Même appareil que le parrain : auto-parrainage.
  if (c.deviceUids.includes(c.parrainUid)) return 'referral/self';
  if (c.deviceFilleulUid && c.deviceFilleulUid !== c.filleulUid) return 'referral/device-used';
  return null;
}

// ─── Semaine régulière du filleul ─────────────────────────────────────

export interface ActivityOp {
  id: string;
  type: string;
  amount: number;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  deleted?: boolean;
  recurringId?: string | null;
}

export interface ActivityGoal {
  id: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  deleted?: boolean;
}

export interface WeekProgress {
  /** Jour courant dans la semaine en cours (1 à 7), 0 si aucune activité. */
  day: number;
  activeDays: number;
  expenses: number;
  incomes: number;
  goals: number;
}

export interface WeekResult {
  status: 'in_progress' | 'validated' | 'expired';
  /** Moment où la dernière condition a été remplie. */
  validatedAt: number | null;
  progress: WeekProgress;
}

/** Anciennes « dépenses » d'épargne : épargner n'est pas dépenser (miroir de core/savingsFlows.ts). */
const SAVING_CATEGORY_IDS = new Set(['cat_savings', 'cat_investment']);

/** Jour civil (AAAA-MM-JJ) d'un instant dans le fuseau du filleul. */
export function dayKey(at: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

function dayIndex(key: string): number {
  return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
}

/** Supprimée moins de 48 h après sa création : ne compte pas (une suppression plus tardive, si). */
function quicklyDeleted(d: { deleted?: boolean; createdAt: number; updatedAt: number }): boolean {
  return d.deleted === true && d.updatedAt - d.createdAt < REFERRAL.QUICK_DELETE_MS;
}

interface Event {
  at: number;
  day: number;
  kind: 'expense' | 'income' | 'other' | 'goal';
}

/**
 * Activités qui comptent. Exclues : opérations d'un autre auteur, générées par
 * une récurrence, de démonstration (`demo_…`), ajustements de solde, supprimées
 * sous 48 h, doublons évidents, et tout ce qui précède l'inscription.
 */
export function countedEvents(ops: ActivityOp[], goals: ActivityGoal[], uid: string, signupAt: number, timeZone: string): Event[] {
  const kept: ActivityOp[] = [];
  const sorted = ops
    .filter((o) => (o.createdBy ?? uid) === uid && !o.recurringId && !o.id.startsWith('demo_') && !quicklyDeleted(o))
    .filter((o) => o.type === 'expense' || o.type === 'income' || o.type === 'transfer')
    .filter((o) => o.createdAt >= signupAt)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const o of sorted) {
    const dup = kept.some(
      (k) => k.type === o.type && k.amount === o.amount && (k.categoryId ?? null) === (o.categoryId ?? null) && Math.abs(o.createdAt - k.createdAt) < REFERRAL.DUPLICATE_WINDOW_MS,
    );
    if (!dup) kept.push(o);
  }
  const events: Event[] = kept.map((o) => ({
    at: o.createdAt,
    day: dayIndex(dayKey(o.createdAt, timeZone)),
    kind: o.type === 'expense' ? (o.categoryId && SAVING_CATEGORY_IDS.has(o.categoryId) ? 'other' : 'expense') : o.type === 'income' ? 'income' : 'other',
  }));
  for (const g of goals) {
    if ((g.createdBy ?? uid) !== uid || g.id.startsWith('demo_') || quicklyDeleted(g) || g.createdAt < signupAt) continue;
    events.push({ at: g.createdAt, day: dayIndex(dayKey(g.createdAt, timeZone)), kind: 'goal' });
  }
  return events.sort((a, b) => a.at - b.at);
}

function tally(events: Event[]): Omit<WeekProgress, 'day'> {
  const opDays = new Set(events.filter((e) => e.kind !== 'goal').map((e) => e.day));
  return {
    activeDays: opDays.size,
    expenses: events.filter((e) => e.kind === 'expense').length,
    incomes: events.filter((e) => e.kind === 'income').length,
    goals: events.filter((e) => e.kind === 'goal').length,
  };
}

function meets(p: Omit<WeekProgress, 'day'>): boolean {
  return p.activeDays >= REFERRAL.MIN_ACTIVE_DAYS && p.expenses >= REFERRAL.MIN_EXPENSES && p.incomes >= REFERRAL.MIN_INCOMES && p.goals >= REFERRAL.MIN_GOALS;
}

/**
 * Évalue la semaine régulière. Fenêtre GLISSANTE : toute période de 7 jours
 * consécutifs qui commence un jour d'activité convient, tant que la dernière
 * condition est remplie dans les 30 jours après l'inscription.
 * La progression affichée est celle de la semaine en cours (la plus ancienne
 * fenêtre qui contient aujourd'hui).
 */
export function evaluateWeek(input: { ops: ActivityOp[]; goals: ActivityGoal[]; uid: string; signupAt: number; now: number; timeZone: string }): WeekResult {
  const deadline = input.signupAt + REFERRAL.VALIDATION_DEADLINE_DAYS * DAY_MS;
  const events = countedEvents(input.ops, input.goals, input.uid, input.signupAt, input.timeZone).filter((e) => e.at <= input.now);
  const startDays = [...new Set(events.map((e) => e.day))].sort((a, b) => a - b);
  // Première fenêtre qui remplit TOUTES les conditions : moment exact de la validation.
  let validatedAt: number | null = null;
  for (const start of startDays) {
    const inWindow = events.filter((e) => e.day >= start && e.day < start + REFERRAL.WEEK_DAYS);
    const acc: Event[] = [];
    for (const e of inWindow) {
      acc.push(e);
      if (meets(tally(acc))) {
        if (validatedAt === null || e.at < validatedAt) validatedAt = e.at;
        break;
      }
    }
  }
  const today = dayIndex(dayKey(input.now, input.timeZone));
  const current = startDays.find((s) => today - s < REFERRAL.WEEK_DAYS);
  const progress: WeekProgress =
    current === undefined
      ? { day: 0, activeDays: 0, expenses: 0, incomes: 0, goals: 0 }
      : { day: today - current + 1, ...tally(events.filter((e) => e.day >= current && e.day < current + REFERRAL.WEEK_DAYS)) };
  if (validatedAt !== null && validatedAt <= deadline) return { status: 'validated', validatedAt, progress };
  if (input.now > deadline) return { status: 'expired', validatedAt: null, progress };
  return { status: 'in_progress', validatedAt: null, progress };
}

// ─── Récompense du parrain ────────────────────────────────────────────

export interface ParrainCounters {
  /** Filleuls validés dans les délais (chacun compté une seule fois). */
  validated: number;
  /** Filleuls déjà convertis en mois offerts (multiple de 5). */
  converted: number;
  /** Mois offerts gagnés au total. */
  monthsEarned: number;
  /** Mois offerts par mois civil (`AAAA-MM`), pour le plafond. */
  monthsByPeriod: Record<string, number>;
}

export function emptyCounters(): ParrainCounters {
  return { validated: 0, converted: 0, monthsEarned: 0, monthsByPeriod: {} };
}

export function periodOf(at: number): string {
  return new Date(at).toISOString().slice(0, 7);
}

/** Plafond mensuel d'un parrain : réglage ambassadeur s'il existe, sinon la règle normale. */
export function monthlyCap(ambassador: { enabled?: boolean; maxRewardsPerMonth?: number } | null | undefined): number {
  if (!ambassador?.enabled) return REFERRAL.MAX_REWARDS_PER_MONTH;
  const v = ambassador.maxRewardsPerMonth;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, REFERRAL.AMBASSADOR_MAX_SETTABLE) : REFERRAL.AMBASSADOR_MAX_REWARDS_PER_MONTH;
}

/**
 * Convertit les filleuls validés en mois offerts : 5 filleuls = 1 mois, dans
 * la limite du plafond du mois civil. Le surplus reste en réserve (report) et
 * sera converti par un passage ultérieur (le mois suivant).
 */
export function convertRewards(c: ParrainCounters, now: number, cap: number): { counters: ParrainCounters; monthsGranted: number } {
  const period = periodOf(now);
  const next: ParrainCounters = { ...c, monthsByPeriod: { ...c.monthsByPeriod } };
  let granted = 0;
  while (next.validated - next.converted >= REFERRAL.FILLEULS_PER_REWARD && (next.monthsByPeriod[period] ?? 0) + REFERRAL.MONTHS_PER_REWARD <= cap) {
    next.converted += REFERRAL.FILLEULS_PER_REWARD;
    next.monthsEarned += REFERRAL.MONTHS_PER_REWARD;
    next.monthsByPeriod[period] = (next.monthsByPeriod[period] ?? 0) + REFERRAL.MONTHS_PER_REWARD;
    granted += REFERRAL.MONTHS_PER_REWARD;
  }
  return { counters: next, monthsGranted: granted };
}

/** Avancement vers le prochain mois offert (« 3/5 ») ; `waiting` = 5/5 bloqué par le plafond. */
export function nextRewardProgress(c: ParrainCounters): { count: number; of: number; waiting: boolean } {
  const pending = c.validated - c.converted;
  return { count: Math.min(pending, REFERRAL.FILLEULS_PER_REWARD), of: REFERRAL.FILLEULS_PER_REWARD, waiting: pending >= REFERRAL.FILLEULS_PER_REWARD };
}

/**
 * Prolonge « Plus offert » : les mois s'additionnent à partir de la fin de la
 * période déjà offerte (ou de maintenant si elle est passée). Mois civils, UTC.
 */
export function extendPlusUntil(current: number | null | undefined, now: number, months: number): number {
  const from = new Date(current && current > now ? current : now);
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
  // 31 janvier + 1 mois → fin février, pas 3 mars.
  if (d.getUTCDate() !== from.getUTCDate()) d.setUTCDate(0);
  return d.getTime();
}

/** Abonnement PAYANT actif : pas de prolongation automatique (décision du fondateur en attente). */
export function hasPaidSubscription(sub: { plan?: string; status?: string; provider?: string; expiresAt?: number | null } | undefined, now: number): boolean {
  if (!sub || !sub.provider || sub.provider === 'none') return false;
  if (sub.plan !== 'plus' && sub.plan !== 'family') return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  return !sub.expiresAt || sub.expiresAt >= now;
}
