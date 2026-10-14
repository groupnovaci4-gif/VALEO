/// <reference types="node" />
/**
 * Outils communs aux tests de fonctions sur ÉMULATEURS : comptes réels de
 * l'émulateur d'authentification (date d'inscription et formule choisies),
 * appels des vraies Cloud Functions, lecture/écriture sans règles (comme la console).
 */
import { expect } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { refusalCode } from '../../src/core/referral';

export const PROJECT = 'demo-dinerox';
export const HOST = '127.0.0.1';
const AUTH = `http://${HOST}:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
export const D = 24 * 3600 * 1000;
const PASSWORD = 'motdepasse123';

let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
let n = 0;

export async function setup() {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: HOST, port: 8080, rules: readFileSync('firebase/firestore.rules', 'utf8') } });
}
export async function teardown() {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
}

/** Lecture / écriture sans règles : vérifier ce que le SERVEUR a écrit. */
export async function admin<T>(fn: (fs: Firestore) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore() as unknown as Firestore);
  });
  return out as T;
}
export const read = (path: string) => admin(async (fs) => (await getDoc(doc(fs, path))).data());

/** Compte réel de l'émulateur, inscrit il y a `daysAgo` jours, formule `plan` (abonnement « manual »). */
export async function account(firstName: string, opts: { daysAgo?: number; plan?: 'free' | 'plus' | 'family'; claims?: Record<string, unknown> } = {}) {
  const uid = `u${Date.now().toString(36)}${n++}`;
  const email = `${uid}@ex.com`;
  const createdAt = Date.now() - (opts.daysAgo ?? 0) * D;
  const r = await fetch(`${AUTH}/accounts:batchCreate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ users: [{ localId: uid, email, rawPassword: PASSWORD, createdAt: String(createdAt), customAttributes: JSON.stringify(opts.claims ?? {}) }] }),
  });
  expect(r.status).toBe(200);
  const plan = opts.plan ?? 'free';
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
      subscription: { plan, status: 'active', provider: plan === 'free' ? 'none' : 'manual', updatedAt: 1 },
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
  return { uid, createdAt, call, app };
}

/** Code de refus (`tg/…`, `referral/…`, `plan/…`) ou « accepted ». */
export async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'accepted';
  } catch (e) {
    const message = (e as { message?: string }).message ?? '';
    return refusalCode(message) ?? message.replace(/\s*\[\d+\]$/, '');
  }
}
