/// <reference types="node" />
/**
 * Connexion par téléphone (docs/connexion-telephone, DECISIONS.md §5bis) sur les ÉMULATEURS :
 * les vraies Cloud Functions `phoneStart`, `phoneVerify`, `phoneSetSecret`, `phoneSignIn`, avec le
 * fournisseur SIMULÉ (aucun vrai envoi : les messages sont écrits dans `phoneOutbox`, lu ici).
 * Lancé par `npm run test:functions`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { HOST, PROJECT, account, admin, read, setup, teardown } from './helpers';

beforeAll(setup);
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await teardown();
});

const FN = `http://${HOST}:5001/${PROJECT}/europe-west1`;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Jeton App Check de TEST : l'émulateur ne vérifie pas la signature, mais exige l'en-tête. */
const APP_CHECK = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ app_id: '1:1:web:1', sub: '1:1:web:1', aud: [`projects/${PROJECT}`], iss: 'https://firebaseappcheck.googleapis.com/1', exp: Math.floor(Date.now() / 1000) + 7200, iat: Math.floor(Date.now() / 1000) })}.x`;

type Res<T> = { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

/** Appel brut d'une fonction (en-tête App Check, jeton d'identité facultatif). */
async function call<T = Record<string, unknown>>(name: string, data: unknown, opts: { appCheck?: boolean; idToken?: string } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.appCheck !== false) headers['X-Firebase-AppCheck'] = APP_CHECK;
  if (opts.idToken) headers.authorization = `Bearer ${opts.idToken}`;
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  const json = (await r.json()) as { result?: T; error?: { message: string; status: string; details?: Record<string, unknown> } };
  if (json.error) return { ok: false, code: json.error.message === 'Unauthenticated' ? 'unauthenticated' : json.error.message, details: json.error.details };
  return { ok: true, data: json.result as T };
}
const must = <T>(r: Res<T>): T => {
  if (!r.ok) throw new Error(`refus inattendu : ${r.code}`);
  return r.data;
};

let n = 0;
/** Numéro ivoirien neuf (10 chiffres, commence par 07). */
const newPhone = () => `07${String(Date.now() % 1e6).padStart(6, '0')}${String(n++ % 100).padStart(2, '0')}`;
const e164 = (local: string) => `+225${local}`;
const DEVICE = 'appareil-de-test-0001';

async function outbox(to: string) {
  return admin(async (fs) => (await getDocs(collection(fs, 'phoneOutbox'))).docs.map((d) => d.data()).filter((m) => m.to === to || m.phone === to));
}
async function lastCode(to: string): Promise<string> {
  const codes = (await outbox(to)).filter((m) => m.kind === 'code').sort((a, b) => Number(a.at) - Number(b.at));
  return String(codes[codes.length - 1]?.code ?? '');
}

const apps: FirebaseApp[] = [];
/** Ouvre la session Firebase avec le jeton personnalisé rendu par la fonction. */
async function sessionFrom(token: string) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT, appId: '1:1:web:1' }, `phone${Date.now()}${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const cred = await signInWithCustomToken(auth, token);
  return { uid: cred.user.uid, idToken: await cred.user.getIdToken(), phone: cred.user.phoneNumber };
}

/** Inscription complète : numéro → code reçu → code secret. */
async function signUp(local: string, secret = '483915', device = DEVICE) {
  const start = must(await call<{ requestId: string; channel: string }>('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'whatsapp', deviceId: device, lang: 'fr' }));
  const v = must(await call<{ ticket: string; existing: boolean }>('phoneVerify', { requestId: start.requestId, code: await lastCode(e164(local)) }));
  const s = must(await call<{ token: string }>('phoneSetSecret', { ticket: v.ticket, secret, deviceId: device }));
  return { ...(await sessionFrom(s.token)), existing: v.existing };
}

/** Remet à zéro les limites d'envoi d'un numéro (pour enchaîner plusieurs parcours dans un test). */
const clearGuards = () => admin(async (fs) => Promise.all((await getDocs(collection(fs, 'phoneGuard'))).docs.map((d) => deleteDoc(d.ref))));

describe('App Check obligatoire', () => {
  it('sans jeton App Check : refusé ; avec : accepté', async () => {
    const local = newPhone();
    const no = await call('phoneStart', { phone: local, dial: '225', purpose: 'signup', deviceId: DEVICE }, { appCheck: false });
    expect(no).toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(await outbox(e164(local))).toHaveLength(0);
    expect((await call('phoneStart', { phone: local, dial: '225', purpose: 'signup', deviceId: DEVICE })).ok).toBe(true);
  });
});

describe('inscription : numéro → code WhatsApp → code secret → session', () => {
  it('compte créé, numéro posé, empreintes seulement (jamais le code secret ni le code reçu en clair)', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '483915');
    expect(s.existing).toBe(false);
    expect(s.phone).toBe(e164(local));
    const secrets = (await read(`phoneSecrets/${s.uid}`)) as Record<string, unknown>;
    expect(secrets.hash).toMatch(/^[0-9a-f]{64}$/);
    const docsOf = (c: string) => admin(async (fs) => (await getDocs(collection(fs, c))).docs.map((d) => [d.id, d.data()]));
    const dumps = [];
    for (const c of ['phoneSecrets', 'phoneIndex', 'phoneAuth', 'phoneGuard', 'phoneDevices']) dumps.push(await docsOf(c));
    const all = JSON.stringify(dumps);
    expect(all).not.toContain('483915');
    expect(all).not.toContain(`"${await lastCode(e164(local))}"`);
    // Le numéro n'est jamais un identifiant de document.
    expect(all).not.toContain(`"${e164(local)}",{`);
    const msg = (await outbox(e164(local)))[0];
    expect(msg).toMatchObject({ kind: 'code', channel: 'whatsapp' });
    expect(String(msg.body)).toMatch(/expire dans 10 minutes/);
  });
});

describe('code reçu : 10 minutes, usage unique, 5 essais', () => {
  const start = async (local: string) => must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'signup', deviceId: DEVICE }));
  it('mauvais code : refusé, essais restants donnés ; 5e erreur : demande annulée (même le bon code est refusé)', async () => {
    await clearGuards();
    const local = newPhone();
    const { requestId } = await start(local);
    const good = await lastCode(e164(local));
    const bad = good === '000000' ? '000001' : '000000';
    const first = await call('phoneVerify', { requestId, code: bad });
    expect(first).toMatchObject({ ok: false, code: 'phone/wrong-code', details: { attemptsLeft: 4 } });
    for (let i = 0; i < 3; i++) await call('phoneVerify', { requestId, code: bad });
    expect(await call('phoneVerify', { requestId, code: bad })).toMatchObject({ ok: false, code: 'phone/too-many' });
    expect(await call('phoneVerify', { requestId, code: good })).toMatchObject({ ok: false });
  });
  it('usage unique : un code déjà utilisé est refusé', async () => {
    await clearGuards();
    const local = newPhone();
    const { requestId } = await start(local);
    const code = await lastCode(e164(local));
    expect((await call('phoneVerify', { requestId, code })).ok).toBe(true);
    expect(await call('phoneVerify', { requestId, code })).toMatchObject({ ok: false, code: 'phone/used' });
  });
  it('après 10 minutes : « code expiré »', async () => {
    await clearGuards();
    const local = newPhone();
    const { requestId } = await start(local);
    await admin((fs) => setDoc(doc(fs, `phoneAuth/${requestId}`), { expiresAt: Date.now() - 1 }, { merge: true }));
    expect(await call('phoneVerify', { requestId, code: await lastCode(e164(local)) })).toMatchObject({ ok: false, code: 'phone/expired' });
  });
});

describe('envois limités : 1 par minute, 5 par jour et par numéro, plafond global', () => {
  const send = (local: string, device = DEVICE) => call('phoneStart', { phone: local, dial: '225', purpose: 'signup', deviceId: device });
  it('2e envoi dans la minute : refusé (« too-soon »), rien n’est envoyé', async () => {
    await clearGuards();
    const local = newPhone();
    expect((await send(local)).ok).toBe(true);
    expect(await send(local)).toMatchObject({ ok: false, code: 'phone/too-soon' });
    expect(await outbox(e164(local))).toHaveLength(1);
  });
  it('6e envoi du jour : refusé (« daily-limit »)', async () => {
    await clearGuards();
    const local = newPhone();
    expect((await send(local)).ok).toBe(true);
    const day = new Date().toISOString().slice(0, 10);
    await admin(async (fs) => {
      for (const d of (await getDocs(collection(fs, 'phoneGuard'))).docs) if (d.data().sends === 1 && d.data().day === day && 'lockLevel' in d.data()) await setDoc(d.ref, { sends: 5, lastSendAt: 0 }, { merge: true });
    });
    expect(await send(local)).toMatchObject({ ok: false, code: 'phone/daily-limit' });
    expect(await outbox(e164(local))).toHaveLength(1);
  });
  it('plafond global du jour atteint : plus aucun envoi, alerte au back-office (une fois)', async () => {
    await clearGuards();
    const day = new Date().toISOString().slice(0, 10);
    await admin((fs) => setDoc(doc(fs, `phoneGuard/global-${day}`), { sends: 2000, alerted: false }));
    const local = newPhone();
    expect(await send(local)).toMatchObject({ ok: false, code: 'phone/unavailable' });
    expect(await send(newPhone(), 'autre-appareil-0002')).toMatchObject({ ok: false, code: 'phone/unavailable' });
    expect(await outbox(e164(local))).toHaveLength(0);
    const audit = await admin(async (fs) => (await getDocs(collection(fs, 'boAudit'))).docs.map((d) => d.data()).filter((a) => a.action === 'phone.dailyCap'));
    expect(audit).toHaveLength(1);
    await clearGuards();
  });
});

describe('5bis.5 — SMS seulement vers les pays proposés par l’application', () => {
  it('indicatif hors liste (+1) par SMS : refusé, AUCUN envoi', async () => {
    await clearGuards();
    const r = await call('phoneStart', { phone: '+1 202 555 0123', purpose: 'signup', channel: 'sms', deviceId: DEVICE });
    expect(r).toMatchObject({ ok: false, code: 'phone/sms-country' });
    expect(await outbox('+12025550123')).toHaveLength(0);
  });
  it('Côte d’Ivoire par SMS : envoyé', async () => {
    await clearGuards();
    const local = newPhone();
    expect((await call('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'sms', deviceId: DEVICE })).ok).toBe(true);
    expect((await outbox(e164(local)))[0]).toMatchObject({ kind: 'code', channel: 'sms' });
  });
});

describe('connexion : numéro + code secret, blocage par numéro tenté', () => {
  it('bon code secret, même téléphone : session, sans aucun message envoyé', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    const before = (await outbox(e164(local))).length;
    const r = must(await call<{ token: string }>('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE }));
    expect((await sessionFrom(r.token)).uid).toBe(s.uid);
    expect(await outbox(e164(local))).toHaveLength(before);
  });
  it('5 erreurs : bloqué 15 min, même avec le bon code ensuite', async () => {
    await clearGuards();
    const local = newPhone();
    await signUp(local, '720461');
    for (let i = 0; i < 4; i++) expect(await call('phoneSignIn', { phone: local, dial: '225', secret: '905238', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
    const fifth = await call('phoneSignIn', { phone: local, dial: '225', secret: '905238', deviceId: DEVICE });
    expect(fifth).toMatchObject({ ok: false, code: 'phone/locked' });
    const retryAt = Number((fifth as { details?: { retryAt?: number } }).details?.retryAt);
    expect(retryAt - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(await call('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/locked' });
  });
  it('20 essais EN PARALLÈLE : au plus 5 vérifiés, puis « bloqué » (l’essai est réservé avant la vérification)', async () => {
    await clearGuards();
    const local = newPhone();
    await signUp(local, '720461');
    const all = await Promise.all(Array.from({ length: 20 }, () => call('phoneSignIn', { phone: local, dial: '225', secret: '905238', deviceId: DEVICE })));
    const wrong = all.filter((r) => !r.ok && r.code === 'phone/wrong-secret').length;
    const locked = all.filter((r) => !r.ok && r.code === 'phone/locked').length;
    expect(all.every((r) => !r.ok)).toBe(true);
    // 4 « incorrect » au plus, le 5e essai pose le blocage ; les 15 autres sont refusés sans vérification.
    expect(wrong).toBeLessThanOrEqual(4);
    expect(wrong + locked).toBe(20);
    // Un seul blocage (15 min), pas quatre (24 h) : seuls 5 essais ont été comptés.
    // Compteurs d'erreurs posés (l'appareil de l'inscription est connu : compteur à part, audit 23/10 S3).
    const guards = await admin(async (fs) => (await getDocs(collection(fs, 'phoneGuard'))).docs.map((d) => d.data()).filter((g) => Number(g.lockLevel ?? 0) > 0));
    expect(guards.map((g) => g.lockLevel)).toEqual([1]);
    expect(await call('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/locked' });
  });
  it('numéro inconnu : même réponse et même temps de calcul qu’un mauvais code', async () => {
    await clearGuards();
    const local = newPhone();
    await signUp(local, '720461');
    const time = async (phone: string) => {
      const t = Date.now();
      const r = await call('phoneSignIn', { phone, dial: '225', secret: '905238', deviceId: DEVICE });
      return { ms: Date.now() - t, r };
    };
    await time(newPhone()); // préchauffage
    const known = [await time(local), await time(local)];
    const unknown = [await time(newPhone()), await time(newPhone())];
    for (const u of unknown) expect(u.r).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
    const avg = (xs: { ms: number }[]) => xs.reduce((s, x) => s + x.ms, 0) / xs.length;
    expect(avg(unknown)).toBeGreaterThan(avg(known) * 0.5);
  });
});

describe('nouveau téléphone : le code secret seul ne suffit pas', () => {
  it('appareil inconnu → « code requis » ; code WhatsApp vérifié → session ; ensuite plus de code', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    const other = 'nouveau-telephone-0003';
    expect(must(await call('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: other }))).toEqual({ needsDevice: true });
    await clearGuards(); // l'inscription vient d'envoyer un code : « 1 par minute » refuserait le suivant
    const start = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'device', deviceId: other }));
    const v = must(await call<{ ticket: string }>('phoneVerify', { requestId: start.requestId, code: await lastCode(e164(local)) }));
    const r = must(await call<{ token: string }>('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: other, ticket: v.ticket }));
    expect((await sessionFrom(r.token)).uid).toBe(s.uid);
    const again = must(await call<{ token?: string }>('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: other }));
    expect(typeof again.token).toBe('string');
  });
  it('ticket de nouveau téléphone : utilisé UNE fois, même avec deux appels simultanés', async () => {
    await clearGuards();
    const local = newPhone();
    const s = await signUp(local, '720461');
    await clearGuards();
    const start = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'device', deviceId: 'nouveau-telephone-0004' }));
    const v = must(await call<{ ticket: string }>('phoneVerify', { requestId: start.requestId, code: await lastCode(e164(local)) }));
    const devices = Array.from({ length: 6 }, (_, i) => `nouveau-telephone-01${i}`);
    const all = await Promise.all(devices.map((d) => call('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: d, ticket: v.ticket })));
    expect(all.filter((r) => r.ok)).toHaveLength(1);
    expect(all.filter((r) => !r.ok && r.code === 'phone/expired')).toHaveLength(5);
    // Un seul nouvel appareil enregistré (en plus de celui de l'inscription).
    const keys = await admin(async (fs) => (await getDocs(collection(fs, 'phoneDevices'))).docs.find((d) => d.id === s.uid)?.data().keys as string[]);
    expect(keys).toHaveLength(2);
  });
});

describe('ticket du code secret : utilisé UNE fois, même avec deux appels simultanés', () => {
  it('deux phoneSetSecret simultanés avec le même ticket : un seul réussit', async () => {
    await clearGuards();
    const local = newPhone();
    const start = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'whatsapp', deviceId: DEVICE, lang: 'fr' }));
    const v = must(await call<{ ticket: string }>('phoneVerify', { requestId: start.requestId, code: await lastCode(e164(local)) }));
    const secrets = ['483915', '615204', '720461', '905238', '372819', '846153'];
    // Préchauffage : l'émulateur ouvre un processus par appel simultané (sinon il les enchaîne).
    await Promise.all(secrets.map((secret) => call('phoneSetSecret', { ticket: 'ticket-inconnu', secret, deviceId: DEVICE })));
    const all = await Promise.all(secrets.map((secret) => call('phoneSetSecret', { ticket: v.ticket, secret, deviceId: DEVICE })));
    expect(all.filter((r) => r.ok)).toHaveLength(1);
    expect(all.filter((r) => !r.ok && r.code === 'phone/expired')).toHaveLength(5);
  });
});

describe('code secret oublié + 5bis.5 : alerte aux appareils et à l’e-mail, sans aucun code', () => {
  it('nouveau code secret, même compte ; l’ancien ne marche plus ; alertes push + e-mail sans code', async () => {
    await clearGuards();
    // Compte e-mail auquel on a ajouté son numéro : il a un e-mail ET des appareils.
    const a = await account('Awa');
    const local = newPhone();
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    const st = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken }));
    const lv = must(await call<{ ticket: string }>('phoneVerify', { requestId: st.requestId, code: await lastCode(e164(local)) }));
    must(await call('phoneSetSecret', { ticket: lv.ticket, secret: '720461', deviceId: DEVICE }, { idToken }));
    await admin((fs) => setDoc(doc(fs, `users/${a.uid}/devices/d1`), { token: 'ExponentPushToken[appareil-de-awa]', platform: 'android', updatedAt: 1 }));
    await clearGuards();
    const start = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'reset', deviceId: DEVICE }));
    const otp = await lastCode(e164(local));
    const v = must(await call<{ ticket: string; existing: boolean }>('phoneVerify', { requestId: start.requestId, code: otp }));
    expect(v.existing).toBe(true);
    const s = must(await call<{ token: string }>('phoneSetSecret', { ticket: v.ticket, secret: '905238', deviceId: DEVICE }));
    expect((await sessionFrom(s.token)).uid).toBe(a.uid);
    expect(await call('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/wrong-secret' });
    // Alertes « code secret changé » (l'ajout du numéro a sa propre alerte, audit 23/10 S1 : motif « linked »).
    const alerts = await admin(async (fs) => (await getDocs(collection(fs, 'phoneOutbox'))).docs.map((d) => d.data()).filter((m) => m.uid === a.uid && String(m.kind).startsWith('alert') && m.reason === 'secret'));
    expect(alerts.map((x) => x.kind).sort()).toEqual(['alert-email', 'alert-push']);
    expect(alerts.find((x) => x.kind === 'alert-push')?.to).toBe('ExponentPushToken[appareil-de-awa]');
    expect(alerts.find((x) => x.kind === 'alert-email')?.to).toBe(`${a.uid}@ex.com`);
    const json = JSON.stringify(alerts);
    for (const secretOrCode of ['905238', '720461', otp]) expect(json).not.toContain(secretOrCode);
  });
});

describe('compte e-mail : « Ajouter mon numéro » (même uid, rien de perdu, e-mail toujours possible)', () => {
  it('numéro ajouté au même compte ; connexion par numéro OU par e-mail ; profil intact', async () => {
    await clearGuards();
    const a = await account('Kofi');
    const before = await read(`users/${a.uid}`);
    const local = newPhone();
    const idToken = await getAuth(a.app).currentUser!.getIdToken();
    // Sans être connecté : « link » refusé.
    expect(await call('phoneStart', { phone: local, dial: '225', purpose: 'link', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/auth' });
    const st = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken }));
    const v = must(await call<{ ticket: string }>('phoneVerify', { requestId: st.requestId, code: await lastCode(e164(local)) }));
    expect(must(await call('phoneSetSecret', { ticket: v.ticket, secret: '720461', deviceId: DEVICE }, { idToken }))).toEqual({ linked: true });
    const viaPhone = must(await call<{ token: string }>('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE }));
    const session = await sessionFrom(viaPhone.token);
    expect(session.uid).toBe(a.uid);
    expect(session.phone).toBe(e164(local));
    expect(await read(`users/${a.uid}`)).toEqual(before);
    // L'e-mail et le mot de passe marchent toujours.
    const app2 = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT, appId: '1:1:web:1' }, `mail${Date.now()}`);
    apps.push(app2);
    const auth2 = getAuth(app2);
    connectAuthEmulator(auth2, `http://${HOST}:9099`, { disableWarnings: true });
    expect((await signInWithEmailAndPassword(auth2, `${a.uid}@ex.com`, 'motdepasse123')).user.uid).toBe(a.uid);
  });
  it('numéro déjà relié à un autre compte : refus (« phone/taken »), rien n’est fusionné', async () => {
    await clearGuards();
    const local = newPhone();
    const owner = await signUp(local, '720461');
    await clearGuards();
    const b = await account('Ama');
    const idToken = await getAuth(b.app).currentUser!.getIdToken();
    const st = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'link', deviceId: DEVICE }, { idToken }));
    const v = must(await call<{ ticket: string }>('phoneVerify', { requestId: st.requestId, code: await lastCode(e164(local)) }));
    expect(await call('phoneSetSecret', { ticket: v.ticket, secret: '483915', deviceId: DEVICE }, { idToken })).toMatchObject({ ok: false, code: 'phone/taken' });
    const r = must(await call<{ token: string }>('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE }));
    expect((await sessionFrom(r.token)).uid).toBe(owner.uid);
  });
});

describe('inscription avec un numéro déjà inscrit : rien n’est révélé avant le code', () => {
  // Audit 23/10, S9 : après le code, « existing » ; le code secret n'est JAMAIS remplacé par une
  // inscription (écran « Ce numéro a déjà un compte », puis « Code secret oublié ? »).
  it('phoneStart répond pareil ; après le code, « existing » : le code secret n’est pas remplacé', async () => {
    await clearGuards();
    const local = newPhone();
    const first = await signUp(local, '720461');
    await clearGuards();
    const start = must(await call<{ requestId: string }>('phoneStart', { phone: local, dial: '225', purpose: 'signup', channel: 'whatsapp', deviceId: DEVICE, lang: 'fr' }));
    const v = must(await call<{ ticket: string; existing: boolean }>('phoneVerify', { requestId: start.requestId, code: await lastCode(e164(local)) }));
    expect(v.existing).toBe(true);
    expect(await call('phoneSetSecret', { ticket: v.ticket, secret: '905238', deviceId: DEVICE })).toMatchObject({ ok: false, code: 'phone/exists' });
    const r = must(await call<{ token: string }>('phoneSignIn', { phone: local, dial: '225', secret: '720461', deviceId: DEVICE }));
    expect((await sessionFrom(r.token)).uid).toBe(first.uid);
  });
});
