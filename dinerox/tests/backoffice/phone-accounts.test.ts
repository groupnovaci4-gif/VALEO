/**
 * Audit du 23/10 — back-office et comptes créés par numéro (sans e-mail) :
 *  - C1 : recherche par numéro (toutes les écritures courantes) ; suppression confirmée par
 *    l'IDENTIFIANT retapé quand le compte n'a pas d'e-mail ;
 *  - S2 : la suppression efface aussi les données de connexion par téléphone.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { auth, call, db, outcome, staff, type Caller } from './helpers';

let superAdmin: Caller;
let support: Caller;
beforeAll(async () => {
  superAdmin = await staff('superAdmin');
  support = await staff('support');
});

let n = 0;
/** Compte créé par numéro (aucun e-mail) avec ses données de connexion par téléphone. */
async function phoneUser() {
  n += 1;
  const local = `07${String(Date.now() % 1e6).padStart(6, '0')}${String(n).padStart(2, '0')}`;
  const u = await auth().createUser({ phoneNumber: `+225${local}` });
  const pk = `cle-${u.uid}`;
  const now = Date.now();
  await db().doc(`users/${u.uid}`).set({ uid: u.uid, firstName: 'Awa', lastName: '', email: '', phone: `+225${local}`, country: 'CI', currency: 'XOF', language: 'fr', timezone: 'Africa/Abidjan', preferences: {}, subscription: { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: now }, onboarding: { completed: true }, createdAt: now, updatedAt: now });
  await db().doc(`phoneIndex/${pk}`).set({ uid: u.uid, updatedAt: now });
  await db().doc(`phoneSecrets/${u.uid}`).set({ salt: 'a', hash: 'b', phoneKey: pk, updatedAt: now });
  await db().doc(`phoneDevices/${u.uid}`).set({ keys: ['appareil'], updatedAt: now });
  await db().doc(`phoneAuth/demande-${u.uid}`).set({ phoneKey: pk, uid: null, purpose: 'signup', used: true });
  return { uid: u.uid, local, pk };
}
const phoneDataLeft = async (uid: string, pk: string) =>
  (await Promise.all([`phoneIndex/${pk}`, `phoneSecrets/${uid}`, `phoneDevices/${uid}`, `phoneAuth/demande-${uid}`].map((p) => db().doc(p).get()))).filter((d) => d.exists).map((d) => d.ref.path);

describe('C1 — comptes sans e-mail dans le back-office', () => {
  it('recherche par numéro, avec ou sans indicatif ni espaces ; numéro masqué dans le résultat', async () => {
    const u = await phoneUser();
    for (const q of [u.local, `+225 ${u.local.replace(/(\d\d)(?=\d)/g, '$1 ')}`, `00225${u.local}`]) {
      const r = await call<{ users: { uid: string; phone: string | null }[] }>('boSearchUsers', support, { q });
      expect(r.users.map((x) => x.uid), q).toEqual([u.uid]);
      expect(r.users[0].phone).toMatch(/••/);
      expect(r.users[0].phone).not.toContain(u.local);
    }
    expect((await call<{ users: unknown[] }>('boSearchUsers', support, { q: u.local.slice(0, 6) })).users).toHaveLength(0);
  });

  it('suppression d’un compte sans e-mail : confirmée par l’identifiant retapé ; données « téléphone » effacées (S2)', async () => {
    const u = await phoneUser();
    expect(await outcome('boDeleteUser', superAdmin, { uid: u.uid, reasonCode: 'client_request' })).toEqual({ status: 'invalid-argument', message: 'bo/confirm' });
    expect(await outcome('boDeleteUser', superAdmin, { uid: u.uid, reasonCode: 'client_request', confirmUid: 'autre-identifiant' })).toEqual({ status: 'invalid-argument', message: 'bo/confirm' });
    await call('boDeleteUser', superAdmin, { uid: u.uid, reasonCode: 'client_request', confirmUid: u.uid });
    expect(await auth().getUser(u.uid).catch(() => null)).toBeNull();
    expect((await db().doc(`users/${u.uid}`).get()).exists).toBe(false);
    expect(await phoneDataLeft(u.uid, u.pk)).toEqual([]);
  });

  it('compte AVEC e-mail : l’identifiant ne suffit pas, l’adresse reste exigée (inchangé)', async () => {
    const u = await auth().createUser({ email: `mail${Date.now()}@exemple.ci` });
    expect(await outcome('boDeleteUser', superAdmin, { uid: u.uid, reasonCode: 'client_request', confirmUid: u.uid })).toEqual({ status: 'invalid-argument', message: 'bo/confirm' });
  });
});
