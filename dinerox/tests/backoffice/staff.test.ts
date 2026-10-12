/**
 * Équipe : dernier Super Admin, ses propres droits, rôles sur mesure, D15.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { appUser, auditLines, call, db, outcome, staff } from './helpers';

/** Désactive les Super Admins créés par d'autres tests : chaque test maîtrise leur nombre. */
beforeEach(async () => {
  const s = await db().collection('boStaff').where('roleId', '==', 'superAdmin').get();
  await Promise.all(s.docs.map((d) => d.ref.update({ status: 'suspended' })));
});

describe('règles de l’équipe', () => {
  it('dernier Super Admin : après une rétrogradation, l’ancien Super Admin ne peut plus rien sur le dernier', async () => {
    const a = await staff('superAdmin');
    const b = await staff('superAdmin');
    // Deux Super Admins actifs : A peut rétrograder B.
    expect((await outcome('boSetStaffRole', a, { uid: b.uid, roleId: 'admin' })).status).toBe('ok');
    // A est le dernier : B (désormais Administrateur) ne peut ni le rétrograder, ni le suspendre, ni le retirer.
    for (const [fn, data] of [
      ['boSetStaffRole', { uid: a.uid, roleId: 'admin' }],
      ['boSetStaffSuspended', { uid: a.uid, suspended: true }],
      ['boRemoveStaff', { uid: a.uid }],
    ] as const) {
      expect(await outcome(fn, b, data), fn).toEqual({ status: 'permission-denied', message: 'bo/permission' });
    }
    // Et A ne peut pas se retirer lui-même.
    expect(await outcome('boRemoveStaff', a, { uid: a.uid })).toEqual({ status: 'permission-denied', message: 'staff/self' });
    expect((await db().collection('boStaff').where('roleId', '==', 'superAdmin').where('status', '==', 'active').get()).size).toBe(1);
    expect((await auditLines((l) => l.result === 'denied' && l.actorUid === b.uid)).length).toBe(3);
  });

  it('deux rétrogradations SIMULTANÉES entre les deux derniers Super Admins : une seule passe', async () => {
    const a = await staff('superAdmin');
    const b = await staff('superAdmin');
    const [ra, rb] = await Promise.all([outcome('boSetStaffRole', a, { uid: b.uid, roleId: 'admin' }), outcome('boSetStaffRole', b, { uid: a.uid, roleId: 'admin' })]);
    const oks = [ra, rb].filter((r) => r.status === 'ok');
    expect(oks).toHaveLength(1);
    const supers = await db().collection('boStaff').where('roleId', '==', 'superAdmin').where('status', '==', 'active').get();
    expect(supers.size).toBe(1);
  });

  it('personne ne modifie ses propres droits', async () => {
    const a = await staff('superAdmin');
    await staff('superAdmin');
    for (const [fn, data] of [
      ['boSetStaffRole', { uid: a.uid, roleId: 'admin' }],
      ['boSetStaffSuspended', { uid: a.uid, suspended: true }],
      ['boRemoveStaff', { uid: a.uid }],
      ['boResetStaffMfa', { uid: a.uid }],
    ] as const) {
      expect(await outcome(fn, a, data), fn).toEqual({ status: 'permission-denied', message: 'staff/self' });
    }
    expect((await auditLines((l) => l.actorUid === a.uid && l.code === 'staff/self')).length).toBe(4);
  });

  it('rôle sur mesure : une permission réservée est refusée et journalisée ; un rôle valide est créé', async () => {
    const a = await staff('superAdmin');
    for (const p of ['data.view', 'data.delete', 'staff.manage', 'users.changePlan']) {
      expect(await outcome('boSaveRole', a, { name: 'Contrôle', permissions: ['users.view', p] }), p).toEqual({ status: 'permission-denied', message: 'role/permission-reserved' });
    }
    expect((await auditLines((l) => l.actorUid === a.uid && l.code === 'role/permission-reserved')).length).toBe(4);
    const r = await call<{ id: string }>('boSaveRole', a, { name: 'Contrôle', permissions: ['users.view', 'audit.view'] });
    const roles = await call<{ roles: { id: string; permissions: string[] }[] }>('boListRoles', a);
    expect(roles.roles.find((x) => x.id === r.id)?.permissions).toEqual(['users.view', 'audit.view']);
    // Deux rôles ne portent pas le même nom (majuscules et forme Unicode ignorées).
    await call('boSaveRole', a, { name: 'Équipe qualité', permissions: ['users.view'] });
    expect(await outcome('boSaveRole', a, { name: '\u0065\u0301quipe  QUALITÉ', permissions: ['users.view'] })).toEqual({ status: 'already-exists', message: 'role/name-taken' });
  });

  it('D15 : une adresse qui a déjà un compte personnel dans l’app ne devient pas collaborateur', async () => {
    const a = await staff('superAdmin');
    const u = await appUser();
    expect(await outcome('boInviteStaff', a, { email: u.email, displayName: 'Awa Koné', roleId: 'support' })).toEqual({ status: 'failed-precondition', message: 'bo/staff-has-app-account' });
    expect((await outcome('boInviteStaff', a, { email: 'awa.kone@dinerox-team.test', displayName: 'Awa Koné', roleId: 'support' })).status).toBe('ok');
  });
});
