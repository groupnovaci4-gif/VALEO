/**
 * Croissance, étape 4 — demande d'avis sur le store. Module PUR (testé).
 *
 * Règles du fondateur (2026-10-14) :
 * - fenêtre officielle de Google Play (Apple plus tard) pour les demandes
 *   AUTOMATIQUES seulement ; rien avant (aucune question qui filtre les gens
 *   contents), rien après (ni merci, ni trophée, ni mois Plus) ;
 * - deux moments positifs : « Objectif atteint » fermé, cagnotte de tontine
 *   reçue (les trophées sont exclus) ;
 * - jamais à la première session, jamais pendant une saisie, jamais après une
 *   action qui a échoué, jamais pour un compte « enfant » ;
 * - rarement : compte de 14 jours, 7 jours de saisie, 120 jours entre deux
 *   demandes, 3 au total, plus rien après un passage par la ligne du menu ;
 * - la ligne « Donner mon avis » du menu ouvre DIRECTEMENT la page du store
 *   (la fenêtre de Google peut ne rien afficher à cause des quotas) et reste
 *   cachée tant que le réglage distant `config/app/items/store` ne l'active pas.
 */
import type { Millis, Role } from './types';

export const REVIEW_MIN_ACCOUNT_DAYS = 14;
export const REVIEW_MIN_ENTRY_DAYS = 7;
export const REVIEW_INTERVAL_DAYS = 120;
export const REVIEW_MAX_REQUESTS = 3;
/** Délai minimal entre le retour à l'Accueil et la demande. */
export const REVIEW_DELAY_MS = 2000;

const DAY = 24 * 60 * 60 * 1000;

export type ReviewMoment = 'goal' | 'tontine';

/** Mémoire locale, par compte et par téléphone (`storageKey(uid, 'storeReview')`). */
export interface ReviewState {
  /** Première ouverture de l'application par ce compte sur ce téléphone. */
  firstSeenAt: Millis | null;
  /** Dates des demandes automatiques déjà faites (on ne sait jamais si la fenêtre s'est affichée). */
  requests: Millis[];
  /** La personne a utilisé la ligne « Donner mon avis » : plus aucune demande automatique. */
  menuUsed: boolean;
}

export const EMPTY_REVIEW_STATE: ReviewState = { firstSeenAt: null, requests: [], menuUsed: false };

/** Lecture tolérante de la mémoire locale (valeur absente ou abîmée → état vide). */
export function parseReviewState(raw: unknown): ReviewState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return {
    firstSeenAt: num(r.firstSeenAt) ? r.firstSeenAt : null,
    requests: Array.isArray(r.requests) ? r.requests.filter(num).sort((a, b) => a - b) : [],
    menuUsed: r.menuUsed === true,
  };
}

/** Première ouverture : la date est posée une fois ; `firstSession` vaut vrai pendant toute cette session. */
export function markSeen(state: ReviewState, now: Millis): { state: ReviewState; firstSession: boolean } {
  if (state.firstSeenAt) return { state, firstSession: false };
  return { state: { ...state, firstSeenAt: now }, firstSession: true };
}

export const withRequest = (state: ReviewState, now: Millis): ReviewState => ({ ...state, requests: [...state.requests, now] });
export const withMenuUsed = (state: ReviewState): ReviewState => ({ ...state, menuUsed: true });

/** Journée locale d'un horodatage (AAAA-MM-JJ). */
const localDay = (ms: Millis) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Nombre de jours DIFFÉRENTS où la personne a saisi au moins une opération (date de saisie, pas date de l'opération). */
export function entryDays(transactions: readonly { createdAt: Millis; createdBy: string; deleted?: boolean }[], uid: string): number {
  return new Set(transactions.filter((t) => !t.deleted && t.createdBy === uid && t.createdAt > 0).map((t) => localDay(t.createdAt))).size;
}

/** Ce qui empêcherait une demande à cet instant (`busy` : écran occupé, à réessayer au prochain retour à l'Accueil). */
export type ReviewBlock =
  | 'no_moment'
  | 'store_unavailable'
  | 'offline'
  | 'child'
  | 'first_session'
  | 'action_failed'
  | 'menu_used'
  | 'max_requests'
  | 'too_soon'
  | 'account_too_new'
  | 'too_few_entry_days'
  | 'busy';

export interface ReviewContext {
  now: Millis;
  moment: ReviewMoment | null;
  /** Fenêtre native présente (Android avec Google Play, iPhone hors TestFlight) ; faux sur le web. */
  storeAvailable: boolean;
  online: boolean;
  role: Role | null;
  firstSession: boolean;
  /** Une action a échoué pendant cette session. */
  actionFailed: boolean;
  accountCreatedAt: Millis | null;
  entryDays: number;
  /** Feuille de saisie ou fenêtre ouverte, clavier visible, micro ouvert, voix du coach en cours. */
  busy: boolean;
}

export type ReviewDecision = { ask: true } | { ask: false; reason: ReviewBlock };

/** Décision unique. L'ordre compte : les blocages définitifs d'abord, l'écran occupé en dernier. */
export function reviewDecision(state: ReviewState, ctx: ReviewContext): ReviewDecision {
  const no = (reason: ReviewBlock): ReviewDecision => ({ ask: false, reason });
  if (!ctx.moment) return no('no_moment');
  if (!ctx.storeAvailable) return no('store_unavailable');
  if (!ctx.online) return no('offline');
  if (ctx.role === 'child') return no('child');
  if (ctx.firstSession || !state.firstSeenAt) return no('first_session');
  if (ctx.actionFailed) return no('action_failed');
  if (state.menuUsed) return no('menu_used');
  if (state.requests.length >= REVIEW_MAX_REQUESTS) return no('max_requests');
  const last = state.requests[state.requests.length - 1];
  if (last && ctx.now - last < REVIEW_INTERVAL_DAYS * DAY) return no('too_soon');
  if (!ctx.accountCreatedAt || ctx.now - ctx.accountCreatedAt < REVIEW_MIN_ACCOUNT_DAYS * DAY) return no('account_too_new');
  if (ctx.entryDays < REVIEW_MIN_ENTRY_DAYS) return no('too_few_entry_days');
  if (ctx.busy) return no('busy');
  return { ask: true };
}

/** Le moment en attente est-il gardé pour un prochain retour à l'Accueil ? Seulement si l'écran était occupé. */
export const keepMoment = (d: ReviewDecision): boolean => !d.ask && d.reason === 'busy';

// ─── Ligne du menu « Donner mon avis » : page du store, réglage distant ───

/** Réglage distant `config/app/items/store` (écrit par un administrateur). */
export interface StoreConfig {
  /** Active la ligne « Donner mon avis » (faux tant que l'application n'est pas publiée). */
  reviewMenu: boolean;
  /** Page App Store (plus tard) : sans adresse valide, la ligne reste cachée sur iPhone. */
  appStoreUrl: string | null;
}

export function isAppStoreUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/apps\.apple\.com\/([a-z]{2}\/)?app\/([a-z0-9-]+\/)?id\d{6,12}\/?$/.test(url.trim());
}

export function parseStoreConfig(raw: unknown): StoreConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { reviewMenu: r.reviewMenu === true, appStoreUrl: isAppStoreUrl(r.appStoreUrl) ? r.appStoreUrl.trim() : null };
}

/** Identifiant Play : lettres, chiffres, points, soulignés (`com.dinerox.app`). */
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Pages du store à ouvrir pour la ligne du menu, dans l'ordre d'essai ; vide =
 * ligne cachée. Android : l'application Play Store, sinon la page web Play.
 * iPhone : la page App Store publiée dans le réglage. Web : la page web Play.
 */
export function storePageUrls(platform: string, androidPackage: string, config: StoreConfig): string[] {
  if (!config.reviewMenu) return [];
  if (platform === 'ios') return config.appStoreUrl ? [config.appStoreUrl] : [];
  if (!PACKAGE.test(androidPackage)) return [];
  const web = `https://play.google.com/store/apps/details?id=${androidPackage}`;
  return platform === 'android' ? [`market://details?id=${androidPackage}`, web] : [web];
}
