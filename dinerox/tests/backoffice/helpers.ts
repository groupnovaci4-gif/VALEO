/// <reference types="node" />
/**
 * Outils des tests back-office sur émulateurs. Les fonctions `bo…` sont appelées
 * par leur export RÉEL (index.ts des Functions, `.run(requête)`) : le câblage
 * nom → fonction → permission est donc testé, pas seulement la logique.
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const req = createRequire(new URL('../../firebase/functions/package.json', import.meta.url));
// Même instance que celle des Functions (résolue depuis firebase/functions/node_modules).
export const admin = {
  auth: req('firebase-admin/auth') as typeof import('../../firebase/functions/node_modules/firebase-admin/lib/auth/index'),
  firestore: req('firebase-admin/firestore') as typeof import('../../firebase/functions/node_modules/firebase-admin/lib/firestore/index'),
};

type Fns = typeof import('../../firebase/functions/src/index');
let fnsPromise: Promise<Fns> | null = null;
/** Charge les Functions (initializeApp lit FIREBASE_CONFIG posé par emulators:exec). */
export const fns = () => (fnsPromise ??= import('../../firebase/functions/src/index'));

export const db = () => admin.firestore.getFirestore();
export const auth = () => admin.auth.getAuth();

export interface Caller {
  uid: string;
  email: string;
  sid?: string;
}

type Runnable = { run: (r: unknown) => Promise<unknown> };

/** Appelle une fonction exportée comme le ferait le portail connecté. */
export async function call<T = Record<string, unknown>>(name: keyof Fns, who: Caller | null, data: unknown = {}): Promise<T> {
  const f = (await fns())[name] as unknown as Runnable;
  const request = { data, auth: who ? { uid: who.uid, token: { email: who.email, ...(who.sid ? { boSid: who.sid } : {}) } } : undefined, rawRequest: {} };
  return (await f.run(request)) as T;
}

/** Résultat d'un appel : 'ok' ou le code d'erreur renvoyé au portail. */
export async function outcome(name: keyof Fns, who: Caller | null, data: unknown = {}): Promise<{ status: string; message: string }> {
  try {
    await call(name, who, data);
    return { status: 'ok', message: '' };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { status: err.code ?? 'error', message: err.message ?? '' };
  }
}

let counter = 0;
/** Collaborateur avec session de double vérification valide (comme après boLoginVerify). */
export async function staff(roleId: string, opts: { status?: 'active' | 'suspended'; session?: 'valid' | 'none' | 'expired'; name?: string } = {}): Promise<Caller> {
  counter += 1;
  const email = `staff${counter}_${randomBytes(3).toString('hex')}@dinerox-team.test`;
  const u = await auth().createUser({ email, displayName: opts.name ?? `Staff ${counter}` });
  await db().doc(`boStaff/${u.uid}`).set({ email, displayName: opts.name ?? `Staff ${counter}`, roleId, status: opts.status ?? 'active', mfa: { enrolled: true, secretEnc: null, recoveryHashes: [], lastStep: null }, createdAt: Date.now(), createdBy: 'test', lastLoginAt: null });
  const sid = randomBytes(12).toString('hex');
  if (opts.session !== 'none') await db().doc(`boSessions/${u.uid}`).set({ sid, createdAt: Date.now(), expiresAt: opts.session === 'expired' ? Date.now() - 1000 : Date.now() + 3600_000 });
  return { uid: u.uid, email, sid };
}

/** Utilisateur de l'app (Auth + profil + espace personnel). */
export async function appUser(opts: { password?: string; firstName?: string } = {}): Promise<{ uid: string; email: string }> {
  counter += 1;
  const email = `user${counter}_${randomBytes(3).toString('hex')}@exemple.ci`;
  const u = await auth().createUser({ email, ...(opts.password ? { password: opts.password } : {}) });
  const now = Date.now();
  await db().doc(`users/${u.uid}`).set({ uid: u.uid, firstName: opts.firstName ?? 'Aïcha', lastName: 'Koné', email, country: 'CI', currency: 'XOF', language: 'fr', timezone: 'Africa/Abidjan', preferences: {}, subscription: { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: now }, onboarding: { completed: true }, createdAt: now, updatedAt: now });
  await db().doc(`spaces/${u.uid}`).set({ id: u.uid, kind: 'personal', name: 'Aïcha', ownerId: u.uid, members: { [u.uid]: 'admin' }, memberIds: [u.uid], memberNames: { [u.uid]: 'Aïcha' }, currency: 'XOF', createdAt: now, updatedAt: now });
  return { uid: u.uid, email };
}

/** Lignes du journal, de la plus ancienne à la plus récente. */
export async function auditLines(filter: (e: Record<string, unknown>) => boolean = () => true) {
  const s = await db().collection('boAudit').orderBy('seq').get();
  return s.docs.map((d) => d.data()).filter(filter);
}

export async function waitFor(cond: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor: délai dépassé');
}
