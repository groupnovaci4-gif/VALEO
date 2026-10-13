/// <reference types="node" />
/**
 * Parrainage de bout en bout sur les ÉMULATEURS (auth + firestore + functions) :
 * les vraies Cloud Functions (`myReferral`, `applyReferral`, déclencheurs sur
 * les opérations, `setAmbassador`, `adminReferralStats`, `link`, `deleteAccount`)
 * appelées comme par l'application. Lancé par `npm run test:functions`.
 *
 * Les comptes sont créés par l'API de l'émulateur d'authentification, avec une
 * date d'inscription choisie (aucun bouchon : c'est la même date que lit le serveur).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { refusalCode } from '../../src/core/referral';

const PROJECT = 'demo-dinerox';
const HOST = '127.0.0.1';
const AUTH = `http://${HOST}:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const D = 24 * 3600 * 1000;
const PASSWORD = 'motdepasse123';

let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
let n = 0;

/** Compte réel de l'émulateur, inscrit il y a `daysAgo` jours, avec son profil et son espace personnel. */
async function account(firstName: string, daysAgo = 0, claims: Record<string, unknown> = {}) {
  const uid = `u${Date.now().toString(36)}${n++}`;
  const email = `${uid}@ex.com`;
  const createdAt = Date.now() - daysAgo * D;
  const r = await fetch(`${AUTH}/accounts:batchCreate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ users: [{ localId: uid, email, rawPassword: PASSWORD, createdAt: String(createdAt), customAttributes: JSON.stringify(claims) }] }),
  });
  expect(r.status).toBe(200);
  await admin(async (fs) => {
    await setDoc(doc(fs, `users/${uid}`), {
      uid,
      firstName,
      lastName: '',
      email,
      country: 'CI',
      currency: 'XOF',
      language: 'fr',
      timezone: 'Africa/Abidjan',
      preferences: {},
      subscription: { plan: 'free', status: 'active', provider: 'none', updatedAt: 1 },
      onboarding: { completed: true },
      createdAt,
      updatedAt: createdAt,
    });
    await setDoc(doc(fs, `spaces/${uid}`), { id: uid, kind: 'personal', name: firstName, ownerId: uid, members: { [uid]: 'admin' }, memberIds: [uid], memberNames: { [uid]: firstName }, currency: 'XOF', createdAt, updatedAt: createdAt });
  });
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT, appId: '1:1:web:1' }, uid);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, HOST, 5001);
  const call = <O = unknown>(name: string, data: unknown) => httpsCallable<unknown, O>(functions, name)(data).then((x) => x.data);
  return { uid, createdAt, call };
}

/** Lecture / écriture sans règles (comme la console) : vérifier ce que le SERVEUR a écrit. */
async function admin<T>(fn: (fs: Firestore) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore() as unknown as Firestore);
  });
  return out as T;
}
const read = (path: string) => admin(async (fs) => (await getDoc(doc(fs, path))).data());

/** Attend qu'une condition soit vraie (déclencheurs asynchrones de l'émulateur). */
async function until<T>(get: () => Promise<T>, ok: (v: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  let v = await get();
  while (!ok(v) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 300));
    v = await get();
  }
  return v;
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'accepted';
  } catch (e) {
    // Même lecture que l'application (`refusalOf`) : code de refus, sinon message brut.
    const message = (e as { message?: string }).message;
    return refusalCode(message) ?? message?.replace(/\s*\[\d+\]$/, '');
  }
};

/**
 * Semaine régulière écrite comme le ferait la synchronisation de l'appareil :
 * 5 jours actifs (jours 0 à 4 après l'inscription), 5 dépenses, 1 revenu, 2 objectifs.
 */
async function regularWeek(uid: string, createdAt: number, activeDays = 5) {
  await admin(async (fs) => {
    const base = { currency: 'XOF', accountId: 'cash', createdBy: uid, syncedAt: 1 };
    for (let d = 0; d < activeDays; d++) {
      const at = createdAt + d * D + 3600_000;
      await setDoc(doc(fs, `spaces/${uid}/transactions/e${d}`), { ...base, id: `e${d}`, type: 'expense', amount: 1000 + d, categoryId: 'cat_food', date: '2026-10-01', createdAt: at, updatedAt: at });
    }
    const inc = createdAt + D + 7200_000;
    await setDoc(doc(fs, `spaces/${uid}/transactions/i1`), { ...base, id: 'i1', type: 'income', amount: 50000, categoryId: 'inc_salary', date: '2026-10-02', createdAt: inc, updatedAt: inc });
    for (const g of ['g1', 'g2']) {
      const at = createdAt + 1800_000;
      await setDoc(doc(fs, `spaces/${uid}/goals/${g}`), { id: g, name: 'Objectif', createdBy: uid, createdAt: at, updatedAt: at, targetAmount: 100000, initialAmount: 0, status: 'active', priority: 'normal', syncedAt: 1 });
    }
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: HOST, port: 8080, rules: readFileSync('firebase/firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe('mon code', () => {
  it('créé une fois par le serveur, toujours le même ensuite', async () => {
    const p = await account('Awa');
    const a = await p.call<{ code: string }>('myReferral', { deviceId: 'device-awa' });
    const b = await p.call<{ code: string }>('myReferral', { deviceId: 'device-awa' });
    expect(a.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(b.code).toBe(a.code);
    expect(await read(`referralCodes/${a.code}`)).toMatchObject({ uid: p.uid });
    expect(await read(`users/${p.uid}/referral/state`)).toMatchObject({ code: a.code, validated: 0, monthsEarned: 0 });
  });
});

describe('appliquer un code', () => {
  it('accepté : parrain enregistré une fois, prénom du parrain pour la bienvenue, aucun montant', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-p-1' });
    const f = await account('Kofi', 1);
    expect(await f.call('applyReferral', { code: code.toLowerCase(), source: 'manual', deviceId: 'dev-f-1' })).toEqual({ parrainFirstName: 'Awa' });
    const me = await read(`users/${f.uid}`);
    expect(me?.referredBy).toMatchObject({ uid: p.uid, code, firstName: 'Awa', source: 'manual' });
    expect(me?.referralProgress).toMatchObject({ status: 'signed_up' });
    const child = await read(`users/${p.uid}/referrals/${f.uid}`);
    expect(child).toMatchObject({ status: 'signed_up', firstName: 'Kofi' });
    expect(JSON.stringify(child)).not.toMatch(/amount|montant|balance|solde/i);
    // Le code ne peut plus être changé.
    expect(await refusal(f.call('applyReferral', { code, source: 'manual', deviceId: 'dev-f-1' }))).toBe('referral/already-referred');
  });

  it('refus : code inconnu, son propre code, compte de plus de 7 jours', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-p-2' });
    const f = await account('Kofi');
    expect(await refusal(f.call('applyReferral', { code: 'ZZZZ22', source: 'manual', deviceId: 'dev-f-2' }))).toBe('referral/unknown-code');
    expect(await refusal(p.call('applyReferral', { code, source: 'manual', deviceId: 'dev-p-2' }))).toBe('referral/self');
    const old = await account('Ama', 8);
    expect(await refusal(old.call('applyReferral', { code, source: 'manual', deviceId: 'dev-old' }))).toBe('referral/too-late');
    const six = await account('Yao', 6);
    expect(await six.call('applyReferral', { code, source: 'install_referrer', deviceId: 'dev-six' })).toEqual({ parrainFirstName: 'Awa' });
  });

  it('anti-triche appareil : téléphone du parrain refusé, un appareil n’est filleul qu’une fois', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-shared-parrain' });
    const f1 = await account('Kofi');
    expect(await refusal(f1.call('applyReferral', { code, source: 'manual', deviceId: 'dev-shared-parrain' }))).toBe('referral/self');
    expect(await f1.call('applyReferral', { code, source: 'manual', deviceId: 'dev-once' })).toEqual({ parrainFirstName: 'Awa' });
    const f2 = await account('Ama');
    expect(await refusal(f2.call('applyReferral', { code, source: 'manual', deviceId: 'dev-once' }))).toBe('referral/device-used');
    expect(await refusal(f2.call('applyReferral', { code, source: 'manual' }))).toBe('referral/device-required');
    // L'identifiant d'appareil n'est jamais stocké en clair.
    const devices = await admin(async (fs) => (await getDocs(collection(fs, 'referralDevices'))).docs.map((d) => d.id));
    expect(devices.every((id) => /^[0-9a-f]{64}$/.test(id))).toBe(true);
    expect(devices.join()).not.toContain('dev-once');
    // Refus comptés pour l'écran admin (suspicions), sans détail personnel.
    expect(await read(`users/${p.uid}/referral/state`)).toMatchObject({ refusals: { self: 1, 'device-used': 1, 'device-required': 1 }, refusalsTotal: 3 });
  });
});

describe('semaine régulière et récompense du parrain', () => {
  it('filleul validé par ses vraies opérations ; 4 validés → rien, 5 → 1 mois au parrain ; le filleul ne reçoit rien', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-p-reward' });
    const filleuls = [];
    for (let i = 0; i < 5; i++) {
      const f = await account(`Filleul${i}`, 6);
      await f.call('applyReferral', { code, source: 'manual', deviceId: `dev-reward-${i}` });
      filleuls.push(f);
    }
    // Les 4 premiers utilisent l'application toute une semaine.
    for (const f of filleuls.slice(0, 4)) await regularWeek(f.uid, f.createdAt);
    const after4 = await until(() => read(`users/${p.uid}/referral/state`), (s) => (s?.validated ?? 0) >= 4);
    expect(after4).toMatchObject({ validated: 4, converted: 0, monthsEarned: 0, pending: 4 });
    expect((await read(`users/${p.uid}`))?.grants).toBeUndefined();
    for (const f of filleuls.slice(0, 4)) {
      expect((await read(`users/${f.uid}`))?.referralProgress).toMatchObject({ status: 'validated', activeDays: 5, expenses: 5, incomes: 1, goals: 2 });
      expect((await read(`users/${p.uid}/referrals/${f.uid}`))?.status).toBe('validated');
    }
    // Avis au parrain : « 4/5 ».
    expect(after4?.notices?.at(-1)).toMatchObject({ kind: 'validated', count: 4 });

    // Le 5e : 1 mois de Plus offert au parrain.
    await regularWeek(filleuls[4].uid, filleuls[4].createdAt);
    const after5 = await until(() => read(`users/${p.uid}/referral/state`), (s) => (s?.monthsEarned ?? 0) >= 1);
    expect(after5).toMatchObject({ validated: 5, converted: 5, monthsEarned: 1, pending: 0 });
    expect(after5?.notices?.at(-1)).toMatchObject({ kind: 'month', count: 1 });
    const grants = (await read(`users/${p.uid}`))?.grants;
    expect(grants?.plusUntil).toBeGreaterThan(Date.now() + 27 * D);
    expect(grants?.plusUntil).toBeLessThan(Date.now() + 32 * D);
    for (const f of filleuls) {
      expect((await read(`users/${p.uid}/referrals/${f.uid}`))?.status).toBe('rewarded');
      // Le filleul ne reçoit AUCUN mois du fait d'avoir été parrainé.
      expect((await read(`users/${f.uid}`))?.grants).toBeUndefined();
    }
  }, 120_000);

  it('4 jours actifs seulement : progression visible chez le filleul et le parrain, pas de validation', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-p-partial' });
    const f = await account('Kofi', 6);
    await f.call('applyReferral', { code, source: 'manual', deviceId: 'dev-partial' });
    await regularWeek(f.uid, f.createdAt, 4);
    const child = await until(() => read(`users/${p.uid}/referrals/${f.uid}`), (c) => c?.progress?.goals === 2 && c?.progress?.activeDays === 4);
    expect(child).toMatchObject({ status: 'signed_up', progress: { activeDays: 4, expenses: 4, incomes: 1, goals: 2 } });
    expect((await read(`users/${f.uid}`))?.referralProgress).toMatchObject({ status: 'signed_up', activeDays: 4, expenses: 4 });
    expect(await read(`users/${p.uid}/referral/state`)).toMatchObject({ validated: 0 });
  }, 60_000);
});

describe('administration', () => {
  it('ambassadeur et statistiques : réservés au droit admin', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-amb' });
    const user = await account('Kofi');
    expect(await refusal(user.call('setAmbassador', { code, enabled: true, maxRewardsPerMonth: 8 }))).toBe('admin/required');
    expect(await refusal(user.call('adminReferralStats', {}))).toBe('admin/required');
    const boss = await account('Admin', 0, { admin: true });
    expect(await boss.call('setAmbassador', { code, enabled: true, maxRewardsPerMonth: 8 })).toEqual({ ambassador: { enabled: true, maxRewardsPerMonth: 8 } });
    expect((await read(`users/${p.uid}/referral/state`))?.ambassador).toEqual({ enabled: true, maxRewardsPerMonth: 8 });
    expect(await refusal(boss.call('setAmbassador', { code, enabled: true, maxRewardsPerMonth: -1 }))).toBe('referral/invalid-cap');
    const stats = await boss.call<{ codes: number; signups: number; top: { code: string; ambassador: boolean }[] }>('adminReferralStats', {});
    expect(stats.codes).toBeGreaterThan(0);
    expect(stats.signups).toBeGreaterThan(0);
    expect(JSON.stringify(stats)).not.toMatch(/amount|balance|solde|email/i);
  });
});

describe('suppression de compte', () => {
  it('filleul supprimé : prénom effacé chez le parrain, appareil toujours « déjà filleul »', async () => {
    const p = await account('Awa');
    const { code } = await p.call<{ code: string }>('myReferral', { deviceId: 'dev-p-del' });
    const f = await account('Kofi');
    await f.call('applyReferral', { code, source: 'manual', deviceId: 'dev-del' });
    await f.call('deleteAccount', {});
    const child = await read(`users/${p.uid}/referrals/${f.uid}`);
    expect(child).toMatchObject({ status: 'rejected', firstName: '' });
    const again = await account('Ama');
    expect(await refusal(again.call('applyReferral', { code, source: 'manual', deviceId: 'dev-del' }))).toBe('referral/device-used');
  });
});

describe('page de redirection des liens', () => {
  const url = (path: string) => `http://${HOST}:5001/${PROJECT}/europe-west1/link${path}`;
  it('Android → Play Store avec le referrer (code et source)', async () => {
    const r = await fetch(url('/i/ABC234?src=whatsapp'), { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Tecno)' } });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://play.google.com/store/apps/details?id=com.dinerox.app&referrer=ref%3DABC234%26src%3Dwhatsapp');
  });
  it('ordinateur → page avec QR code ; iPhone → « Bientôt sur iPhone » ; code invalide → 404', async () => {
    const desk = await fetch(url('/i/ABC234'), { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' } });
    const html = await desk.text();
    expect(desk.status).toBe(200);
    expect(html).toContain('<svg');
    expect(html).toContain('ABC234');
    const ios = await fetch(url('/i/ABC234'), { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', 'accept-language': 'fr-FR' } });
    expect(await ios.text()).toContain('Bientôt sur iPhone');
    expect((await fetch(url('/i/ABC0O1'))).status).toBe(404);
  });
});

describe('passage de nuit (même code que la fonction planifiée `referralNightly`)', () => {
  it('report : filleuls en réserve convertis le mois suivant ; semaine non validée après 30 jours → expiré', async () => {
    // Le SDK Admin des fonctions, pointé sur l'émulateur Firestore par `emulators:exec`.
    const { initializeApp: initAdmin, getApps } = await import('../../firebase/functions/node_modules/firebase-admin/lib/app/index.js');
    if (!getApps().length) initAdmin({ projectId: PROJECT });
    const { nightlyReferrals } = await import('../../firebase/functions/src/referralApi');
    const now = Date.now();
    const lastMonth = new Date(now - 32 * D).toISOString().slice(0, 7);
    const p = await account('Awa');
    // Parrain : 10 validés, 5 déjà convertis le mois dernier, 5 en réserve (plafond atteint alors).
    await admin(async (fs) => {
      await setDoc(doc(fs, `users/${p.uid}/referral/state`), { code: 'RPT234', validated: 10, converted: 5, monthsEarned: 1, monthsByPeriod: { [lastMonth]: 1 }, pending: 5, signups: 10 });
      for (let i = 0; i < 5; i++) await setDoc(doc(fs, `users/${p.uid}/referrals/r${i}`), { status: 'validated', firstName: '', validatedAt: now - (40 - i) * D, signedUpAt: now - 45 * D });
    });
    // Filleul inscrit il y a 31 jours, jamais régulier.
    const f = await account('Kofi', 31);
    await admin(async (fs) => {
      await setDoc(doc(fs, `users/${f.uid}`), { referredBy: { uid: p.uid, code: 'RPT234', firstName: 'Awa', at: f.createdAt, source: 'manual', signupAt: f.createdAt }, referralProgress: { status: 'signed_up', day: 0, activeDays: 0, expenses: 0, incomes: 0, goals: 0, updatedAt: f.createdAt } }, { merge: true });
      await setDoc(doc(fs, `users/${p.uid}/referrals/${f.uid}`), { status: 'signed_up', firstName: 'Kofi', signedUpAt: f.createdAt, progress: {} });
    });
    const r = await nightlyReferrals(now);
    expect(r.converted).toBeGreaterThanOrEqual(1);
    expect(await read(`users/${p.uid}/referral/state`)).toMatchObject({ validated: 10, converted: 10, monthsEarned: 2, pending: 0 });
    expect((await read(`users/${p.uid}`))?.grants?.plusUntil).toBeGreaterThan(now + 27 * D);
    for (let i = 0; i < 5; i++) expect((await read(`users/${p.uid}/referrals/r${i}`))?.status).toBe('rewarded');
    expect((await read(`users/${f.uid}`))?.referralProgress?.status).toBe('expired');
    expect((await read(`users/${p.uid}/referrals/${f.uid}`))?.status).toBe('expired');
  }, 60_000);
});
