/**
 * Back-office — garde-fou commun et journal.
 *
 * `requireStaff(req, permission, action)` : session Firebase → collaborateur
 * ACTIF dans `boStaff` → session de double vérification valide (jeton créé
 * par boLoginVerify, `boSid`) → permission. Tout refus est écrit au journal
 * (`result: 'denied'`) avant de répondre.
 */
import { getFirestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { BUILTIN_ROLES, effectivePermissions, isBuiltinRole, type Permission } from './permissions';
import { buildEntry, GENESIS_HASH, type AuditEntry, type AuditInput } from './auditCore';
import { parseKey } from './totp';

/** Clé de chiffrement des secrets de double vérification (Secret Manager, jamais dans Git). */
export const BO_MFA_KEY = defineSecret('BO_MFA_KEY');
export const mfaKey = (): Buffer => {
  try {
    return parseKey(BO_MFA_KEY.value());
  } catch {
    // Configuration absente : on refuse (jamais de repli sans chiffrement).
    throw new HttpsError('failed-precondition', 'bo/misconfigured');
  }
};

export const SESSION_MS = 12 * 3600 * 1000;

export const db = () => getFirestore();
export const COL = {
  staff: 'boStaff',
  roles: 'boRoles',
  sessions: 'boSessions',
  access: 'boAccess',
  audit: 'boAudit',
  auditHead: 'boAuditHead',
  stats: 'boStats',
  loginGuard: 'boLoginGuard',
  invites: 'boInvites',
  accountStatus: 'accountStatus',
} as const;

export interface StaffDoc {
  email: string;
  displayName: string;
  roleId: string;
  /** `invited` : invitation envoyée, pas encore acceptée — aucune permission. */
  status: 'active' | 'suspended' | 'invited';
  mfa?: {
    enrolled?: boolean;
    secretEnc?: string | null;
    pendingSecretEnc?: string | null;
    recoveryHashes?: string[];
    lastStep?: number | null;
  };
  createdAt?: number;
  createdBy?: string;
  lastLoginAt?: number | null;
}

export interface StaffCtx {
  uid: string;
  email: string;
  displayName: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
  sessionExpiresAt: number;
}

/** Nom du rôle et permissions effectives (rôle sur mesure relu dans boRoles). */
export async function resolveRole(staff: StaffDoc | undefined, tx?: Transaction): Promise<{ roleName: string; permissions: Permission[] }> {
  if (!staff) return { roleName: '', permissions: [] };
  if (isBuiltinRole(staff.roleId)) return { roleName: BUILTIN_ROLES[staff.roleId].name, permissions: effectivePermissions(staff) };
  const ref = db().doc(`${COL.roles}/${staff.roleId}`);
  const role = tx ? await tx.get(ref) : await ref.get();
  if (!role.exists) return { roleName: '', permissions: [] };
  return { roleName: String(role.get('name') ?? ''), permissions: effectivePermissions(staff, role.get('permissions')) };
}

// ─── Journal (ajout seul, chaîné) ─────────────────────────────────────

/**
 * Écrit une ligne dans une transaction. La tête de chaîne est LUE ici : à
 * appeler avant toute écriture de la transaction (règle Firestore : lectures
 * d'abord), via `openAudit(tx)` puis `write(input)`.
 */
export async function openAudit(tx: Transaction): Promise<{ write: (input: AuditInput) => AuditEntry }> {
  const headRef = db().doc(`${COL.auditHead}/head`);
  const head = await tx.get(headRef);
  let seq = Number(head.get('count') ?? 0);
  let prev = String(head.get('lastHash') ?? GENESIS_HASH);
  return {
    write(input) {
      seq += 1;
      const entry = buildEntry(input, seq, Date.now(), prev);
      prev = entry.hash;
      const id = String(seq).padStart(12, '0');
      tx.create(db().doc(`${COL.audit}/${id}`), entry);
      tx.set(headRef, { count: seq, lastId: id, lastHash: entry.hash });
      return entry;
    },
  };
}

/** Copie vers Cloud Logging (D12) — après validation de la transaction. */
export function mirrorToLogging(entries: (AuditEntry | undefined)[]) {
  for (const e of entries) if (e) logger.info('bo-audit', { boAudit: e });
}

/** Ligne de journal seule (refus, actions hors Firestore). */
export async function writeAudit(input: AuditInput): Promise<void> {
  const entry = await db().runTransaction(async (tx) => (await openAudit(tx)).write(input));
  mirrorToLogging([entry]);
}

/** Refus : journalisé, puis erreur renvoyée au portail. */
export async function deny(
  actor: { uid: string | null; email: string | null; roleId: string | null },
  action: string,
  code: string,
  extra: Partial<AuditInput> = {},
  httpsCode: 'permission-denied' | 'unauthenticated' | 'failed-precondition' | 'resource-exhausted' | 'invalid-argument' | 'not-found' = 'permission-denied',
): Promise<never> {
  await writeAudit({ actorUid: actor.uid, actorEmail: actor.email, actorRole: actor.roleId, action, result: 'denied', code, ...extra });
  throw new HttpsError(httpsCode, code);
}

// ─── Garde-fou ────────────────────────────────────────────────────────

export async function requireStaff(req: CallableRequest, permission: Permission | null, action: string): Promise<StaffCtx> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'bo/auth');
  const uid = req.auth.uid;
  const tokenEmail = (req.auth.token.email as string | undefined)?.toLowerCase() ?? null;
  const [staffSnap, sessionSnap] = await Promise.all([db().doc(`${COL.staff}/${uid}`).get(), db().doc(`${COL.sessions}/${uid}`).get()]);
  const staff = staffSnap.exists ? (staffSnap.data() as StaffDoc) : undefined;
  const actor = { uid, email: staff?.email ?? tokenEmail, roleId: staff?.roleId ?? null };
  if (!staff) return deny(actor, action, 'bo/not-staff');
  if (staff.status !== 'active') return deny(actor, action, `bo/staff-${staff.status}`);
  const sid = req.auth.token.boSid;
  const expiresAt = Number(sessionSnap.get('expiresAt') ?? 0);
  if (typeof sid !== 'string' || !sessionSnap.exists || sessionSnap.get('sid') !== sid || expiresAt <= Date.now()) {
    return deny(actor, action, 'bo/session', {}, 'unauthenticated');
  }
  const { roleName, permissions } = await resolveRole(staff);
  if (permission && !permissions.includes(permission)) return deny(actor, action, 'bo/permission', { after: { permissions: [permission] } });
  return { uid, email: staff.email, displayName: staff.displayName, roleId: staff.roleId, roleName, permissions, sessionExpiresAt: expiresAt };
}

/** Champs d'acteur pour une ligne de journal. */
export const actorOf = (c: StaffCtx) => ({ actorUid: c.uid, actorEmail: c.email, actorRole: c.roleId });

export const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function bad(code = 'bo/invalid'): never {
  throw new HttpsError('invalid-argument', code);
}
