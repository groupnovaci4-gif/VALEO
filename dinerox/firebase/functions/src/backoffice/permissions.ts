/**
 * Back-office — rôles et permissions, logique PURE (testée sans émulateur).
 *
 * LE SERVEUR DÉCIDE : le portail n'affiche que ce que ces fonctions autorisent,
 * mais chaque fonction `bo…` revérifie ici, à chaque appel, à partir des
 * documents `boStaff` / `boRoles` relus (jamais d'un jeton).
 *
 * Permissions RÉSERVÉES (écrites en dur, impossibles à attribuer autrement) :
 *  - `data.view`        → Super Admin et Administrateur ;
 *  - `data.delete`      → Super Admin SEULEMENT (décision du 12/10/2026) ;
 *  - `staff.manage`     → Super Admin seulement (D3) ;
 *  - `users.changePlan` → Super Admin seulement (D8).
 * Le calcul des droits IGNORE ces codes s'ils figurent dans un autre rôle, même
 * fourni : modifier par erreur la liste d'un rôle ne suffit pas à les accorder.
 */

export const PERMISSIONS = [
  'users.view',
  'users.create',
  'users.edit',
  'users.changePlan',
  'users.suspend',
  'users.delete',
  'stats.view',
  'audit.view',
  'staff.manage',
  'data.view',
  'data.delete',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const BUILTIN_ROLE_IDS = ['superAdmin', 'admin', 'support', 'analyste'] as const;
export type BuiltinRoleId = (typeof BUILTIN_ROLE_IDS)[number];

/** Rôles fournis : dans le code, non modifiables depuis le portail. */
export const BUILTIN_ROLES: Record<BuiltinRoleId, { name: string; permissions: readonly Permission[] }> = {
  superAdmin: { name: 'Super Admin', permissions: PERMISSIONS },
  admin: { name: 'Administrateur', permissions: ['users.view', 'users.create', 'users.edit', 'users.suspend', 'stats.view', 'data.view'] },
  support: { name: 'Support', permissions: ['users.view', 'users.suspend'] },
  analyste: { name: 'Analyste', permissions: ['stats.view'] },
};

/** Seuls ces rôles fournis peuvent porter ces permissions. */
export const RESERVED: Partial<Record<Permission, readonly BuiltinRoleId[]>> = {
  'data.view': ['superAdmin', 'admin'],
  'data.delete': ['superAdmin'],
  'staff.manage': ['superAdmin'],
  'users.changePlan': ['superAdmin'],
};

export function isPermission(p: unknown): p is Permission {
  return typeof p === 'string' && (PERMISSIONS as readonly string[]).includes(p);
}

export function isBuiltinRole(r: unknown): r is BuiltinRoleId {
  return typeof r === 'string' && (BUILTIN_ROLE_IDS as readonly string[]).includes(r);
}

function allowedFor(roleId: string, p: Permission): boolean {
  const only = RESERVED[p];
  return !only || (only as readonly string[]).includes(roleId);
}

/**
 * Permissions effectives d'un collaborateur.
 * - rôle fourni : sa liste du code ;
 * - rôle sur mesure : la liste stockée (`customPermissions`), filtrée ;
 * - collaborateur inactif, rôle inconnu : aucune.
 */
export function effectivePermissions(staff: { roleId?: unknown; status?: unknown } | null | undefined, customPermissions?: unknown): Permission[] {
  if (!staff || staff.status !== 'active' || typeof staff.roleId !== 'string') return [];
  const roleId = staff.roleId;
  const source: readonly unknown[] = isBuiltinRole(roleId) ? BUILTIN_ROLES[roleId].permissions : Array.isArray(customPermissions) ? customPermissions : [];
  return PERMISSIONS.filter((p) => source.includes(p) && allowedFor(roleId, p));
}

export type RoleError = 'role/name' | 'role/reserved-name' | 'role/permission-unknown' | 'role/permission-reserved' | 'role/empty';

/** Validation d'un rôle sur mesure (création ou modification). */
export function validateCustomRole(input: { name?: unknown; permissions?: unknown }): { ok: true; name: string; permissions: Permission[] } | { ok: false; error: RoleError; detail?: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 40) return { ok: false, error: 'role/name' };
  const lower = name.toLowerCase();
  const reservedNames = [...BUILTIN_ROLE_IDS, ...Object.values(BUILTIN_ROLES).map((r) => r.name)].map((n) => n.toLowerCase());
  if (reservedNames.includes(lower)) return { ok: false, error: 'role/reserved-name' };
  if (!Array.isArray(input.permissions) || input.permissions.length === 0) return { ok: false, error: 'role/empty' };
  for (const p of input.permissions) {
    if (!isPermission(p)) return { ok: false, error: 'role/permission-unknown', detail: String(p).slice(0, 40) };
    if (RESERVED[p]) return { ok: false, error: 'role/permission-reserved', detail: p };
  }
  return { ok: true, name, permissions: PERMISSIONS.filter((p) => (input.permissions as unknown[]).includes(p)) };
}

// ─── Gestion de l'équipe : règles invariantes (§2.3) ──────────────────

export type StaffChange = 'role' | 'suspend' | 'reactivate' | 'remove' | 'resetMfa';

export interface StaffChangeInput {
  actor: { uid: string; roleId: string; permissions: readonly Permission[] };
  target: { uid: string; roleId: string; status: 'active' | 'suspended' };
  change: StaffChange;
  /** Nouveau rôle (change = 'role'). */
  newRoleId?: string;
  /** Nombre de Super Admins ACTIFS (lu dans la même transaction). */
  activeSuperAdmins: number;
}

export type StaffChangeError = 'staff/forbidden' | 'staff/self' | 'staff/super-admin-only' | 'staff/last-super-admin' | 'staff/same-role';

/** Une modification de l'équipe est-elle permise ? null = oui. */
export function checkStaffChange(i: StaffChangeInput): StaffChangeError | null {
  if (!i.actor.permissions.includes('staff.manage')) return 'staff/forbidden';
  // Personne ne modifie ses propres droits (ni statut, ni retrait, ni double vérification).
  if (i.actor.uid === i.target.uid) return 'staff/self';
  const actorIsSuper = i.actor.roleId === 'superAdmin';
  const touchesTopRole = i.target.roleId === 'superAdmin' || i.target.roleId === 'admin' || i.newRoleId === 'superAdmin' || i.newRoleId === 'admin';
  // Seul un Super Admin attribue/retire `admin` ou `superAdmin` et touche un Super Admin.
  if (touchesTopRole && !actorIsSuper) return 'staff/super-admin-only';
  if (i.change === 'role' && i.newRoleId === i.target.roleId) return 'staff/same-role';
  // Le DERNIER Super Admin actif n'est jamais rétrogradé, suspendu ni retiré.
  const losesSuper = i.change === 'suspend' || i.change === 'remove' || (i.change === 'role' && i.newRoleId !== 'superAdmin');
  if (i.target.roleId === 'superAdmin' && i.target.status === 'active' && losesSuper && i.activeSuperAdmins <= 1) return 'staff/last-super-admin';
  return null;
}
