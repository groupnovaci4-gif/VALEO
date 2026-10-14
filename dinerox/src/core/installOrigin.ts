/**
 * Croissance, étape 5 — origine des installations. Module PUR (testé).
 *
 * Décisions du fondateur (2026-10-14) :
 * - aucun outil de pistage tiers, aucun identifiant publicitaire : seulement
 *   les paramètres `src` / `cmp` / `cnt` des liens DineroX et le referrer de
 *   Google Play ;
 * - l'origine est COMPTÉE une seule fois, à l'inscription, dans des compteurs
 *   anonymes (serveur) : jamais rattachée à une personne. Le profil ne garde
 *   qu'un marqueur oui/non « déjà compté » (`originCounted`) ;
 * - écran admin : chiffres regroupés, groupes de moins de 5 réunis ;
 * - jamais le code d'invitation lui-même : seulement « venue d'un lien
 *   d'invitation » oui/non.
 * Miroir côté serveur : firebase/functions/src/installOrigin.ts (test de parité).
 */
import { cleanTag, parseInstallReferrer, type LinkParams } from './referral';

/** Sources reconnues (liste validée par le fondateur). Toute autre valeur devient `other`. */
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

/** Seuil de regroupement de l'écran admin : un groupe plus petit est réuni dans « Autres ». */
export const ORIGIN_MIN_GROUP = 5;
/** Délai après l'inscription pendant lequel l'origine peut encore être comptée (réseau absent à l'inscription). */
export const ORIGIN_WINDOW_DAYS = 7;

/** Origine d'une installation, gardée sur l'appareil jusqu'à l'inscription. */
export interface InstallOrigin {
  src?: OriginSource;
  cmp?: string;
  cnt?: string;
  /** Venue d'un lien d'invitation (le code n'est jamais gardé ici). */
  invited?: boolean;
}

export function isOriginSource(v: unknown): v is OriginSource {
  return typeof v === 'string' && (ORIGIN_SOURCES as readonly string[]).includes(v);
}

/** Source nettoyée : une valeur hors liste devient `other` ; absente reste absente. */
export function normalizeSource(v: unknown): OriginSource | undefined {
  const tag = cleanTag(v);
  if (!tag) return undefined;
  return isOriginSource(tag) ? tag : 'other';
}

/** Origine nettoyée (même règle que le serveur). Campagne et contenu n'existent qu'avec une source. */
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

/** Une origine porte-t-elle une information (sinon : « Origine inconnue ») ? */
export const hasOrigin = (o: InstallOrigin | null | undefined): boolean => !!o && (!!o.src || !!o.invited);

/** Origine d'un lien DineroX (`/i/{code}`, `/a`, `/t/{code}`) : `invited` seulement pour un code de parrainage. */
export function originFromLink(p: LinkParams): InstallOrigin {
  return cleanOrigin({ src: p.src, cmp: p.cmp, cnt: p.cnt, invited: !!p.code });
}

/**
 * Referrer Google Play : paramètres d'un lien DineroX (`ref`, `src`, `cmp`,
 * `cnt`) ; sans lien, Play renvoie `utm_source=google-play&utm_medium=organic`
 * → « Recherche sur Google Play ». Tout autre referrer : rien (origine inconnue).
 */
export function originFromReferrer(raw: unknown): InstallOrigin {
  const p = parseInstallReferrer(raw);
  const fromLink = originFromLink(p);
  if (hasOrigin(fromLink)) return fromLink;
  if (typeof raw === 'string' && raw.length <= 1000) {
    const q = new Map(raw.split('&').map((part): [string, string] => [part.split('=')[0] ?? '', part.split('=')[1] ?? '']));
    if (q.get('utm_source') === 'google-play' && q.get('utm_medium') === 'organic') return { src: 'play_store' };
  }
  return {};
}

// ─── Liens de campagne (écran admin) ───

export interface CampaignLinks {
  /** Fiche Google Play avec le referrer : fonctionne sans le domaine, dès la publication. */
  play: string;
  /** Lien `https://{host}/a?…` : fonctionne quand le domaine est branché. */
  domain: string;
}

/** Saisie d'une campagne ou d'un contenu : vide (facultatif) ou étiquette valide. */
export function isValidTagInput(v: string): boolean {
  return v.trim() === '' || cleanTag(v) === v.trim().toLowerCase();
}

/** Les deux liens d'une campagne, ou null si une saisie est invalide. */
export function campaignLinks(input: { host: string; androidPackage: string; src: OriginSource; cmp?: string; cnt?: string }): CampaignLinks | null {
  if (!isOriginSource(input.src)) return null;
  const cmpIn = (input.cmp ?? '').trim();
  const cntIn = (input.cnt ?? '').trim();
  if (!isValidTagInput(cmpIn) || !isValidTagInput(cntIn)) return null;
  const cmp = cleanTag(cmpIn);
  const cnt = cmp ? cleanTag(cntIn) : undefined;
  const parts = [`src=${input.src}`, cmp ? `cmp=${cmp}` : null, cnt ? `cnt=${cnt}` : null].filter(Boolean).join('&');
  return {
    play: `https://play.google.com/store/apps/details?id=${input.androidPackage}&referrer=${encodeURIComponent(parts)}`,
    domain: `https://${input.host}/a?${parts}`,
  };
}

// ─── Statistiques renvoyées par le serveur (déjà regroupées) ───

export type OriginPeriod = 'month' | 'previous' | '90d' | 'all';
export const ORIGIN_PERIODS: OriginPeriod[] = ['month', 'previous', '90d', 'all'];

/**
 * Un groupe d'au moins 5 inscriptions. Clé : `src`, `src~cmp` ou `src~cmp~cnt`.
 * Les groupes plus petits ne quittent JAMAIS le serveur : ils sont réunis, sans nom, dans `others`.
 */
export interface OriginRow {
  key: string;
  count: number;
}

/** Séparateur des clés de campagne et de contenu (absent des étiquettes, qui n'acceptent que a-z 0-9 - _). */
export const ORIGIN_KEY_SEP = '~';
export const originKeyParts = (key: string): string[] => key.split(ORIGIN_KEY_SEP);

export interface OriginPeriodStats {
  total: number;
  /** null = moins de 5 (même règle que les groupes). */
  invited: number | null;
  unknown: number | null;
  bySource: OriginRow[];
  byCampaign: OriginRow[];
  byContent: OriginRow[];
  /** Groupes de moins de 5 réunis sans nom : leur somme (≥ 5), `few` (moins de 5), null (aucun). */
  others: { source: OthersCount; campaign: OthersCount; content: OthersCount };
}
export type OthersCount = number | 'few' | null;

export interface OriginStats {
  /** Premier jour compté (AAAA-MM-JJ), null si rien n'a encore été compté. */
  since: string | null;
  periods: Record<OriginPeriod, OriginPeriodStats>;
}

/** Pourcentage arrondi d'un groupe dans le total (0 si total nul). */
export const share = (count: number, total: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);
