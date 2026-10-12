/**
 * Comptes utilisateurs : création (profil comme l'app, sans mot de passe),
 * modification, formule manuelle (D8), suspension (D6) et réactivation sans
 * perte, suppression définitive (double confirmation, D11), statistiques (D10).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { serverDefaultProfile } from '../../firebase/functions/src/backoffice/profile';
import { appUser, auditLines, auth, call, db, fns, outcome, staff, type Caller } from './helpers';

let superAdmin: Caller;
let admin: Caller;
let support: Caller;
beforeAll(async () => {
  superAdmin = await staff('superAdmin');
  admin = await staff('admin');
  support = await staff('support');
});

describe('comptes utilisateurs', () => {
  it('création : compte SANS mot de passe, profil identique à une inscription (gratuit), journal sans mot de passe', async () => {
    const r = await call<{ uid: string }>('boCreateUser', admin, { email: 'Nouveau.Client@Exemple.ci', firstName: 'Awa', lastName: 'Traoré', country: 'SN', currency: 'XOF', language: 'fr' });
    const u = await auth().getUser(r.uid);
    expect(u.email).toBe('nouveau.client@exemple.ci');
    expect(u.passwordHash).toBeUndefined();
    expect(u.providerData).toHaveLength(0);
    const p = (await db().doc(`users/${r.uid}`).get()).data()!;
    expect(p).toEqual(serverDefaultProfile({ uid: r.uid, email: 'nouveau.client@exemple.ci', firstName: 'Awa', lastName: 'Traoré', country: 'SN', currency: 'XOF', language: 'fr', timezone: 'Africa/Abidjan' }, p.createdAt));
    expect(p.subscription).toMatchObject({ plan: 'free', provider: 'none' });
    expect(await outcome('boCreateUser', admin, { email: 'nouveau.client@exemple.ci', firstName: 'Awa', country: 'SN', currency: 'XOF', language: 'fr' })).toEqual({ status: 'already-exists', message: 'bo/email-exists' });
    expect(await outcome('boCreateUser', admin, { email: 'x@exemple.ci', firstName: 'Awa', country: 'XX', currency: 'XOF', language: 'fr' })).toEqual({ status: 'invalid-argument', message: 'bo/country' });
    const line = (await auditLines((l) => l.action === 'user.create' && l.targetUid === r.uid))[0];
    expect(line.targetDomain).toBe('exemple.ci');
    expect(JSON.stringify(line)).not.toContain('nouveau.client@');
  });

  it('recherche EXACTE seulement (e-mail complet ou identifiant), jamais par morceau', async () => {
    const u = await appUser();
    expect((await call<{ users: unknown[] }>('boSearchUsers', support, { q: u.email.toUpperCase() })).users).toHaveLength(1);
    expect((await call<{ users: unknown[] }>('boSearchUsers', support, { q: u.uid })).users).toHaveLength(1);
    expect((await call<{ users: unknown[] }>('boSearchUsers', support, { q: u.email.slice(0, 6) })).users).toHaveLength(0);
    const list = await call<{ users: unknown[]; next: string | null }>('boListUsers', support, {});
    expect(list.users.length).toBeLessThanOrEqual(25);
  });

  it('modification : champs autorisés seulement, valeurs avant/après au journal', async () => {
    const u = await appUser();
    await call('boUpdateUser', admin, { uid: u.uid, changes: { firstName: 'Fatou', country: 'ML', subscription: { plan: 'family' } } });
    const p = (await db().doc(`users/${u.uid}`).get()).data()!;
    expect(p.firstName).toBe('Fatou');
    expect(p.country).toBe('ML');
    expect(p.subscription.plan).toBe('free');
    const line = (await auditLines((l) => l.action === 'user.edit' && l.targetUid === u.uid))[0];
    expect(line.before).toEqual({ firstName: 'Aïcha', country: 'CI' });
    expect(line.after).toEqual({ firstName: 'Fatou', country: 'ML' });
  });

  it('formule manuelle (D8) : Super Admin seulement, date de fin et motif obligatoires, journalisée', async () => {
    const u = await appUser();
    expect(await outcome('boSetPlan', admin, { uid: u.uid, plan: 'plus', endsAt: Date.now() + 86400_000, reasonCode: 'client_request' })).toEqual({ status: 'permission-denied', message: 'bo/permission' });
    expect(await outcome('boSetPlan', superAdmin, { uid: u.uid, plan: 'plus', reasonCode: 'client_request' })).toEqual({ status: 'invalid-argument', message: 'bo/endsAt' });
    expect(await outcome('boSetPlan', superAdmin, { uid: u.uid, plan: 'plus', endsAt: Date.now() + 86400_000 })).toEqual({ status: 'invalid-argument', message: 'bo/reason' });
    const endsAt = Date.now() + 30 * 86400_000;
    await call('boSetPlan', superAdmin, { uid: u.uid, plan: 'plus', endsAt, reasonCode: 'client_request' });
    expect((await db().doc(`users/${u.uid}`).get()).get('subscription')).toMatchObject({ plan: 'plus', status: 'active', provider: 'manual', expiresAt: endsAt });
    const line = (await auditLines((l) => l.action === 'user.plan' && l.targetUid === u.uid))[0];
    expect(line).toMatchObject({ before: { plan: 'free', provider: 'none' }, after: { plan: 'plus', provider: 'manual', planEndsAt: endsAt } });
  });

  it('suspension : compte désactivé, jetons révoqués, appareils retirés, données intactes ; réactivation sans perte', async () => {
    const u = await appUser();
    await db().doc(`users/${u.uid}/devices/d1`).set({ token: 'ExponentPushToken[x]', platform: 'android', updatedAt: 1 });
    await db().doc(`spaces/${u.uid}/transactions/t1`).set({ id: 't1', amount: 5000, updatedAt: 1, createdAt: 1, createdBy: u.uid });
    expect(await outcome('boSetSuspended', support, { uid: u.uid, suspended: true })).toEqual({ status: 'invalid-argument', message: 'bo/reason' });
    await call('boSetSuspended', support, { uid: u.uid, suspended: true, reasonCode: 'fraud_suspicion' });
    const rec = await auth().getUser(u.uid);
    expect(rec.disabled).toBe(true);
    expect(rec.tokensValidAfterTime).toBeTruthy();
    expect((await db().collection(`users/${u.uid}/devices`).get()).size).toBe(0);
    expect((await db().doc(`accountStatus/${u.uid}`).get()).get('status')).toBe('suspended');
    expect((await db().doc(`spaces/${u.uid}/transactions/t1`).get()).get('amount')).toBe(5000);
    expect(await outcome('boSetSuspended', support, { uid: u.uid, suspended: true, reasonCode: 'fraud_suspicion' })).toEqual({ status: 'failed-precondition', message: 'bo/no-change' });
    await call('boSetSuspended', support, { uid: u.uid, suspended: false, reasonCode: 'verification' });
    expect((await auth().getUser(u.uid)).disabled).toBe(false);
    expect((await db().doc(`users/${u.uid}`).get()).get('firstName')).toBe('Aïcha');
    expect((await db().doc(`spaces/${u.uid}/transactions/t1`).get()).get('amount')).toBe(5000);
    expect((await auditLines((l) => l.targetUid === u.uid)).map((l) => l.action)).toEqual(['user.suspend', 'user.reactivate']);
  });

  it('un compte du PERSONNEL ne se gère jamais comme un utilisateur (le support ne suspend pas un Super Admin)', async () => {
    for (const [fn, data] of [
      ['boSetSuspended', { uid: superAdmin.uid, suspended: true, reasonCode: 'other', reasonNote: 'essai' }],
      ['boUpdateUser', { uid: superAdmin.uid, changes: { email: 'pirate@exemple.ci' } }],
    ] as const) {
      expect(await outcome(fn, fn === 'boSetSuspended' ? support : admin, data), fn).toEqual({ status: 'permission-denied', message: 'bo/target-is-staff' });
    }
    expect(await outcome('boDeleteUser', superAdmin, { uid: support.uid, reasonCode: 'other', reasonNote: 'essai', confirmEmail: support.email })).toEqual({ status: 'permission-denied', message: 'bo/target-is-staff' });
    expect((await auth().getUser(superAdmin.uid)).disabled).toBe(false);
  });

  it('suppression définitive : adresse retapée exacte, même logique que « Supprimer mon compte », journal sans adresse (D11)', async () => {
    const u = await appUser();
    expect(await outcome('boDeleteUser', superAdmin, { uid: u.uid, reasonCode: 'client_request', confirmEmail: 'autre@exemple.ci' })).toEqual({ status: 'invalid-argument', message: 'bo/confirm' });
    await call('boDeleteUser', superAdmin, { uid: u.uid, reasonCode: 'client_request', confirmEmail: u.email.toUpperCase() });
    expect(await auth().getUser(u.uid).catch(() => null)).toBeNull();
    expect((await db().doc(`users/${u.uid}`).get()).exists).toBe(false);
    expect((await db().doc(`spaces/${u.uid}`).get()).exists).toBe(false);
    const line = (await auditLines((l) => l.action === 'user.delete' && l.targetUid === u.uid))[0];
    expect(line).toMatchObject({ result: 'ok', targetDomain: 'exemple.ci' });
    expect(JSON.stringify(line)).not.toContain(u.email);
    // Le journal affiche « Compte supprimé (@domaine) ».
    const page = await call<{ entries: { targetUid: string; targetDisplay: string }[]; chainOk: boolean | null }>('boListAudit', superAdmin, { targetUid: u.uid });
    expect(page.entries[0].targetDisplay).toBe('Compte supprimé (@exemple.ci)');
  });

  it('journal : page complète chaînée et vérifiée ; aucune fonction ne le modifie', async () => {
    const page = await call<{ entries: unknown[]; chainOk: boolean | null }>('boListAudit', superAdmin, {});
    expect(page.entries.length).toBe(25);
    expect(page.chainOk).toBe(true);
    const names = Object.keys(await fns()).filter((n) => n.startsWith('bo'));
    expect(names.filter((n) => /audit/i.test(n))).toEqual(['boListAudit']);
  });

  it('D10 : adminStats accepte un collaborateur stats.view (et toujours le droit admin), refuse les autres', async () => {
    const run = async (who: { uid: string; token: Record<string, unknown> }) => {
      try {
        await ((await fns()).adminStats as unknown as { run: (r: unknown) => Promise<unknown> }).run({ data: {}, auth: who, rawRequest: {} });
        return 'ok';
      } catch (e) {
        return (e as { message: string }).message;
      }
    };
    const analyste = await staff('analyste');
    expect(await run({ uid: analyste.uid, token: {} })).toBe('ok');
    expect(await run({ uid: support.uid, token: {} })).toBe('admin/required');
    expect(await run({ uid: 'quelconque', token: { admin: true } })).toBe('ok');
    expect(await run({ uid: 'quelconque', token: {} })).toBe('admin/required');
  });

  it('statistiques : comptages agrégés, séries sur 7 jours', async () => {
    // L'instantané du jour est recalculé au plus une fois par heure : on force un nouveau calcul.
    await db().doc(`boStats/${new Date().toISOString().slice(0, 10)}`).delete();
    const profiles = (await db().collection('users').count().get()).data().count;
    const r = await call<{ current: { users: number; suspended: number }; series: { day: string }[] }>('boStats', admin, { days: 7 });
    expect(r.current.users).toBe(profiles);
    expect(r.series).toHaveLength(7);
  });
});
