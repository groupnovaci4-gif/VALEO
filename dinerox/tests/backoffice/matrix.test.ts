/**
 * Matrice COMPLÈTE : chaque rôle × chaque fonction `bo…`, appelée par son export
 * réel. Les tableaux attendus sont écrits à la main (docs/backoffice.md §2.2 et
 * décisions du 12/10/2026), jamais recalculés depuis le code. Chaque refus doit
 * laisser une ligne `denied` au journal.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { auditLines, db, outcome, staff, type Caller } from './helpers';

const NEEDS: Record<string, string | null> = {
  boMe: null,
  boSearchUsers: 'users.view',
  boListUsers: 'users.view',
  boGetUser: 'users.view',
  boCreateUser: 'users.create',
  boUpdateUser: 'users.edit',
  boSetPlan: 'users.changePlan',
  boSetSuspended: 'users.suspend',
  boDeleteUser: 'users.delete',
  boOpenData: 'data.view',
  boListTransactions: 'data.view',
  boPreviewDelete: 'data.delete',
  boDeleteTransaction: 'data.delete',
  boListStaff: 'staff.manage',
  boInviteStaff: 'staff.manage',
  boSetStaffRole: 'staff.manage',
  boSetStaffSuspended: 'staff.manage',
  boRemoveStaff: 'staff.manage',
  boResetStaffMfa: 'staff.manage',
  boListInvites: 'staff.manage',
  boResendInvite: 'staff.manage',
  boGetInviteLink: 'staff.manage',
  boRevokeInvite: 'staff.manage',
  boListRoles: 'staff.manage',
  boSaveRole: 'staff.manage',
  boDeleteRole: 'staff.manage',
  boStats: 'stats.view',
  boListAudit: 'audit.view',
};

const ROLE_PERMS: Record<string, string[]> = {
  superAdmin: ['users.view', 'users.create', 'users.edit', 'users.changePlan', 'users.suspend', 'users.delete', 'stats.view', 'audit.view', 'staff.manage', 'data.view', 'data.delete'],
  admin: ['users.view', 'users.create', 'users.edit', 'users.suspend', 'stats.view', 'data.view'],
  support: ['users.view', 'users.suspend'],
  analyste: ['stats.view'],
  // Rôle sur mesure dont le document contient (de force) des permissions réservées : elles sont ignorées.
  r_custom: ['users.view', 'audit.view'],
};

const callers: Record<string, Caller> = {};

beforeAll(async () => {
  await db().doc('boRoles/r_custom').set({ name: 'Conformité', nameLower: 'conformité', permissions: ['users.view', 'audit.view', 'data.view', 'data.delete', 'staff.manage', 'users.changePlan'], builtIn: false });
  for (const r of Object.keys(ROLE_PERMS)) callers[r] = await staff(r);
});

describe('matrice rôles × fonctions', () => {
  for (const role of Object.keys(ROLE_PERMS)) {
    for (const [fn, perm] of Object.entries(NEEDS)) {
      const allowed = perm === null || ROLE_PERMS[role].includes(perm);
      it(`${role} → ${fn} : ${allowed ? 'autorisé' : 'refusé'}`, async () => {
        const before = (await auditLines()).length;
        const r = await outcome(fn as never, callers[role], {});
        if (allowed) {
          // Autorisé : la fonction s'exécute (ou refuse des paramètres vides), jamais un refus de droit.
          expect(r.message).not.toBe('bo/permission');
          expect(r.status).not.toBe('permission-denied');
        } else {
          expect(r).toEqual({ status: 'permission-denied', message: 'bo/permission' });
          const lines = (await auditLines()).slice(before);
          expect(lines.some((l) => l.result === 'denied' && l.code === 'bo/permission' && l.actorUid === callers[role].uid)).toBe(true);
        }
      });
    }
  }
});

describe('sans accès valide : refus pour toutes les fonctions', () => {
  it('non collaborateur, collaborateur suspendu, sans session de double vérification, session expirée, jeton d’une autre session', async () => {
    const outsider = { uid: 'pas-staff-uid', email: 'x@exemple.ci', sid: 'abc' };
    const suspended = await staff('superAdmin', { status: 'suspended' });
    const noSession = await staff('superAdmin', { session: 'none' });
    const expired = await staff('superAdmin', { session: 'expired' });
    const wrongSid = { ...(await staff('superAdmin')), sid: 'autre-session' };
    const cases: [Caller | null, string, string][] = [
      [null, 'unauthenticated', 'bo/auth'],
      [outsider, 'permission-denied', 'bo/not-staff'],
      [suspended, 'permission-denied', 'bo/staff-suspended'],
      [noSession, 'unauthenticated', 'bo/session'],
      [expired, 'unauthenticated', 'bo/session'],
      [wrongSid, 'unauthenticated', 'bo/session'],
    ];
    for (const fn of Object.keys(NEEDS)) {
      for (const [who, status, message] of cases) expect(await outcome(fn as never, who, {}), `${fn} / ${message}`).toEqual({ status, message });
    }
    // Chaque refus d'une personne identifiée est journalisé.
    const denied = await auditLines((l) => l.result === 'denied' && l.actorUid === suspended.uid);
    expect(denied.length).toBe(Object.keys(NEEDS).length);
  });
});
