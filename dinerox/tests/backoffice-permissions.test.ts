import { describe, expect, it } from 'vitest';
import { checkStaffChange, effectivePermissions, PERMISSIONS, validateCustomRole, type Permission } from '../firebase/functions/src/backoffice/permissions';

/**
 * Matrice ÉCRITE À LA MAIN (docs/backoffice.md §2.2, correction du 12/10/2026 :
 * data.delete = Super Admin seulement ; D3 staff.manage ; D8 users.changePlan).
 * Elle n'est PAS recalculée depuis le code : un changement de droit doit modifier ce test.
 */
const EXPECTED: Record<string, Permission[]> = {
  superAdmin: ['users.view', 'users.create', 'users.edit', 'users.changePlan', 'users.suspend', 'users.delete', 'stats.view', 'audit.view', 'staff.manage', 'data.view', 'data.delete'],
  admin: ['users.view', 'users.create', 'users.edit', 'users.suspend', 'stats.view', 'data.view'],
  support: ['users.view', 'users.suspend'],
  analyste: ['stats.view'],
};

describe('back-office : matrice rôles × permissions', () => {
  for (const [role, perms] of Object.entries(EXPECTED)) {
    it(`${role} : exactement ses permissions`, () => {
      expect(effectivePermissions({ roleId: role, status: 'active' }).sort()).toEqual([...perms].sort());
    });
  }
  it('l’Administrateur ne supprime PAS d’opération (data.delete), mais consulte (data.view)', () => {
    const p = effectivePermissions({ roleId: 'admin', status: 'active' });
    expect(p).toContain('data.view');
    expect(p).not.toContain('data.delete');
  });
  it('collaborateur suspendu, sans rôle ou inconnu : aucune permission', () => {
    expect(effectivePermissions({ roleId: 'superAdmin', status: 'suspended' })).toEqual([]);
    expect(effectivePermissions(null)).toEqual([]);
    expect(effectivePermissions({ roleId: 'inconnu', status: 'active' })).toEqual([]);
  });
  it('rôle sur mesure : les permissions réservées sont IGNORÉES même si le document les contient', () => {
    const p = effectivePermissions({ roleId: 'r_x', status: 'active' }, [...PERMISSIONS, 'pirate']);
    expect(p.sort()).toEqual(['audit.view', 'stats.view', 'users.create', 'users.delete', 'users.edit', 'users.suspend', 'users.view'].sort());
  });
  it('rôle sur mesure portant le NOM d’un rôle fourni : n’hérite pas de ses droits', () => {
    expect(effectivePermissions({ roleId: 'r_admin', status: 'active' }, ['data.view', 'data.delete'])).toEqual([]);
  });
});

describe('back-office : rôles sur mesure', () => {
  it('accepte des permissions ordinaires', () => {
    expect(validateCustomRole({ name: 'Conformité', permissions: ['audit.view', 'users.view'] })).toEqual({ ok: true, name: 'Conformité', permissions: ['users.view', 'audit.view'] });
  });
  for (const p of ['data.view', 'data.delete', 'staff.manage', 'users.changePlan']) {
    it(`refuse ${p} (réservée)`, () => {
      expect(validateCustomRole({ name: 'Rôle X', permissions: ['users.view', p] })).toMatchObject({ ok: false, error: 'role/permission-reserved', detail: p });
    });
  }
  it('refuse un nom réservé, vide, ou une permission inconnue', () => {
    expect(validateCustomRole({ name: 'Super Admin', permissions: ['users.view'] })).toMatchObject({ ok: false, error: 'role/reserved-name' });
    expect(validateCustomRole({ name: 'admin', permissions: ['users.view'] })).toMatchObject({ ok: false, error: 'role/reserved-name' });
    expect(validateCustomRole({ name: ' ', permissions: ['users.view'] })).toMatchObject({ ok: false, error: 'role/name' });
    expect(validateCustomRole({ name: 'Rôle', permissions: [] })).toMatchObject({ ok: false, error: 'role/empty' });
    expect(validateCustomRole({ name: 'Rôle', permissions: ['users.hack'] })).toMatchObject({ ok: false, error: 'role/permission-unknown' });
  });
});

describe('back-office : règles invariantes de l’équipe', () => {
  const superA = { uid: 'A', roleId: 'superAdmin', permissions: EXPECTED.superAdmin };
  const adminActor = { uid: 'B', roleId: 'admin', permissions: EXPECTED.admin };
  const tgt = (roleId: string, status: 'active' | 'suspended' = 'active', uid = 'T') => ({ uid, roleId, status });

  it('personne ne modifie ses propres droits', () => {
    for (const change of ['role', 'suspend', 'remove', 'resetMfa'] as const) {
      expect(checkStaffChange({ actor: superA, target: tgt('superAdmin', 'active', 'A'), change, newRoleId: 'admin', activeSuperAdmins: 3 })).toBe('staff/self');
    }
  });
  it('sans staff.manage : refus', () => {
    expect(checkStaffChange({ actor: adminActor, target: tgt('support'), change: 'suspend', activeSuperAdmins: 1 })).toBe('staff/forbidden');
  });
  it('un acteur qui n’est pas Super Admin ne touche ni admin ni superAdmin (même avec staff.manage forcé)', () => {
    const forced = { uid: 'B', roleId: 'r_x', permissions: ['staff.manage'] as Permission[] };
    expect(checkStaffChange({ actor: forced, target: tgt('support'), change: 'role', newRoleId: 'admin', activeSuperAdmins: 1 })).toBe('staff/super-admin-only');
    expect(checkStaffChange({ actor: forced, target: tgt('superAdmin'), change: 'suspend', activeSuperAdmins: 2 })).toBe('staff/super-admin-only');
  });
  it('le DERNIER Super Admin actif : ni rétrogradé, ni suspendu, ni retiré', () => {
    expect(checkStaffChange({ actor: superA, target: tgt('superAdmin'), change: 'role', newRoleId: 'admin', activeSuperAdmins: 1 })).toBe('staff/last-super-admin');
    expect(checkStaffChange({ actor: superA, target: tgt('superAdmin'), change: 'suspend', activeSuperAdmins: 1 })).toBe('staff/last-super-admin');
    expect(checkStaffChange({ actor: superA, target: tgt('superAdmin'), change: 'remove', activeSuperAdmins: 1 })).toBe('staff/last-super-admin');
  });
  it('avec deux Super Admins actifs, l’un peut rétrograder l’autre ; réinitialiser sa double vérification reste permis', () => {
    expect(checkStaffChange({ actor: superA, target: tgt('superAdmin'), change: 'role', newRoleId: 'admin', activeSuperAdmins: 2 })).toBeNull();
    expect(checkStaffChange({ actor: superA, target: tgt('superAdmin'), change: 'resetMfa', activeSuperAdmins: 1 })).toBeNull();
  });
  it('un Super Admin attribue admin à un support', () => {
    expect(checkStaffChange({ actor: superA, target: tgt('support'), change: 'role', newRoleId: 'admin', activeSuperAdmins: 1 })).toBeNull();
  });
});
