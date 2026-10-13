/*
 * Données FICTIVES pour la répétition du déménagement, sur le PROJET DE TEST seulement
 * (refuse dinerox-app). Forme identique à celle de l'app : 11 profils, 11 espaces personnels,
 * 1 espace familial, ~70 catégories par espace, opérations, enveloppes, objectifs…
 * Crée aussi le compte de la sonde (mot de passe aléatoire écrit HORS du dépôt, dans
 * ~/dinerox-mesures/sonde.json) et l'ajoute à l'espace familial.
 *
 *   GOOGLE_CLOUD_PROJECT=dinerox-demenagement-test node scripts/migration/seed-test.mjs
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
if (!PROJECT || PROJECT === 'dinerox-app' || !PROJECT.includes('test')) throw new Error('Réservé au projet de TEST (GOOGLE_CLOUD_PROJECT=dinerox-demenagement-test).');
const req = createRequire(new URL('../../firebase/functions/package.json', import.meta.url));
const { initializeApp } = req('firebase-admin/app');
const { getAuth } = req('firebase-admin/auth');
const { getFirestore, Timestamp } = req('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

// Toute erreur : son MESSAGE seulement (jamais l'objet complet, qui contiendrait le jeton
// d'accès Google et le mot de passe de la sonde).
async function main() {
  const now = Date.now();
  const base = (by, ms) => ({ createdAt: ms, updatedAt: ms, createdBy: by, syncedAt: Timestamp.fromMillis(ms) });
  let n = 0;
  let batch = db.batch();
  const put = async (path, data) => {
    batch.set(db.doc(path), data);
    n++;
    if (n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  };

  const sondeEmail = 'sonde@demenagement-test.invalid';
  const sondePassword = randomBytes(18).toString('base64url');
  let sonde = await auth.getUserByEmail(sondeEmail).catch(() => null);
  if (!sonde) sonde = await auth.createUser({ email: sondeEmail, password: sondePassword });
  else await auth.updateUser(sonde.uid, { password: sondePassword });

  const uids = [];
  for (let i = 0; i < 11; i++) {
    const uid = i === 0 ? sonde.uid : `fictif_${i}`;
    uids.push(uid);
    const t = now - (20 - i) * 86400000;
    await put(`users/${uid}`, { uid, firstName: `Personne ${i}`, lastName: 'Fictive', email: `personne${i}@demenagement-test.invalid`, country: 'CI', currency: 'XOF', language: 'fr', preferences: {}, subscription: { plan: 'free', status: 'active', provider: 'none', expiresAt: null, updatedAt: t }, onboarding: { completed: true }, createdAt: t, updatedAt: t });
    await put(`spaces/${uid}`, { id: uid, kind: 'personal', name: `Personne ${i}`, ownerId: uid, members: { [uid]: 'admin' }, memberIds: [uid], memberNames: { [uid]: `Personne ${i}` }, currency: 'XOF', createdAt: t, updatedAt: t });
    for (let c = 0; c < 70; c++) await put(`spaces/${uid}/categories/cat_${c}`, { id: `cat_${c}`, kind: c < 60 ? 'expense' : 'income', name: `Catégorie ${c}`, ...base(uid, t) });
    for (let e = 0; e < 4; e++) await put(`spaces/${uid}/envelopes/env_${e}`, { id: `env_${e}`, name: `Enveloppe ${e}`, monthlyBudget: 10000 * (e + 1), ...base(uid, t) });
    await put(`spaces/${uid}/accounts/acc`, { id: 'acc', name: 'Espèces', type: 'cash', provider: 'none', openingBalance: 0, currency: 'XOF', active: true, isSavings: false, ...base(uid, t) });
    for (let k = 0; k < 4; k++) await put(`spaces/${uid}/transactions/tx_${k}`, { id: `tx_${k}`, type: 'expense', amount: 1000 * (k + 1), currency: 'XOF', date: new Date(t).toISOString().slice(0, 10), accountId: 'acc', categoryId: 'cat_1', ...base(uid, t) });
    await put(`spaces/${uid}/goals/goal_1`, { id: 'goal_1', name: 'Objectif', targetAmount: 100000, initialAmount: 0, status: 'active', priority: 'normal', currency: 'XOF', ...base(uid, t) });
  }
  const fam = 'fam_test';
  await put(`spaces/${fam}`, { id: fam, kind: 'family', name: 'Famille test', ownerId: uids[1], members: { [uids[1]]: 'admin', [sonde.uid]: 'partner' }, memberIds: [uids[1], sonde.uid], memberNames: {}, currency: 'XOF', createdAt: now, updatedAt: now });
  await put(`spaces/${fam}/accounts/acc`, { id: 'acc', name: 'Caisse', type: 'cash', provider: 'none', openingBalance: 0, currency: 'XOF', active: true, isSavings: false, ...base(uids[1], now) });
  for (let k = 0; k < 5; k++) await put(`spaces/${fam}/transactions/ftx_${k}`, { id: `ftx_${k}`, type: 'expense', amount: 2000, currency: 'XOF', date: new Date().toISOString().slice(0, 10), accountId: 'acc', ...base(uids[1], now) });
  await batch.commit();

  const dir = join(homedir(), 'dinerox-mesures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sonde.json'), JSON.stringify({ project: PROJECT, email: sondeEmail, password: sondePassword, uid: sonde.uid, familyId: fam }, null, 2), { mode: 0o600 });
  console.log(`Projet de test rempli : ${n} documents fictifs. Compte de la sonde prêt (identifiants dans ~/dinerox-mesures/sonde.json, hors du dépôt).`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`Échec : ${e?.code ? `${e.code} — ` : ''}${String(e?.message ?? e).slice(0, 300)}`);
    process.exit(1);
  },
);
