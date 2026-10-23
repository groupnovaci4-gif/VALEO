/// <reference types="node" />
/**
 * Audit du 23/10 (docs/audits/audit-securite-regression-2026-10-23.md), partie B — connexion par
 * téléphone sur les ÉMULATEURS : les vraies Cloud Functions, fournisseur SIMULÉ (`phoneOutbox`).
 * S1 « Ajouter mon numéro » · S2 suppression du compte · S3 compteur de l'appareil connu ·
 * S4 coûts · S5 numéro en clair · S6 numéro déjà dans Firebase Auth · S8 compte suspendu ·
 * S9 numéro déjà inscrit · S10 administrateurs · S11 ordre de « Ajouter mon numéro ».
 * Lancé par `npm run test:functions`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'firebase/auth';
import { HOST, PROJECT, account, admin, read, setup, teardown } from './helpers';

beforeAll(setup);
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await teardown();
});

const FN = `http://${HOST}:5001/${PROJECT}/europe-west1`;
const AUTH = `http://${HOST}:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const OWNER = { 'content-type': 'application/json', authorization: 'Bearer owner' };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const APP_CHECK = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ app_id: '1:1:web:1', sub: '1:1:web:1', aud: [`projects/${PROJECT}`], iss: 'https://firebaseappcheck.googleapis.com/1', exp: Math.floor(Date.now() / 1000) + 7200, iat: Math.floor(Date.now() / 1000) })}.x`;

type Res<T> = { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

async function call<T = Record<string, unknown>>(name: string, data: unknown, opts: { idToken?: string } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'X-Firebase-AppCheck': APP_CHECK };
  if (opts.idToken) headers.authorization = `Bearer ${opts.idToken}`;
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  const json = (await r.json()) as { result?: T; error?: { message: string; details?: Record<string, unknown> } };
  if (json.error) return { ok: false, code: json.error.message === 'Unauthenticated' ? 'unauthenticated' : json.error.message, details: json.error.details };
  return { ok: true, data: json.result as T };
}
const must = <T>(r: Res<T>): T => {
  if (!r.ok) throw new Error(`refus inattendu : ${r.code}`);
  return r.data;
};

let n = 0;
const newPhone = (prefix = '07') => `${prefix}${String(Date.now() % 1e6).padStart(6, '0')}${String(n++ % 100).padStart(2, '0')}`;
const e164 = (local: string) => `+225${local}`;
const DEVICE = 'appareil-audit-0001';
const day = () => new Date().toISOString().slice(0, 10);

const docsOf = (c: string) => admin(async (fs) => (await getDocs(collection(fs, c))).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>));
async function outbox(to: string) {
  return (await docsOf('phoneOutbox')).filter((m) => m.to === to);
}
async function lastCode(to: string): Promise<string> {
  const codes = (await outbox(to)).filter((m) => m.kind === 'code').sort((a, b) => Number(a.at) - Number(b.at));
  return String(codes[codes.length - 1]?.code ?? '');
}
const clearGuards = () => admin(async (fs) => Promise.all((await getDocs(collection(fs, 'phoneGuard'))).docs.map((d) => deleteDoc(d.ref))));

const apps: FirebaseApp[] = [];
async function sessionFrom(token: string) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT, appId: '1:1:web:1' }, `audit${Date.now()}${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const cred = await signInWithCustomToken(auth, token);
  return { uid: cred.user.uid, idToken: await cred.user.getIdToken() };
}

/** Code reçu vérifié → ticket. */
async function ticketFor(local: string, purpose: string, opts: { device?: string; idToken?: string; currentSecret?: string } = {}) {
  const start = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose, channel: 'whatsapp', deviceId: opts.device ?? DEVICE, lang: 'fr', currentSecret: opts.currentSecret }, { idToken: opts.idToken }));
  const v = must(await call<{ ticket: string; existing: boolean }>('phoneVerify', { requestId: start.requestId, code: await lastCode(e164(local)) }));
  return { ...v, requestId: start.requestId };
}
async function signUp(local: string, secret = '483915', device = DEVICE) {
  const v = await ticketFor(local, 'signup', { device });
  const s = must(await call<{ token: string }>('phoneSetSecret', { ticket: v.ticket, secret, deviceId: device }));
  return { ...(await sessionFrom(s.token)), requestId: v.requestId };
}
const signIn = (local: string, secret: string, device = DEVICE) => call<{ token?: string; needsDevice?: boolean }>('phoneSignIn', { phone: local, dial: '225', secret, deviceId: device });

/** Jeton d'identité dont la connexion date de `minutes` minutes (l'émulateur ne vérifie pas la signature). */
function agedToken(idToken: string, minutes: number): string {
  const [h, p, s] = idToken.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, number>;
  payload.auth_time = Math.floor(Date.now() / 1000) - minutes * 60;
  return [h, b64(payload), s].join('.');
}
/** Compte Firebase Auth posé directement (console, ajout interrompu…), sans aucune donnée « téléphone ». */
async function authUserWithPhone(phone: string): Promise<string> {
  const localId = `fantome${Date.now().toString(36)}${n++}`;
  const r = await fetch(`${AUTH}/accounts:batchCreate`, { method: 'POST', headers: OWNER, body: JSON.stringify({ users: [{ localId, phoneNumber: phone }] }) });
  expect(r.status).toBe(200);
  return localId;
}
const setDisabled = (localId: string, disabled: boolean) => fetch(`${AUTH}/accounts:update`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId, disableUser: disabled }) });
const deleteAuthUser = (localId: string) => fetch(`${AUTH}/accounts:delete`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId }) });
const addPushDevice = (uid: string) => admin((fs) => setDoc(doc(fs, `users/${uid}/devices/d1`), { token: `ExponentPushToken[${uid}]`, platform: 'android', updatedAt: 1 }));
const alertsOf = async (uid: string) => (await docsOf('phoneOutbox')).filter((m) => m.uid === uid && String(m.kind).startsWith('alert'));

describe('S1 — « Ajouter mon numéro »', () => {
  it('connexion de plus de 5 minutes : refus côté serveur (envoi ET code secret), aucun code envoyé', async () => {
    await clearGuards();
    const a = await account('Yao');
    const fresh = await getAuth(a.app).currentUser!.getIdToken();
    const old = agedToken(fresh, 6);
    const local = newPhone();
    expect(await call('phoneStart', { phone: local, dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken: old })).toMatchObject({ ok: false, code: 'phone/recent-login' });
    expect(await outbox(e164(local))).toHaveLength(0);
    // Ticket obtenu pendant la connexion récente, utilisé avec une connexion ancienne : refusé aussi.
    const v = await ticketFor(local, 'link', { idToken: fresh });
    expect(await call('phoneSetSecret', { ticket: v.ticket, secret: '720461', deviceId: DEVICE }, { idToken: old })).toMatchObject({ ok: false, code: 'phone/recent-login' });
    expect(await signIn(local, '720461')).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
  });

  it('alerte (notification + e-mail) à CHAQUE ajout, sans aucun code', async () => {
    await clearGuards();
    const a = await account('Adjoua');
    await addPushDevice(a.uid);
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    const local = newPhone();
    const v = await ticketFor(local, 'link', { idToken });
    expect(must(await call('phoneSetSecret', { ticket: v.ticket, secret: '720461', deviceId: DEVICE }, { idToken }))).toEqual({ linked: true });
    const alerts = await alertsOf(a.uid);
    expect(alerts.map((x) => x.kind).sort()).toEqual(['alert-email', 'alert-push']);
    for (const x of alerts) expect(String(x.body)).toMatch(/numéro/);
    expect(JSON.stringify(alerts)).not.toContain('720461');
  });

  it('le compte a déjà un numéro : refus sans le code secret actuel (avant tout envoi), accepté avec lui', async () => {
    await clearGuards();
    const a = await account('Koffi');
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    const first = newPhone();
    const v1 = await ticketFor(first, 'link', { idToken });
    must(await call('phoneSetSecret', { ticket: v1.ticket, secret: '720461', deviceId: DEVICE }, { idToken }));
    await clearGuards();
    const second = newPhone();
    // Sans code secret actuel, ou avec un faux : refus, rien n'est envoyé au nouveau numéro.
    expect(await call('phoneStart', { phone: second, dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken })).toMatchObject({ ok: false, code: 'phone/current-secret' });
    expect(await call('phoneStart', { phone: second, dial: '225', purpose: 'link', deviceId: DEVICE, currentSecret: '905238' }, { idToken })).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
    expect(await outbox(e164(second))).toHaveLength(0);
    // Avec le code secret actuel : le nouveau numéro remplace l'ancien.
    const v2 = await ticketFor(second, 'link', { idToken, currentSecret: '720461' });
    expect(await call('phoneSetSecret', { ticket: v2.ticket, secret: '615204', deviceId: DEVICE }, { idToken })).toMatchObject({ ok: false, code: 'phone/current-secret' });
    await clearGuards();
    const v3 = await ticketFor(second, 'link', { idToken, currentSecret: '720461' });
    expect(must(await call('phoneSetSecret', { ticket: v3.ticket, secret: '615204', deviceId: DEVICE, currentSecret: '720461' }, { idToken }))).toEqual({ linked: true });
    expect((await sessionFrom(must(await signIn(second, '615204')).token!)).uid).toBe(a.uid);
    expect(await signIn(first, '720461')).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
  });

  it('faux codes secrets actuels : comptés, puis blocage (pas de devinette illimitée)', async () => {
    await clearGuards();
    const a = await account('Bintou');
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    const v1 = await ticketFor(newPhone(), 'link', { idToken });
    must(await call('phoneSetSecret', { ticket: v1.ticket, secret: '720461', deviceId: DEVICE }, { idToken }));
    const other = newPhone();
    const tries = [];
    for (let i = 0; i < 5; i++) tries.push(await call('phoneStart', { phone: other, dial: '225', purpose: 'link', deviceId: DEVICE, currentSecret: '905238' }, { idToken }));
    expect(tries[4]).toMatchObject({ ok: false, code: 'phone/locked' });
    expect(await call('phoneStart', { phone: other, dial: '225', purpose: 'link', deviceId: DEVICE, currentSecret: '720461' }, { idToken })).toMatchObject({ ok: false, code: 'phone/locked' });
  });
});

describe('S2 — suppression du compte : plus aucune donnée de connexion par téléphone', () => {
  it('« Supprimer mon compte » efface index, code secret, appareils et demandes ; l’ancien code secret ne recrée rien', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    const pk = String(((await read(`phoneSecrets/${s.uid}`)) as Record<string, unknown>).phoneKey);
    must(await call('deleteAccount', {}, { idToken: s.idToken }));
    expect(await read(`phoneIndex/${pk}`)).toBeUndefined();
    expect(await read(`phoneSecrets/${s.uid}`)).toBeUndefined();
    expect(await read(`phoneDevices/${s.uid}`)).toBeUndefined();
    expect((await docsOf('phoneAuth')).filter((d) => d.phoneKey === pk || d.uid === s.uid)).toHaveLength(0);
    expect(await signIn(local, '720461')).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
    // Numéro recyclé : une NOUVELLE inscription donne un compte neuf.
    await clearGuards();
    const v = await ticketFor(local, 'signup');
    expect(v.existing).toBe(false);
    const again = await sessionFrom(must(await call<{ token: string }>('phoneSetSecret', { ticket: v.ticket, secret: '483915', deviceId: DEVICE })).token);
    expect(again.uid).not.toBe(s.uid);
  });

  it('compte disparu (données restées) : traité comme un numéro inconnu, jamais de compte « fantôme »', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    await deleteAuthUser(s.uid);
    expect(await signIn(local, '720461')).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
    // Le numéro repart comme un numéro inconnu (restes effacés) : un compte NEUF.
    await clearGuards();
    const v = await ticketFor(local, 'reset');
    expect(v.existing).toBe(false);
    expect(await read(`phoneSecrets/${s.uid}`)).toBeUndefined();
    const fresh = await sessionFrom(must(await call<{ token: string }>('phoneSetSecret', { ticket: v.ticket, secret: '483915', deviceId: DEVICE })).token);
    expect(fresh.uid).not.toBe(s.uid);
    const users = await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: [s.uid] }) }).then((r) => r.json() as Promise<{ users?: unknown[] }>);
    expect(users.users ?? []).toHaveLength(0);
  });
});

describe('S3 — un inconnu ne bloque pas le propriétaire sur SON téléphone', () => {
  it('5 faux codes secrets depuis un autre appareil : bloqué là-bas, pas sur l’appareil connu', async () => {
    await clearGuards();
    const local = newPhone();
    await signUp(local, '720461');
    for (let i = 0; i < 5; i++) await signIn(local, '905238', 'appareil-inconnu-0009');
    expect(await signIn(local, '720461', 'appareil-inconnu-0009')).toMatchObject({ ok: false, code: 'phone/locked' });
    expect(typeof must(await signIn(local, '720461')).token).toBe('string');
  });
  it('envois épuisés par un autre appareil : l’appareil connu peut encore demander « code oublié »', async () => {
    await clearGuards();
    const local = newPhone();
    await signUp(local, '720461');
    const guards = await docsOf('phoneGuard');
    for (const g of guards) if (g.lastSendAt) await admin((fs) => setDoc(doc(fs, `phoneGuard/${g.id}`), { sends: 5, lastSendAt: 0, day: day() }, { merge: true }));
    expect(await call('phoneStart', { phone: local, dial: '225', purpose: 'reset', channel: 'whatsapp', deviceId: 'appareil-inconnu-0010' })).toMatchObject({ ok: false, code: 'phone/daily-limit' });
    expect((await call('phoneStart', { phone: local, dial: '225', purpose: 'reset', channel: 'whatsapp', deviceId: DEVICE })).ok).toBe(true);
  });
});

describe('S4 — coûts bornés', () => {
  it('WhatsApp aussi : indicatif hors liste refusé, AUCUN envoi', async () => {
    await clearGuards();
    expect(await call('phoneStart', { phone: '+1 202 555 0199', purpose: 'signup', channel: 'whatsapp', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/country' });
    expect(await outbox('+12025550199')).toHaveLength(0);
  });
  it('plafond PAR CANAL : SMS épuisé, WhatsApp continue', async () => {
    await clearGuards();
    await admin((fs) => setDoc(doc(fs, `phoneGuard/global-${day()}-sms`), { sends: 1_000_000 }));
    const local = newPhone();
    expect(await call('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'sms', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/unavailable' });
    expect((await call('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'whatsapp', deviceId: DEVICE })).ok).toBe(true);
  });
  it('plafond PAR PRÉFIXE : un préfixe épuisé ne bloque pas les autres', async () => {
    await clearGuards();
    await admin((fs) => setDoc(doc(fs, `phoneGuard/prefix-${day()}-22505`), { sends: 1_000_000 }));
    expect(await call('phoneStart', { phone: newPhone('05'), dial: '225', purpose: 'signup', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/unavailable' });
    expect((await call('phoneStart', { phone: newPhone('01'), dial: '225', purpose: 'signup', deviceId: 'appareil-audit-0011' })).ok).toBe(true);
    const ids = (await docsOf('phoneGuard')).map((g) => String(g.id));
    expect(ids).toContain(`prefix-${day()}-22501`);
    expect(ids).toContain(`global-${day()}-whatsapp`);
    await clearGuards();
  });
});

describe('S5 — numéro en clair effacé après usage, suppression automatique préparée', () => {
  it('demande utilisée : plus de numéro en clair ; toute demande porte sa date de suppression (Timestamp)', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    const used = (await read(`phoneAuth/${s.requestId}`)) as Record<string, unknown>;
    expect(used.e164).toBeUndefined();
    expect(JSON.stringify(used)).not.toContain(local);
    const deleteAt = used.deleteAt as { toMillis?: () => number } | undefined;
    expect(typeof deleteAt?.toMillis).toBe('function');
    expect(deleteAt!.toMillis!()).toBeGreaterThan(Date.now());
  });
  it('demande annulée (5 faux codes) : numéro en clair effacé aussi', async () => {
    await clearGuards();
    const local = newPhone();
    const { requestId } = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'signup', deviceId: DEVICE }));
    const good = await lastCode(e164(local));
    const bad = good === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) await call('phoneVerify', { requestId, code: bad });
    expect(((await read(`phoneAuth/${requestId}`)) as Record<string, unknown>).e164).toBeUndefined();
  });
});

describe('S6 — numéro déjà posé dans Firebase Auth autrement : refusé', () => {
  it('inscription : « numéro déjà relié », aucune session sur ce compte', async () => {
    await clearGuards();
    const local = newPhone();
    const ghost = await authUserWithPhone(e164(local));
    const v = await ticketFor(local, 'signup');
    expect(await call('phoneSetSecret', { ticket: v.ticket, secret: '483915', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/taken' });
    expect(await read(`phoneSecrets/${ghost}`)).toBeUndefined();
  });
  it('S11 — ajout refusé (numéro d’un autre compte Auth) : l’ancien numéro du compte reste intact', async () => {
    await clearGuards();
    const a = await account('Ama');
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    const first = newPhone();
    const v1 = await ticketFor(first, 'link', { idToken });
    must(await call('phoneSetSecret', { ticket: v1.ticket, secret: '720461', deviceId: DEVICE }, { idToken }));
    await clearGuards();
    const second = newPhone();
    await authUserWithPhone(e164(second));
    const v2 = await ticketFor(second, 'link', { idToken, currentSecret: '720461' });
    expect(await call('phoneSetSecret', { ticket: v2.ticket, secret: '615204', deviceId: DEVICE, currentSecret: '720461' }, { idToken })).toMatchObject({ ok: false, code: 'phone/taken' });
    expect((await sessionFrom(must(await signIn(first, '720461')).token!)).uid).toBe(a.uid);
  });
});

describe('S8 — compte suspendu : refus côté serveur', () => {
  it('connexion : « phone/disabled » ; code oublié : le code secret NE change PAS', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    await setDisabled(s.uid, true);
    expect(await signIn(local, '720461')).toMatchObject({ ok: false, code: 'phone/disabled' });
    await clearGuards();
    const v = await ticketFor(local, 'reset');
    expect(await call('phoneSetSecret', { ticket: v.ticket, secret: '905238', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/disabled' });
    await setDisabled(s.uid, false);
    expect(typeof must(await signIn(local, '720461')).token).toBe('string');
    expect(await signIn(local, '905238')).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
  });
});

describe('S9 — « S’inscrire » avec un numéro déjà inscrit', () => {
  it('le code secret n’est JAMAIS remplacé hors du parcours « code oublié »', async () => {
    await clearGuards();
    const local = newPhone();
    const first = await signUp(local, '720461');
    await clearGuards();
    const v = await ticketFor(local, 'signup');
    expect(v.existing).toBe(true);
    expect(await call('phoneSetSecret', { ticket: v.ticket, secret: '905238', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/exists' });
    expect((await sessionFrom(must(await signIn(local, '720461')).token!)).uid).toBe(first.uid);
    // Le parcours « code oublié » reste le seul moyen de changer le code secret.
    await clearGuards();
    const r = await ticketFor(local, 'reset');
    must(await call('phoneSetSecret', { ticket: r.ticket, secret: '905238', deviceId: DEVICE }));
    expect(typeof must(await signIn(local, '905238')).token).toBe('string');
  });
});

describe('S10 — administrateurs : jamais reliés à un numéro', () => {
  it('compte avec le droit « admin » : « Ajouter mon numéro » refusé avant tout envoi', async () => {
    await clearGuards();
    const a = await account('Admin', { claims: { admin: true } });
    const idToken = await getAuth(a.app).currentUser!.getIdToken(true);
    const local = newPhone();
    expect(await call('phoneStart', { phone: local, dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken })).toMatchObject({ ok: false, code: 'phone/admin' });
    expect(await outbox(e164(local))).toHaveLength(0);
  });
  it('collaborateur du back-office : refusé aussi', async () => {
    await clearGuards();
    const a = await account('Equipe');
    await admin((fs) => setDoc(doc(fs, `boStaff/${a.uid}`), { roleId: 'support', email: `${a.uid}@ex.com`, displayName: 'Equipe' }));
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    expect(await call('phoneStart', { phone: newPhone(), dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken })).toMatchObject({ ok: false, code: 'phone/admin' });
  });
});
