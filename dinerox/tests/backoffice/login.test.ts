/**
 * Connexion au portail : mot de passe + code vérifiés par le serveur, essais
 * limités par compte, chaque refus au journal, codes de secours à usage unique.
 */
import { describe, expect, it } from 'vitest';
import { totp } from '../../firebase/functions/src/backoffice/totp';
import { auditLines, auth, call, db, outcome } from './helpers';

async function staffWithPassword(email: string, password: string, roleId = 'support') {
  const u = await auth().createUser({ email, password, displayName: 'Didier K.' });
  await db().doc(`boStaff/${u.uid}`).set({ email, displayName: 'Didier K.', roleId, status: 'active', mfa: { enrolled: false, secretEnc: null, pendingSecretEnc: null, recoveryHashes: [], lastStep: null }, createdAt: 1, createdBy: 'test', lastLoginAt: null });
  return u.uid;
}

/** Inscription complète : mot de passe, scan du secret, premier code. */
async function enroll(email: string, password: string) {
  const start = await call<{ challenge: string; enroll: { secret: string } | null }>('boLoginStart', null, { email, password });
  expect(start.enroll?.secret).toMatch(/^[A-Z2-7]{32}$/);
  const code = totp(start.enroll!.secret, Date.now());
  const res = await call<{ token: string; recoveryCodes: string[] }>('boLoginVerify', null, { email, challenge: start.challenge, code });
  return { secret: start.enroll!.secret, code, ...res };
}

describe('connexion au portail', () => {
  it('premier passage : enrôlement du code, 8 codes de secours, session de 12 h et jeton portant la session', async () => {
    const email = 'didier.enrol@dinerox-team.test';
    const uid = await staffWithPassword(email, 'Motdepasse-1');
    const r = await enroll(email, 'Motdepasse-1');
    expect(r.recoveryCodes).toHaveLength(8);
    expect(typeof r.token).toBe('string');
    const s = await db().doc(`boSessions/${uid}`).get();
    expect(s.get('expiresAt') - s.get('createdAt')).toBe(12 * 3600 * 1000);
    // Le jeton personnalisé porte l'identifiant de session (vérifié par requireStaff).
    const payload = JSON.parse(Buffer.from(r.token.split('.')[1], 'base64url').toString());
    expect(payload.claims.boSid).toBe(s.get('sid'));
    const staff = await db().doc(`boStaff/${uid}`).get();
    expect(staff.get('mfa.enrolled')).toBe(true);
    expect(JSON.stringify(staff.data())).not.toContain(r.secret); // secret chiffré
    expect(JSON.stringify(staff.data())).not.toContain(r.recoveryCodes[0]); // codes hachés
    expect((await auditLines((l) => l.actorUid === uid && l.action === 'auth.mfa-enrolled')).length).toBe(1);
    // Session utilisable : boMe répond avec le rôle.
    expect(await call('boMe', { uid, email, sid: s.get('sid') })).toMatchObject({ roleId: 'support', permissions: ['users.view', 'users.suspend'] });
  });

  it('5 mots de passe faux → compte verrouillé 15 min, même avec le bon mot de passe ; chaque refus journalisé', async () => {
    const email = 'didier.verrou@dinerox-team.test';
    const uid = await staffWithPassword(email, 'Motdepasse-1');
    for (let i = 0; i < 4; i++) expect(await outcome('boLoginStart', null, { email, password: 'faux' })).toEqual({ status: 'unauthenticated', message: 'bo/login-failed' });
    expect(await outcome('boLoginStart', null, { email, password: 'faux' })).toEqual({ status: 'resource-exhausted', message: 'bo/locked' });
    expect(await outcome('boLoginStart', null, { email, password: 'Motdepasse-1' })).toEqual({ status: 'resource-exhausted', message: 'bo/locked' });
    const lines = await auditLines((l) => l.actorUid === uid && l.action === 'auth.login' && l.result === 'denied');
    expect(lines.map((l) => l.code)).toEqual(['bo/bad-password', 'bo/bad-password', 'bo/bad-password', 'bo/bad-password', 'bo/bad-password+locked', 'bo/locked']);
    // Fin du verrou (simulée) : la connexion refonctionne.
    const guard = await db().collection('boLoginGuard').where('lockedUntil', '>', Date.now()).get();
    await Promise.all(guard.docs.map((d) => d.ref.update({ lockedUntil: Date.now() - 1 })));
    expect((await outcome('boLoginStart', null, { email, password: 'Motdepasse-1' })).status).toBe('ok');
  });

  it('codes faux : comptent dans la même limite ; le défi reste valable entre deux essais', async () => {
    const email = 'didier.code@dinerox-team.test';
    await staffWithPassword(email, 'Motdepasse-1');
    const { secret } = await enroll(email, 'Motdepasse-1');
    const start = await call<{ challenge: string; enroll: unknown }>('boLoginStart', null, { email, password: 'Motdepasse-1' });
    expect(start.enroll).toBeNull(); // déjà enrôlé : plus de secret renvoyé
    for (let i = 0; i < 4; i++) expect(await outcome('boLoginVerify', null, { email, challenge: start.challenge, code: '000000' })).toEqual({ status: 'unauthenticated', message: 'bo/bad-code' });
    expect(await outcome('boLoginVerify', null, { email, challenge: start.challenge, code: '000000' })).toEqual({ status: 'resource-exhausted', message: 'bo/locked' });
    expect(await outcome('boLoginVerify', null, { email, challenge: start.challenge, code: totp(secret, Date.now()) })).toEqual({ status: 'resource-exhausted', message: 'bo/locked' });
  });

  it('un code déjà utilisé est refusé ; un code de secours ne sert qu’une fois', async () => {
    const email = 'didier.rejeu@dinerox-team.test';
    const uid = await staffWithPassword(email, 'Motdepasse-1');
    const { code: used, recoveryCodes } = await enroll(email, 'Motdepasse-1');
    const s1 = await call<{ challenge: string }>('boLoginStart', null, { email, password: 'Motdepasse-1' });
    expect(await outcome('boLoginVerify', null, { email, challenge: s1.challenge, code: used })).toEqual({ status: 'unauthenticated', message: 'bo/bad-code' });
    expect((await outcome('boLoginVerify', null, { email, challenge: s1.challenge, code: recoveryCodes[0].toLowerCase() })).status).toBe('ok');
    const s2 = await call<{ challenge: string }>('boLoginStart', null, { email, password: 'Motdepasse-1' });
    expect(await outcome('boLoginVerify', null, { email, challenge: s2.challenge, code: recoveryCodes[0] })).toEqual({ status: 'unauthenticated', message: 'bo/bad-code' });
    expect((await auditLines((l) => l.actorUid === uid && l.action === 'auth.login-recovery')).length).toBe(1);
  });

  it('bon mot de passe mais pas collaborateur, adresse inconnue, défi inventé : même réponse, refus journalisés sans adresse en clair', async () => {
    const appUserEmail = 'aicha.app@exemple.ci';
    await auth().createUser({ email: appUserEmail, password: 'Motdepasse-1' });
    expect(await outcome('boLoginStart', null, { email: appUserEmail, password: 'Motdepasse-1' })).toEqual({ status: 'unauthenticated', message: 'bo/login-failed' });
    expect(await outcome('boLoginStart', null, { email: 'inconnu@exemple.ci', password: 'x' })).toEqual({ status: 'unauthenticated', message: 'bo/login-failed' });
    expect(await outcome('boLoginVerify', null, { email: 'inconnu@exemple.ci', challenge: 'invente', code: '123456' })).toEqual({ status: 'unauthenticated', message: 'bo/login-failed' });
    const lines = await auditLines((l) => l.targetDomain === 'exemple.ci' && l.action === 'auth.login');
    expect(lines.map((l) => l.code)).toEqual(expect.arrayContaining(['bo/not-staff', 'bo/bad-password', 'bo/challenge']));
    expect(JSON.stringify(lines)).not.toContain('aicha.app@');
    expect(JSON.stringify(lines)).not.toContain('inconnu@');
  });

  it('déconnexion : la session est fermée côté serveur', async () => {
    const email = 'didier.sortie@dinerox-team.test';
    const uid = await staffWithPassword(email, 'Motdepasse-1');
    await enroll(email, 'Motdepasse-1');
    const sid = (await db().doc(`boSessions/${uid}`).get()).get('sid');
    await call('boLogout', { uid, email, sid });
    expect(await outcome('boMe', { uid, email, sid })).toEqual({ status: 'unauthenticated', message: 'bo/session' });
  });
});
