/**
 * Croissance, étape 5 — origine des installations : logique PURE du serveur
 * (testée). Miroir côté application : src/core/installOrigin.ts (parité testée).
 *
 * - Compteurs ANONYMES par jour (`originStats/{AAAA-MM-JJ}`) : aucune origine
 *   n'est rattachée à une personne ; le profil ne garde que `originCounted: true`.
 * - Jamais le code d'invitation : seulement « venue d'un lien d'invitation ».
 * - Regroupement : un groupe de moins de `ORIGIN_MIN_GROUP` inscriptions ne
 *   quitte JAMAIS le serveur, ni son nombre ni son nom : il est réuni dans
 *   « Autres ».
 */
import { cleanTag } from './referral';

export const ORIGIN_SOURCES = [
  'whatsapp',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'sms',
  'email',
  'qr',
  'poster',
  'radio',
  'tv',
  'site',
  'ambassador',
  'share',
  'copy',
  'play_store',
  'other',
] as const;
export type OriginSource = (typeof ORIGIN_SOURCES)[number];

export const ORIGIN_MIN_GROUP = 5;
export const ORIGIN_WINDOW_DAYS = 7;
/** Plafond de clés différentes par jour et par niveau (campagnes, contenus) : au-delà, seule la source est comptée. */
export const ORIGIN_MAX_KEYS = 100;
export const ORIGIN_KEY_SEP = '~';

export interface InstallOrigin {
  src?: OriginSource;
  cmp?: string;
  cnt?: string;
  invited?: boolean;
}

export function isOriginSource(v: unknown): v is OriginSource {
  return typeof v === 'string' && (ORIGIN_SOURCES as readonly string[]).includes(v);
}

export function normalizeSource(v: unknown): OriginSource | undefined {
  const tag = cleanTag(v);
  if (!tag) return undefined;
  return isOriginSource(tag) ? tag : 'other';
}

/** Même règle que l'application : campagne et contenu n'existent qu'avec une source. */
export function cleanOrigin(o: { src?: unknown; cmp?: unknown; cnt?: unknown; invited?: unknown } | null | undefined): InstallOrigin {
  const out: InstallOrigin = {};
  const src = normalizeSource(o?.src);
  if (src) {
    out.src = src;
    const cmp = cleanTag(o?.cmp);
    if (cmp) {
      out.cmp = cmp;
      const cnt = cleanTag(o?.cnt);
      if (cnt) out.cnt = cnt;
    }
  }
  if (o?.invited === true) out.invited = true;
  return out;
}

/** Jour UTC (= Abidjan) d'un horodatage : identifiant du document de compteurs. */
export const originDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Compteurs d'un jour, tels qu'enregistrés. */
export interface DayCounters {
  total?: number;
  invited?: number;
  unknown?: number;
  src?: Record<string, number>;
  cmp?: Record<string, number>;
  cnt?: Record<string, number>;
}

/**
 * Incréments à appliquer pour UNE inscription, au vu des compteurs du jour
 * (plafond de clés). Renvoie des nombres (1) : l'appelant les transforme en
 * `FieldValue.increment`.
 */
export function originIncrements(o: InstallOrigin, day: DayCounters): { total: 1; invited?: 1; unknown?: 1; src?: Record<string, 1>; cmp?: Record<string, 1>; cnt?: Record<string, 1> } {
  const out: ReturnType<typeof originIncrements> = { total: 1 };
  if (o.invited) out.invited = 1;
  if (!o.src) {
    if (!o.invited) out.unknown = 1;
    return out;
  }
  out.src = { [o.src]: 1 };
  const room = (map: Record<string, number> | undefined, key: string) => !!map?.[key] || Object.keys(map ?? {}).length < ORIGIN_MAX_KEYS;
  if (o.cmp) {
    const cmpKey = [o.src, o.cmp].join(ORIGIN_KEY_SEP);
    if (room(day.cmp, cmpKey)) {
      out.cmp = { [cmpKey]: 1 };
      if (o.cnt) {
        const cntKey = [o.src, o.cmp, o.cnt].join(ORIGIN_KEY_SEP);
        if (room(day.cnt, cntKey)) out.cnt = { [cntKey]: 1 };
      }
    }
  }
  return out;
}

// ─── Regroupement pour l'écran admin ───

export type OriginPeriod = 'month' | 'previous' | '90d' | 'all';
export const ORIGIN_PERIODS: OriginPeriod[] = ['month', 'previous', '90d', 'all'];

export interface OriginRow {
  key: string;
  count: number;
}
export interface OriginPeriodStats {
  total: number;
  invited: number | null;
  unknown: number | null;
  bySource: OriginRow[];
  byCampaign: OriginRow[];
  byContent: OriginRow[];
  others: { source: OthersCount; campaign: OthersCount; content: OthersCount };
}
/** Petits groupes réunis : leur somme (≥ 5), `few` (moins de 5), null (aucun). */
export type OthersCount = number | 'few' | null;
export interface OriginStats {
  since: string | null;
  periods: Record<OriginPeriod, OriginPeriodStats>;
}

const addDays = (day: string, n: number) => originDay(Date.parse(`${day}T00:00:00Z`) + n * 24 * 3600 * 1000);
const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** Le jour appartient-il à la période (jour de référence `today`, AAAA-MM-JJ) ? */
export function inOriginPeriod(day: string, period: OriginPeriod, today: string): boolean {
  if (day > today) return false;
  if (period === 'all') return true;
  if (period === 'month') return day.slice(0, 7) === today.slice(0, 7);
  if (period === 'previous') return day.slice(0, 7) === previousMonth(today.slice(0, 7));
  return day >= addDays(today, -89);
}

/** Nombre montré seulement à partir du seuil (sinon null : « Moins de 5 »). */
const shown = (n: number): number | null => (n >= ORIGIN_MIN_GROUP ? n : null);

/** Groupes d'au moins 5 (triés), et la somme des autres réunis SANS leur nom. */
function group(map: Record<string, number>): { rows: OriginRow[]; others: OthersCount } {
  const rows: OriginRow[] = [];
  let others = 0;
  for (const [key, count] of Object.entries(map)) {
    if (count >= ORIGIN_MIN_GROUP) rows.push({ key, count });
    else if (count > 0) others += count;
  }
  rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { rows, others: others === 0 ? null : others >= ORIGIN_MIN_GROUP ? others : 'few' };
}

function add(into: Record<string, number>, from: Record<string, number> | undefined) {
  for (const [k, v] of Object.entries(from ?? {})) if (typeof v === 'number' && v > 0) into[k] = (into[k] ?? 0) + v;
}

/** Statistiques regroupées des quatre périodes. Les petits groupes ne sortent jamais de cette fonction. */
export function aggregateOrigins(days: { id: string; data: DayCounters }[], today: string): OriginStats {
  const valid = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id));
  const since = valid.length ? valid.map((d) => d.id).sort()[0] : null;
  const periods = {} as Record<OriginPeriod, OriginPeriodStats>;
  for (const period of ORIGIN_PERIODS) {
    let total = 0;
    let invited = 0;
    let unknown = 0;
    const src: Record<string, number> = {};
    const cmp: Record<string, number> = {};
    const cnt: Record<string, number> = {};
    for (const d of valid) {
      if (!inOriginPeriod(d.id, period, today)) continue;
      total += d.data.total ?? 0;
      invited += d.data.invited ?? 0;
      unknown += d.data.unknown ?? 0;
      add(src, d.data.src);
      add(cmp, d.data.cmp);
      add(cnt, d.data.cnt);
    }
    const s = group(src);
    const c = group(cmp);
    const n = group(cnt);
    periods[period] = {
      total,
      invited: shown(invited),
      unknown: shown(unknown),
      bySource: s.rows,
      byCampaign: c.rows,
      byContent: n.rows,
      others: { source: s.others, campaign: c.others, content: n.others },
    };
  }
  return { since, periods };
}
