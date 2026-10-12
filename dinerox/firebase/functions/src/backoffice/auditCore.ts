/**
 * Back-office — journal d'audit : contenu et chaînage, logique PURE.
 *
 * - AUCUN montant ni détail financier : `before`/`after` passent par une LISTE
 *   BLANCHE de champs (statut, formule, rôle, identité…), tout le reste est jeté.
 * - Pas d'adresse e-mail d'utilisateur en clair : domaine + empreinte (D11) ;
 *   le portail retrouve l'adresse à l'affichage tant que le compte existe.
 * - Chaînage : hash = SHA-256(hash précédent + contenu canonique). Toute ligne
 *   modifiée ou retirée hors du portail casse la chaîne et se voit.
 */
import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

export type AuditResult = 'ok' | 'denied' | 'error';

/** Champs autorisés dans `before` / `after`. */
export const DETAIL_KEYS = [
  'status',
  'plan',
  'planEndsAt',
  'provider',
  'role',
  'roleName',
  'permissions',
  'firstName',
  'lastName',
  'country',
  'currency',
  'language',
  'email',
  'mfa',
  'displayName',
] as const;

/** Champs financiers : jamais dans le journal (vérifié par les tests). */
export const FINANCIAL_KEYS = ['amount', 'toAmount', 'payee', 'note', 'categoryId', 'subcategoryId', 'receiptUrl', 'balance', 'openingBalance', 'targetAmount', 'principal', 'value', 'monthlyBudget'];

export const REASON_CODES = ['client_request', 'verification', 'fraud_suspicion', 'other'] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface AuditInput {
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  result: AuditResult;
  /** Code d'erreur d'un refus (`staff/self`, `bo/permission`…). */
  code?: string;
  reasonCode?: string;
  reasonNote?: string;
  targetUid?: string;
  /** E-mail de l'utilisateur ciblé : jamais stocké tel quel (domaine + empreinte). */
  targetEmail?: string | null;
  /** Libellé d'une cible qui n'est pas un utilisateur de l'app (collaborateur, rôle). */
  targetLabel?: string;
  spaceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Identifiants techniques (documents marqués supprimés…), 30 au plus. */
  refs?: string[];
  /** Comptages d'effets (« debtPayments: 1 ») : des nombres, jamais des montants. */
  effects?: Record<string, number>;
}

export interface AuditEntry {
  seq: number;
  atMs: number;
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  result: AuditResult;
  code: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  targetUid: string | null;
  targetDomain: string | null;
  targetEmailHash: string | null;
  targetLabel: string | null;
  spaceId: string | null;
  before: Record<string, string | number | boolean | null> | null;
  after: Record<string, string | number | boolean | null> | null;
  refs: string[] | null;
  effects: Record<string, number> | null;
  prevHash: string;
  hash: string;
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length ? v.slice(0, max) : null);

export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1).toLowerCase().slice(0, 120) : null;
}

/** « aicha.kone@exemple.ci » → « a•••@exemple.ci » (affichage d'un changement d'e-mail). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${email[0]}•••${email.slice(at)}`.slice(0, 120);
}

/** Ne garde que les champs de la liste blanche, valeurs simples et courtes. */
export function sanitizeDetail(d: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> | null {
  if (!d) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const k of DETAIL_KEYS) {
    if (!(k in d)) continue;
    let v = d[k];
    if (k === 'email' && typeof v === 'string') v = maskEmail(v);
    if (Array.isArray(v)) v = v.filter((x) => typeof x === 'string').join(',');
    if (v === undefined) continue;
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeEffects(e: Record<string, number> | undefined): Record<string, number> | null {
  if (!e) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(e)) if (/^[a-zA-Z]{1,40}$/.test(k) && Number.isInteger(v) && v >= 0 && v < 10_000) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** JSON canonique : clés triées (même contenu ⇒ même empreinte). */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

export function hashEntry(prevHash: string, body: Omit<AuditEntry, 'hash' | 'prevHash'>): string {
  return createHash('sha256').update(`${prevHash}\n${canonical(body)}`).digest('hex');
}

/** Construit la ligne (contenu nettoyé + chaînage). */
export function buildEntry(input: AuditInput, seq: number, atMs: number, prevHash: string): AuditEntry {
  const email = typeof input.targetEmail === 'string' ? input.targetEmail : null;
  const body: Omit<AuditEntry, 'hash' | 'prevHash'> = {
    seq,
    atMs,
    actorUid: input.actorUid,
    actorEmail: str(input.actorEmail, 200),
    actorRole: str(input.actorRole, 40),
    action: input.action.slice(0, 60),
    result: input.result,
    code: str(input.code, 80),
    reasonCode: str(input.reasonCode, 40),
    reasonNote: str(input.reasonNote, 300),
    targetUid: str(input.targetUid, 128),
    targetDomain: email ? emailDomain(email) : null,
    targetEmailHash: email ? emailHash(email) : null,
    targetLabel: str(input.targetLabel, 120),
    spaceId: str(input.spaceId, 128),
    before: sanitizeDetail(input.before),
    after: sanitizeDetail(input.after),
    refs: input.refs?.length ? input.refs.filter((r) => typeof r === 'string').slice(0, 30).map((r) => r.slice(0, 160)) : null,
    effects: sanitizeEffects(input.effects),
  };
  return { ...body, prevHash, hash: hashEntry(prevHash, body) };
}

/** Vérifie une suite de lignes consécutives (triées par seq). Renvoie le premier seq invalide, ou null. */
export function verifyChain(entries: AuditEntry[], startPrevHash = GENESIS_HASH): number | null {
  let prev = startPrevHash;
  let expectedSeq = entries[0]?.seq;
  for (const e of entries) {
    const { hash, prevHash, ...body } = e;
    if (e.seq !== expectedSeq || prevHash !== prev || hashEntry(prevHash, body) !== hash) return e.seq;
    prev = hash;
    expectedSeq = e.seq + 1;
  }
  return null;
}

/** Motif interne : code connu ; « Autre » exige une précision. */
export function validateReason(code: unknown, note: unknown): { ok: true; reasonCode: ReasonCode; reasonNote: string | null } | { ok: false } {
  if (typeof code !== 'string' || !(REASON_CODES as readonly string[]).includes(code)) return { ok: false };
  const n = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  if (code === 'other' && n.length < 3) return { ok: false };
  return { ok: true, reasonCode: code as ReasonCode, reasonNote: n || null };
}
