/**
 * Back-office — équipe et rôles sur mesure (`staff.manage`, Super Admin seul).
 *
 * Règles (checkStaffChange, testées) : personne ne modifie ses propres droits ;
 * seul un Super Admin attribue `admin`/`superAdmin` ou touche un Super Admin ;
 * le DERNIER Super Admin actif n'est jamais rétrogradé, suspendu ni retiré —
 * contrôlé DANS la transaction (deux demandes simultanées ne passent pas toutes
 * les deux). Les permissions réservées (`data.*`, `staff.manage`,
 * `users.changePlan`) sont refusées dans un rôle sur mesure.
 */
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { actorOf, bad, COL, db, deny, mirrorToLogging, openAudit, requireStaff, type StaffDoc } from './context';
import { BUILTIN_ROLE_IDS, BUILTIN_ROLES, checkStaffChange, effectivePermissions, isBuiltinRole, validateCustomRole, type StaffChange } from './permissions';
import { cleanEmail, cleanName } from './registry';

const uidArg = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : bad('bo/uid'));
const roleIdArg = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : bad('bo/role'));

async function roleExists(roleId: string): Promise<boolean> {
  return isBuiltinRole(roleId) || (await db().doc(`${COL.roles}/${roleId}`).get()).exists;
}

export async function listStaff(req: CallableRequest) {
  await requireStaff(req, 'staff.manage', 'staff.list');
  const snap = await db().collection(COL.staff).limit(200).get();
  const custom = await db().collection(COL.roles).limit(50).get();
  const roleNames = new Map<string, string>([...BUILTIN_ROLE_IDS.map((r) => [r, BUILTIN_ROLES[r].name] as [string, string]), ...custom.docs.map((d) => [d.id, String(d.get('name'))] as [string, string])]);
  return {
    staff: snap.docs.map((d) => {
      const s = d.data() as StaffDoc;
      return { uid: d.id, email: s.email, displayName: s.displayName, roleId: s.roleId, roleName: roleNames.get(s.roleId) ?? '', status: s.status, mfaEnrolled: s.mfa?.enrolled === true, lastLoginAt: s.lastLoginAt ?? null, createdAt: s.createdAt ?? null };
    }),
  };
}

/** Ajoute un collaborateur (compte sans mot de passe : il le choisit via le lien reçu). */
export async function inviteStaff(req: CallableRequest) {
  const c = await requireStaff(req, 'staff.manage', 'staff.invite');
  const email = cleanEmail(req.data?.email) ?? bad('bo/email');
  const displayName = cleanName(req.data?.displayName) ?? bad('bo/displayName');
  const roleId = roleIdArg(req.data?.roleId);
  if (!(await roleExists(roleId))) bad('bo/role');
  const actor = { uid: c.uid, email: c.email, roleId: c.roleId };
  if ((roleId === 'superAdmin' || roleId === 'admin') && c.roleId !== 'superAdmin') return deny(actor, 'staff.invite', 'staff/super-admin-only', { targetLabel: displayName });
  let user = await getAuth().getUserByEmail(email).catch(() => null);
  // D15 : adresse DÉDIÉE au travail, distincte d'un compte personnel de l'app.
  if (user && (await db().doc(`users/${user.uid}`).get()).exists) return deny(actor, 'staff.invite', 'bo/staff-has-app-account', { targetLabel: displayName }, 'failed-precondition');
  if (user && (await db().doc(`${COL.staff}/${user.uid}`).get()).exists) throw new HttpsError('already-exists', 'bo/already-staff');
  if (!user) user = await getAuth().createUser({ email, emailVerified: false, displayName });
  const uid = user.uid;
  const now = Date.now();
  const entry = await db().runTransaction(async (tx) => {
    const audit = await openAudit(tx);
    tx.create(db().doc(`${COL.staff}/${uid}`), { email, displayName, roleId, status: 'active', mfa: { enrolled: false, secretEnc: null, pendingSecretEnc: null, recoveryHashes: [], lastStep: null }, createdAt: now, createdBy: c.uid, lastLoginAt: null } satisfies StaffDoc);
    return audit.write({ ...actorOf(c), action: 'staff.invite', result: 'ok', targetUid: uid, targetLabel: displayName, after: { role: roleId, status: 'active' } });
  });
  mirrorToLogging([entry]);
  return { uid };
}

/** Modification d'un collaborateur, en transaction avec le comptage des Super Admins actifs. */
async function changeStaff(req: CallableRequest, change: StaffChange, action: string) {
  // Droit vérifié AVANT les paramètres : un refus est toujours journalisé.
  const c = await requireStaff(req, 'staff.manage', action);
  const target = uidArg(req.data?.uid);
  const newRoleId = change === 'role' ? roleIdArg(req.data?.roleId) : undefined;
  if (newRoleId !== undefined && !(await roleExists(newRoleId))) bad('bo/role');
  const res = await db().runTransaction(async (tx) => {
    const ref = db().doc(`${COL.staff}/${target}`);
    const snap = await tx.get(ref);
    const supers = await tx.get(db().collection(COL.staff).where('roleId', '==', 'superAdmin').where('status', '==', 'active'));
    const actorSnap = await tx.get(db().doc(`${COL.staff}/${c.uid}`));
    const audit = await openAudit(tx);
    if (!snap.exists) return { error: 'bo/staff-not-found' as const };
    const t = snap.data() as StaffDoc;
    // Acteur relu DANS la transaction : un droit retiré entre-temps compte.
    const a = actorSnap.data() as StaffDoc | undefined;
    const err = checkStaffChange({
      actor: { uid: c.uid, roleId: a?.roleId ?? '', permissions: effectivePermissions(a) },
      target: { uid: target, roleId: t.roleId, status: t.status },
      change,
      newRoleId,
      activeSuperAdmins: supers.size,
    });
    if (err) return { error: err, label: t.displayName };
    const before = { role: t.roleId, status: t.status, mfa: t.mfa?.enrolled ? 'enrolled' : 'none' };
    let after: Record<string, unknown> = {};
    const sessionRef = db().doc(`${COL.sessions}/${target}`);
    if (change === 'role') {
      tx.update(ref, { roleId: newRoleId });
      after = { role: newRoleId };
    } else if (change === 'suspend') {
      tx.update(ref, { status: 'suspended' });
      tx.delete(sessionRef);
      after = { status: 'suspended' };
    } else if (change === 'reactivate') {
      if (t.status === 'active') return { error: 'bo/no-change' as const, label: t.displayName };
      tx.update(ref, { status: 'active' });
      after = { status: 'active' };
    } else if (change === 'remove') {
      tx.delete(ref);
      tx.delete(sessionRef);
      after = { status: 'removed' };
    } else if (change === 'resetMfa') {
      tx.update(ref, { mfa: { enrolled: false, secretEnc: null, pendingSecretEnc: null, recoveryHashes: [], lastStep: null } });
      tx.delete(sessionRef);
      after = { mfa: 'reset' };
    }
    const entry = audit.write({ ...actorOf(c), action, result: 'ok', targetUid: target, targetLabel: t.displayName, before, after });
    return { entry };
  });
  if ('error' in res && res.error) {
    if (res.error === 'bo/staff-not-found') throw new HttpsError('not-found', res.error);
    if (res.error === 'bo/no-change') throw new HttpsError('failed-precondition', res.error);
    return deny({ uid: c.uid, email: c.email, roleId: c.roleId }, action, res.error, { targetUid: target, targetLabel: res.label, after: newRoleId ? { role: newRoleId } : undefined });
  }
  mirrorToLogging([res.entry]);
  return { ok: true };
}

export const setStaffRole = (req: CallableRequest) => changeStaff(req, 'role', 'staff.role');
export const setStaffSuspended = (req: CallableRequest) => (req.data?.suspended === true ? changeStaff(req, 'suspend', 'staff.suspend') : changeStaff(req, 'reactivate', 'staff.reactivate'));
export const removeStaff = (req: CallableRequest) => changeStaff(req, 'remove', 'staff.remove');
export const resetStaffMfa = (req: CallableRequest) => changeStaff(req, 'resetMfa', 'staff.mfa-reset');

// ─── Rôles sur mesure ─────────────────────────────────────────────────

export async function listRoles(req: CallableRequest) {
  await requireStaff(req, 'staff.manage', 'role.list');
  const custom = await db().collection(COL.roles).limit(50).get();
  return {
    roles: [
      ...BUILTIN_ROLE_IDS.map((id) => ({ id, name: BUILTIN_ROLES[id].name, permissions: [...BUILTIN_ROLES[id].permissions], builtIn: true })),
      ...custom.docs.map((d) => ({ id: d.id, name: String(d.get('name')), permissions: effectivePermissions({ roleId: d.id, status: 'active' }, d.get('permissions')), builtIn: false })),
    ],
  };
}

export async function saveRole(req: CallableRequest) {
  const c = await requireStaff(req, 'staff.manage', 'role.save');
  const actor = { uid: c.uid, email: c.email, roleId: c.roleId };
  const id = req.data?.id === undefined || req.data?.id === null ? null : roleIdArg(req.data.id);
  if (id && isBuiltinRole(id)) return deny(actor, 'role.save', 'role/builtin', { targetLabel: id });
  const v = validateCustomRole({ name: req.data?.name, permissions: req.data?.permissions });
  if (!v.ok) {
    // Une permission réservée dans un rôle sur mesure : refus JOURNALISÉ.
    if (v.error === 'role/permission-reserved' || v.error === 'role/reserved-name') return deny(actor, 'role.save', v.error, { targetLabel: String(req.data?.name ?? '').slice(0, 40), after: { permissions: v.detail ? [v.detail] : [] } });
    bad(v.error);
  }
  const ref = id ? db().doc(`${COL.roles}/${id}`) : db().collection(COL.roles).doc(`r_${Date.now().toString(36)}`);
  const now = Date.now();
  const entry = await db().runTransaction(async (tx) => {
    const same = await tx.get(db().collection(COL.roles).where('nameLower', '==', v.name.toLowerCase()).limit(2));
    const cur = await tx.get(ref);
    const audit = await openAudit(tx);
    if (same.docs.some((d) => d.id !== ref.id)) throw new HttpsError('already-exists', 'role/name-taken');
    if (id && !cur.exists) throw new HttpsError('not-found', 'role/not-found');
    tx.set(ref, { name: v.name, nameLower: v.name.toLowerCase(), permissions: v.permissions, builtIn: false, createdAt: cur.get('createdAt') ?? now, createdBy: cur.get('createdBy') ?? c.uid, updatedAt: now });
    return audit.write({
      ...actorOf(c),
      action: 'role.save',
      result: 'ok',
      targetLabel: v.name,
      before: cur.exists ? { roleName: cur.get('name'), permissions: cur.get('permissions') } : undefined,
      after: { roleName: v.name, permissions: v.permissions },
    });
  });
  mirrorToLogging([entry]);
  return { id: ref.id };
}

export async function deleteRole(req: CallableRequest) {
  const c = await requireStaff(req, 'staff.manage', 'role.delete');
  const id = roleIdArg(req.data?.id);
  if (isBuiltinRole(id)) return deny({ uid: c.uid, email: c.email, roleId: c.roleId }, 'role.delete', 'role/builtin', { targetLabel: id });
  const entry = await db().runTransaction(async (tx) => {
    const ref = db().doc(`${COL.roles}/${id}`);
    const cur = await tx.get(ref);
    const used = await tx.get(db().collection(COL.staff).where('roleId', '==', id).limit(1));
    const audit = await openAudit(tx);
    if (!cur.exists) throw new HttpsError('not-found', 'role/not-found');
    if (!used.empty) throw new HttpsError('failed-precondition', 'role/in-use');
    tx.delete(ref);
    return audit.write({ ...actorOf(c), action: 'role.delete', result: 'ok', targetLabel: String(cur.get('name')), before: { roleName: cur.get('name'), permissions: cur.get('permissions') } });
  });
  mirrorToLogging([entry]);
  return { ok: true };
}
