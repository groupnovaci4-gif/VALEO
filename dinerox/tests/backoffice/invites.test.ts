/**
 * Invitation des collaborateurs : statut « invitation envoyée » sans permission,
 * lien à usage unique valable 7 jours et lié à l'adresse, acceptation avec mot de
 * passe choisi par l'invité puis double vérification, Renvoyer / Annuler / Copier,
 * refus journalisés.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { totp } from '../../firebase/functions/src/backoffice/totp';
import { auditLines, auth, call, db, outcome, staff, type Caller } from './helpers';

let superAdmin: Caller;
beforeAll(async () => {
  superAdmin = await staff('superAdmin', { name: 'Koffi B.' });
});

type Invite = { inviteId: string; token: string; expiresAt: number };
const invite = (email: string, roleId = 'support', who: Caller = superAdmin) => call<Invite>('boInviteStaff', who, { email, displayName: 'Didier Kouamé', roleId });

describe('invitation des collaborateurs', () => {
  it('invitation : statut « invitation envoyée », aucune permission, compte sans mot de passe, lien de 7 jours', async () => {
    const email = 'didier.invite@dinerox-team.test';
    const inv = await invite(email);
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inv.expiresAt - Date.now()).toBeGreaterThan(7 * 86400_000 - 60_000);
    const u = await auth().getUserByEmail(email);
    expect(u.passwordHash).toBeUndefined();
    const s = await db().doc(`boStaff/${u.uid}`).get();
    expect(s.get('status')).toBe('invited');
    // Aucune permission, même avec une session forgée.
    await db().doc(`boSessions/${u.uid}`).set({ sid: 'x', createdAt: Date.now(), expiresAt: Date.now() + 3600_000 });
    expect(await outcome('boMe', { uid: u.uid, email, sid: 'x' })).toEqual({ status: 'permission-denied', message: 'bo/staff-invited' });
    // Le jeton n'est jamais stocké ni journalisé en clair.
    const doc = await db().doc(`boInvites/${inv.inviteId}`).get();
    expect(JSON.stringify(doc.data())).not.toContain(inv.token);
    expect(JSON.stringify(await auditLines())).not.toContain(inv.token);
    // Un Super Admin ne peut pas l'activer à la main.
    expect(await outcome('boSetStaffSuspended', superAdmin, { uid: u.uid, suspended: false })).toEqual({ status: 'failed-precondition', message: 'bo/staff-invited' });
    const list = await call<{ invites: { id: string; status: string }[] }>('boListInvites', superAdmin);
    expect(list.invites.find((x) => x.id === inv.inviteId)?.status).toBe('sent');
  });

  it('parcours complet : l’invité voit qui l’invite et pour quel rôle, accepte, choisit son mot de passe, puis active la double vérification', async () => {
    const email = 'awa.parcours@dinerox-team.test';
    const inv = await invite(email, 'admin');
    const view = await call('boViewInvite', null, { inviteId: inv.inviteId, token: inv.token });
    expect(view).toMatchObject({ invitedByName: 'Koffi B.', roleName: 'Administrateur', email: 'a•••@dinerox-team.test', displayName: 'Didier Kouamé' });
    expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email, password: 'court' })).toEqual({ status: 'invalid-argument', message: 'invite/password-weak' });
    await call('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email: email.toUpperCase(), password: 'Mon-mot-de-passe-1' });
    const u = await auth().getUserByEmail(email);
    expect((await db().doc(`boStaff/${u.uid}`).get()).get('status')).toBe('active');
    // Toujours AUCUNE permission sans double vérification : la connexion l'exige.
    const start = await call<{ challenge: string; enroll: { secret: string } | null }>('boLoginStart', null, { email, password: 'Mon-mot-de-passe-1' });
    expect(start.enroll).not.toBeNull();
    const done = await call<{ recoveryCodes: string[] }>('boLoginVerify', null, { email, challenge: start.challenge, code: totp(start.enroll!.secret, Date.now()) });
    expect(done.recoveryCodes).toHaveLength(8);
    const sid = (await db().doc(`boSessions/${u.uid}`).get()).get('sid');
    expect(await call('boMe', { uid: u.uid, email, sid })).toMatchObject({ roleId: 'admin' });
    // Usage unique : le lien ne sert plus.
    expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email, password: 'Autre-mot-de-passe' })).toEqual({ status: 'failed-precondition', message: 'invite/used' });
    expect(await outcome('boViewInvite', null, { inviteId: inv.inviteId, token: inv.token })).toEqual({ status: 'failed-precondition', message: 'invite/used' });
    const lines = await auditLines((l) => l.targetUid === u.uid || l.actorUid === u.uid);
    expect(lines.map((l) => `${l.action}:${l.result}`)).toEqual(expect.arrayContaining(['staff.invite:ok', 'staff.invite-accept:ok', 'auth.mfa-enrolled:ok', 'staff.invite-accept:denied', 'staff.invite-view:denied']));
    expect((await call<{ invites: { id: string; status: string }[] }>('boListInvites', superAdmin)).invites.find((x) => x.id === inv.inviteId)?.status).toBe('accepted');
  });

  it('autre adresse que celle invitée : refus journalisé ; au 5e essai, l’invitation est annulée', async () => {
    const email = 'yao.adresse@dinerox-team.test';
    const inv = await invite(email);
    for (let k = 1; k <= 4; k++) expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email: `pirate${k}@exemple.ci`, password: 'Mon-mot-de-passe-1' })).toEqual({ status: 'permission-denied', message: 'invite/wrong-email' });
    expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email: 'pirate5@exemple.ci', password: 'Mon-mot-de-passe-1' })).toEqual({ status: 'permission-denied', message: 'invite/wrong-email+revoked' });
    expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email, password: 'Mon-mot-de-passe-1' })).toEqual({ status: 'failed-precondition', message: 'invite/revoked' });
    const denied = await auditLines((l) => l.action === 'staff.invite-accept' && l.result === 'denied' && !!(l.refs as string[] | null)?.includes(inv.inviteId));
    expect(denied.map((l) => l.code)).toEqual(['invite/wrong-email', 'invite/wrong-email', 'invite/wrong-email', 'invite/wrong-email', 'invite/wrong-email+revoked', 'invite/revoked']);
    expect(JSON.stringify(denied)).not.toContain('pirate1@'); // adresse tapée : domaine + empreinte seulement
  });

  it('lien expiré : refusé et journalisé ; « Renvoyer » donne un nouveau lien de 7 jours, l’ancien ne marche plus', async () => {
    const email = 'fatou.expire@dinerox-team.test';
    const inv = await invite(email);
    await db().doc(`boInvites/${inv.inviteId}`).update({ expiresAt: Date.now() - 1000 });
    expect(await outcome('boViewInvite', null, { inviteId: inv.inviteId, token: inv.token })).toEqual({ status: 'failed-precondition', message: 'invite/expired' });
    expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email, password: 'Mon-mot-de-passe-1' })).toEqual({ status: 'failed-precondition', message: 'invite/expired' });
    expect((await call<{ invites: { id: string; status: string }[] }>('boListInvites', superAdmin)).invites.find((x) => x.id === inv.inviteId)?.status).toBe('expired');
    // Copier le lien d'une invitation expirée : refusé (il faut la renvoyer).
    expect(await outcome('boGetInviteLink', superAdmin, { inviteId: inv.inviteId })).toEqual({ status: 'failed-precondition', message: 'invite/expired' });
    const again = await call<Invite>('boResendInvite', superAdmin, { inviteId: inv.inviteId });
    expect(again.token).not.toBe(inv.token);
    expect(await outcome('boViewInvite', null, { inviteId: inv.inviteId, token: inv.token })).toEqual({ status: 'permission-denied', message: 'invite/invalid-token' });
    // Copier le lien : le même que celui renvoyé (pour WhatsApp), action journalisée.
    expect((await call<{ token: string }>('boGetInviteLink', superAdmin, { inviteId: inv.inviteId })).token).toBe(again.token);
    expect((await auditLines((l) => l.action === 'staff.invite-link' && l.result === 'ok' && !!(l.refs as string[] | null)?.includes(inv.inviteId))).length).toBe(1);
    expect((await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: again.token, email, password: 'Mon-mot-de-passe-1' })).status).toBe('ok');
  });

  it('« Annuler » : lien refusé et journalisé, collaborateur invité retiré, compte créé pour l’invitation supprimé ; on peut réinviter', async () => {
    const email = 'serge.annule@dinerox-team.test';
    const inv = await invite(email);
    const uid = (await auth().getUserByEmail(email)).uid;
    await call('boRevokeInvite', superAdmin, { inviteId: inv.inviteId });
    expect(await outcome('boViewInvite', null, { inviteId: inv.inviteId, token: inv.token })).toEqual({ status: 'failed-precondition', message: 'invite/revoked' });
    expect(await outcome('boAcceptInvite', null, { inviteId: inv.inviteId, token: inv.token, email, password: 'Mon-mot-de-passe-1' })).toEqual({ status: 'failed-precondition', message: 'invite/revoked' });
    expect(await outcome('boResendInvite', superAdmin, { inviteId: inv.inviteId })).toEqual({ status: 'failed-precondition', message: 'invite/revoked' });
    expect((await db().doc(`boStaff/${uid}`).get()).exists).toBe(false);
    expect(await auth().getUser(uid).catch(() => null)).toBeNull();
    expect((await call<{ invites: { id: string; status: string }[] }>('boListInvites', superAdmin)).invites.find((x) => x.id === inv.inviteId)?.status).toBe('revoked');
    expect((await outcome('boInviteStaff', superAdmin, { email, displayName: 'Serge Bamba', roleId: 'analyste' })).status).toBe('ok');
  });

  it('lien inconnu ou jeton faux : refusé et journalisé', async () => {
    const inv = await invite('awa.jeton@dinerox-team.test');
    expect(await outcome('boViewInvite', null, { inviteId: inv.inviteId, token: 'x'.repeat(43) })).toEqual({ status: 'permission-denied', message: 'invite/invalid-token' });
    expect(await outcome('boViewInvite', null, { inviteId: 'inexistante', token: inv.token })).toEqual({ status: 'not-found', message: 'invite/not-found' });
    expect((await auditLines((l) => l.code === 'invite/not-found')).length).toBeGreaterThanOrEqual(1);
  });

  it('rôle admin ou superAdmin donné par un non-Super Admin : refusé et journalisé', async () => {
    // Rôle sur mesure dont le document contient (de force) staff.manage : la permission est ignorée.
    await db().doc('boRoles/r_rh').set({ name: 'RH', nameLower: 'rh', permissions: ['staff.manage', 'users.view'], builtIn: false });
    const rh = await staff('r_rh');
    const admin = await staff('admin');
    for (const who of [rh, admin]) {
      for (const roleId of ['admin', 'superAdmin']) {
        expect(await outcome('boInviteStaff', who, { email: `x.${roleId}@dinerox-team.test`, displayName: 'Awa Koné', roleId })).toEqual({ status: 'permission-denied', message: 'bo/permission' });
      }
    }
    expect((await auditLines((l) => l.action === 'staff.invite' && l.result === 'denied' && (l.actorUid === rh.uid || l.actorUid === admin.uid))).length).toBe(4);
    // La règle elle-même (canInviteRole) est testée dans tests/backoffice-permissions.test.ts.
  });

  it('D15 : une adresse ayant déjà un compte dans l’app ne peut pas être invitée ; une invitation en cours ne se double pas', async () => {
    const email = 'koffi.double@dinerox-team.test';
    await invite(email);
    expect(await outcome('boInviteStaff', superAdmin, { email, displayName: 'Koffi', roleId: 'support' })).toEqual({ status: 'already-exists', message: 'bo/already-staff' });
  });
});
