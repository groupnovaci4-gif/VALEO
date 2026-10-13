/**
 * Parrainage — partie PURE de l'application (affichage, liens, saisie du code).
 *
 * Le serveur fait foi : la validation des filleuls, les récompenses et les
 * contrôles anti-triche sont calculés dans firebase/functions/src/referral.ts.
 * Les constantes et la lecture des liens sont dupliquées ici à l'identique
 * (`tests/referral.test.ts` vérifie la parité). Aucune donnée financière.
 */
import type { ReferralProgress } from './types';

export const REFERRAL = {
  CODE_LENGTH: 6,
  CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  APPLY_WINDOW_DAYS: 7,
  VALIDATION_DEADLINE_DAYS: 30,
  WEEK_DAYS: 7,
  MIN_ACTIVE_DAYS: 5,
  MIN_EXPENSES: 5,
  MIN_INCOMES: 1,
  MIN_GOALS: 2,
  FILLEULS_PER_REWARD: 5,
  MONTHS_PER_REWARD: 1,
  /** Carte « Inviter des amis » de l'accueil : après la 5e saisie réussie. */
  HOME_CARD_AFTER_ENTRIES: 5,
} as const;

const DAY_MS = 24 * 3600 * 1000;

export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]/g, '') : '';
}

export function isValidCode(code: string): boolean {
  if (code.length !== REFERRAL.CODE_LENGTH) return false;
  for (const ch of code) if (!REFERRAL.CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export interface LinkParams {
  code?: string;
  src?: string;
  cmp?: string;
  cnt?: string;
}

export function cleanTag(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : undefined;
}

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

/** Referrer d'installation Google Play (`ref=ABC123&src=whatsapp`…). */
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

/** Lien d'invitation : `https://{host}/i/{code}` + `src`/`cmp`/`cnt` facultatifs (jamais de donnée libre). */
export function inviteLink(host: string, code: string, tags: Omit<LinkParams, 'code'> = {}): string {
  const q = (['src', 'cmp', 'cnt'] as const)
    .map((k) => [k, cleanTag(tags[k])] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `https://${host}/i/${code}${q ? `?${q}` : ''}`;
}

/** Code d'un lien d'invitation reconnu (domaines DineroX ou `dinerox://i/{code}`), sinon null. */
export function codeFromInviteUrl(url: string, hosts: readonly string[], scheme: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(\/[^?#]*)?/i.exec(url.trim());
  if (!m) return null;
  const [, proto, host, path = ''] = m;
  let segs: string[];
  if (proto.toLowerCase() === scheme) segs = [host, ...path.split('/')].filter(Boolean);
  else if (proto.toLowerCase() === 'https' && hosts.includes(host.toLowerCase())) segs = path.split('/').filter(Boolean);
  else return null;
  if (segs.length !== 2 || segs[0] !== 'i') return null;
  const code = normalizeCode(segs[1]);
  return isValidCode(code) ? code : null;
}

/** Le code peut-il encore être saisi (7 jours après l'inscription, une seule fois) ? */
export function canEnterCode(signupAt: number | null | undefined, alreadyReferred: boolean, now: number): boolean {
  if (alreadyReferred || !signupAt) return false;
  return now - signupAt <= REFERRAL.APPLY_WINDOW_DAYS * DAY_MS;
}

/** Lignes de la carte « Votre semaine DineroX » (compteurs seulement, aucun montant). */
export function weekChecklist(p: Pick<ReferralProgress, 'day' | 'activeDays' | 'expenses' | 'incomes' | 'goals'>) {
  return {
    day: { value: Math.min(p.day, REFERRAL.WEEK_DAYS), of: REFERRAL.WEEK_DAYS },
    activeDays: { value: Math.min(p.activeDays, REFERRAL.MIN_ACTIVE_DAYS), of: REFERRAL.MIN_ACTIVE_DAYS, done: p.activeDays >= REFERRAL.MIN_ACTIVE_DAYS },
    expenses: { value: Math.min(p.expenses, REFERRAL.MIN_EXPENSES), of: REFERRAL.MIN_EXPENSES, done: p.expenses >= REFERRAL.MIN_EXPENSES },
    income: { done: p.incomes >= REFERRAL.MIN_INCOMES },
    goals: { value: Math.min(p.goals, REFERRAL.MIN_GOALS), of: REFERRAL.MIN_GOALS, done: p.goals >= REFERRAL.MIN_GOALS },
  };
}

/**
 * Code de refus contenu dans le message d'une erreur de Cloud Function
 * (`referral/self`, parfois suivi du statut HTTP : `referral/self [400]`).
 */
export function refusalCode(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const m = /^referral\/[a-z-]+/.exec(message.trim());
  return m ? m[0] : null;
}

/** Clé i18n du message d'un refus renvoyé par le serveur. */
export function refusalKey(code: string | null | undefined):
  | 'ref.err.invalid'
  | 'ref.err.unknown'
  | 'ref.err.self'
  | 'ref.err.already'
  | 'ref.err.tooLate'
  | 'ref.err.device'
  | 'ref.err.generic' {
  switch (code) {
    case 'referral/invalid-code':
      return 'ref.err.invalid';
    case 'referral/unknown-code':
      return 'ref.err.unknown';
    case 'referral/self':
      return 'ref.err.self';
    case 'referral/already-referred':
      return 'ref.err.already';
    case 'referral/too-late':
      return 'ref.err.tooLate';
    case 'referral/device-used':
    case 'referral/device-required':
      return 'ref.err.device';
    default:
      return 'ref.err.generic';
  }
}
