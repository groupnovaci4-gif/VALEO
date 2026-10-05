/// <reference types="node" />
/**
 * Règles Firestore : isolation entre utilisateurs, rôles familiaux,
 * validation des écritures, arbitrage des conflits. Exécuté sur l'émulateur.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc, addDoc, collection, type Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;

const profile = (uid: string, plan = 'free') => ({
  uid,
  firstName: 'Awa',
  lastName: '',
  email: `${uid}@ex.com`,
  country: 'CI',
  currency: 'XOF',
  language: 'fr',
  timezone: 'Africa/Abidjan',
  preferences: {},
  subscription: { plan, status: 'active', provider: 'none', updatedAt: 1 },
  onboarding: { completed: false },
  createdAt: 1,
  updatedAt: 1,
});

const personal = (uid: string) => ({ id: uid, kind: 'personal', name: 'Awa', ownerId: uid, members: { [uid]: 'admin' }, memberIds: [uid], memberNames: { [uid]: 'Awa' }, currency: 'XOF', createdAt: 1, updatedAt: 1 });

const tx = (id: string, createdBy: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'expense',
  amount: 5000,
  currency: 'XOF',
  date: '2026-10-04',
  accountId: 'acc1',
  createdAt: 1,
  updatedAt: 10,
  createdBy,
  syncedAt: serverTimestamp(),
  ...over,
});

const db = (uid: string | null, claims: Record<string, unknown> = {}): Firestore =>
  (uid ? env.authenticatedContext(uid, { email: `${uid}@ex.com`, email_verified: true, ...claims }) : env.unauthenticatedContext()).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dinerox',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

/** Prépare une famille : admin A, conjoint P, enfant C. */
async function seedFamily() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(fs, 'spaces/fam_1'), {
      id: 'fam_1', kind: 'family', name: 'Famille Koffi', ownerId: 'A',
      members: { A: 'admin', P: 'partner', C: 'child' }, memberIds: ['A', 'P', 'C'], memberNames: {}, currency: 'XOF', createdAt: 1, updatedAt: 1,
    });
    await setDoc(doc(fs, 'spaces/fam_1/debts/d1'), { id: 'd1', direction: 'i_owe', principal: 1000, counterparty: 'Banque', createdAt: 1, updatedAt: 1, createdBy: 'A' });
    await setDoc(doc(fs, 'spaces/fam_1/transactions/tA'), { ...tx('tA', 'A'), syncedAt: new Date() });
  });
}

describe('profil utilisateur', () => {
  it('création de son propre profil, formule gratuite uniquement', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'users/u1'), profile('u1')));
    await assertFails(setDoc(doc(db('u2'), 'users/u2'), profile('u2', 'family')));
  });
  it("impossible de s'attribuer un abonnement ensuite", async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    await assertFails(updateDoc(doc(db('u1'), 'users/u1'), { 'subscription.plan': 'family' }));
    await assertSucceeds(updateDoc(doc(db('u1'), 'users/u1'), { firstName: 'Awa K.' }));
  });
  it('profil financier : enregistrable par son propriétaire (et lui seul), sans toucher à l’abonnement', async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    const financial = { familyStatus: 'couple_children', children: 2, dependents: 1, incomeNature: 'irregular', incomeSources: ['inc_business'], monthlyIncome: null, paymentMethods: ['acc.cash', 'acc.wave'], noBankAccount: true, fixedCharges: { sub_housing_rent: 80000, sub_informal_tontine: 0 }, financialGoals: ['buy_land'], updatedAt: 1 };
    await assertSucceeds(setDoc(doc(db('u1'), 'users/u1'), { country: 'SN', currency: 'XOF', financial, onboarding: { completed: true }, updatedAt: 2 }, { merge: true }));
    await assertFails(setDoc(doc(db('u2'), 'users/u1'), { financial }, { merge: true }));
    await assertFails(setDoc(doc(db('u1'), 'users/u1'), { financial, subscription: { plan: 'family', status: 'active', provider: 'none' } }, { merge: true }));
  });
  it("impossible de lire le profil d'un autre", async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    await assertFails(getDoc(doc(db('u2'), 'users/u1')));
    await assertFails(getDoc(doc(db(null), 'users/u1')));
  });
});

describe('espaces et isolation', () => {
  it('première connexion : on peut vérifier que son espace personnel n’existe pas encore', async () => {
    await assertSucceeds(getDoc(doc(db('u1'), 'spaces/u1')));
    await assertFails(getDoc(doc(db('u1'), 'spaces/u2')));
  });
  it('espace personnel : id = uid, seul membre', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1'), personal('u1')));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u2'), { ...personal('u1'), id: 'u2' }));
  });
  it("ATTAQUE : occuper le chemin de l'espace personnel d'un autre via une « famille »", async () => {
    await assertFails(setDoc(doc(db('attacker'), 'spaces/victim'), { ...personal('attacker'), id: 'victim', kind: 'family' }));
  });
  it('impossible de créer un espace avec des membres supplémentaires', async () => {
    await assertFails(setDoc(doc(db('u1'), 'spaces/fam_x'), { ...personal('u1'), id: 'fam_x', kind: 'family', members: { u1: 'admin', u2: 'admin' }, memberIds: ['u1', 'u2'] }));
  });
  it('un admin ne peut pas ajouter de membre directement (Cloud Function obligatoire)', async () => {
    await seedFamily();
    await assertFails(updateDoc(doc(db('A'), 'spaces/fam_1'), { 'members.X': 'admin', memberIds: ['A', 'P', 'C', 'X'] }));
    await assertSucceeds(updateDoc(doc(db('A'), 'spaces/fam_1'), { name: 'Famille K.', updatedAt: 2 }));
    await assertFails(updateDoc(doc(db('P'), 'spaces/fam_1'), { name: 'Pirate', updatedAt: 3 }));
  });
  it("un inconnu ne lit ni n'écrit les données d'un autre utilisateur", async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1')));
    await assertFails(getDoc(doc(db('u2'), 'spaces/u1/transactions/t1')));
    await assertFails(setDoc(doc(db('u2'), 'spaces/u1/transactions/t2'), tx('t2', 'u2')));
    await assertFails(getDoc(doc(db('u2'), 'spaces/u1')));
  });
  it('sous-catégorie et opération avec sous-catégorie acceptées dans son espace', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    const base = { createdAt: 1, updatedAt: 1, createdBy: 'u1', syncedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/categories/sub_food_maquis'), { ...base, id: 'sub_food_maquis', kind: 'expense', name: 'Maquis', icon: 'ellipse', color: '#94A3B8', order: 0, parentId: 'cat_food', fixed: false }));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t9'), tx('t9', 'u1', { categoryId: 'cat_food', subcategoryId: 'sub_food_maquis' })));
  });
  it('collection inconnue refusée', async () => {
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/secrets/s1'), { id: 's1', createdAt: 1, updatedAt: 1, createdBy: 'u1', syncedAt: serverTimestamp() }));
  });
});

describe('validation des écritures', () => {
  it('montant nul, négatif, décimal ou texte refusé', async () => {
    for (const amount of [0, -5000, 12.5, '5000']) {
      await assertFails(setDoc(doc(db('u1'), `spaces/u1/transactions/t${String(amount)}`), tx(`t${String(amount)}`, 'u1', { amount })));
    }
  });
  it('transfert vers le même compte refusé ; type inconnu refusé ; date invalide refusée', async () => {
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { type: 'transfer', toAccountId: 'acc1' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t2'), tx('t2', 'u1', { type: 'transfer', toAccountId: 'acc2' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t3'), tx('t3', 'u1', { type: 'gift' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t4'), tx('t4', 'u1', { date: '04/10/2026' })));
  });
  it("l'horodatage serveur est obligatoire et l'identifiant doit correspondre", async () => {
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), { ...tx('t1', 'u1'), syncedAt: new Date(0) }));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('autre', 'u1')));
  });
  it('suppression physique interdite (suppression logique uniquement)', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1'));
    await assertFails(deleteDoc(doc(db('u1'), 'spaces/u1/transactions/t1')));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { deleted: true, updatedAt: 11 })));
  });
});

describe('conflits : le plus récent gagne', () => {
  it('une écriture plus ancienne que la version stockée est refusée', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { updatedAt: 100 }));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { updatedAt: 50, amount: 1 })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { updatedAt: 150, amount: 2 })));
  });
  it("l'auteur d'origine est immuable", async () => {
    await setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1'));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'quelquun', { updatedAt: 20 })));
  });
});

describe('rôles familiaux', () => {
  beforeEach(seedFamily);
  it('conjoint : gère les objectifs et lit les dettes', async () => {
    await assertSucceeds(
      setDoc(doc(db('P'), 'spaces/fam_1/goals/g1'), { id: 'g1', name: 'Maison', targetAmount: 25_000_000, initialAmount: 0, status: 'active', priority: 'high', createdAt: 1, updatedAt: 1, createdBy: 'P', syncedAt: serverTimestamp() }),
    );
    await assertSucceeds(getDoc(doc(db('P'), 'spaces/fam_1/debts/d1')));
  });
  it('enfant : ni dettes, ni création d’objectif, ni revenu', async () => {
    await assertFails(getDoc(doc(db('C'), 'spaces/fam_1/debts/d1')));
    await assertFails(
      setDoc(doc(db('C'), 'spaces/fam_1/goals/g2'), { id: 'g2', name: 'X', targetAmount: 1, initialAmount: 0, status: 'active', priority: 'low', createdAt: 1, updatedAt: 1, createdBy: 'C', syncedAt: serverTimestamp() }),
    );
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/tc'), tx('tc', 'C', { type: 'income' })));
  });
  it('enfant : saisit SES dépenses et ne modifie que les siennes', async () => {
    await assertSucceeds(setDoc(doc(db('C'), 'spaces/fam_1/transactions/tc'), tx('tc', 'C')));
    await assertSucceeds(setDoc(doc(db('C'), 'spaces/fam_1/transactions/tc'), tx('tc', 'C', { amount: 6000, updatedAt: 20 })));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/tA'), tx('tA', 'A', { amount: 1, updatedAt: 99 })));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/tx2'), tx('tx2', 'A')));
  });
  it('non-membre : aucun accès à la famille', async () => {
    await assertFails(getDoc(doc(db('Z'), 'spaces/fam_1')));
    await assertFails(getDoc(doc(db('Z'), 'spaces/fam_1/transactions/tA')));
  });
});

describe('autres collections', () => {
  it('invitations : écriture client interdite, lecture par le destinataire', async () => {
    await assertFails(setDoc(doc(db('A'), 'invites/i1'), { email: 'x@ex.com' }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'invites/i1'), { id: 'i1', spaceId: 'fam_1', email: 'b@ex.com', status: 'pending' });
    });
    await assertSucceeds(getDoc(doc(db('b'), 'invites/i1')));
    await assertFails(getDoc(doc(db('c'), 'invites/i1')));
  });
  it('statistiques : écriture anonyme limitée, aucune lecture', async () => {
    await assertSucceeds(addDoc(collection(db('u1'), 'analyticsEvents'), { event: 'first_goal', props: { kind: 'purchase' }, env: 'production', day: '2026-10-04', at: serverTimestamp() }));
    await assertFails(addDoc(collection(db('u1'), 'analyticsEvents'), { event: 'x', props: {}, env: 'p', day: 'd', at: serverTimestamp(), uid: 'u1' }));
    await assertFails(getDoc(doc(db('u1'), 'analyticsEvents/any')));
  });
  it('configuration : lecture pour tous, écriture réservée aux administrateurs plateforme', async () => {
    await assertFails(setDoc(doc(db('u1'), 'config/goalCategories/items/health'), { icon: '🩺' }));
    await assertSucceeds(setDoc(doc(db('boss', { admin: true }), 'config/goalCategories/items/health'), { icon: '🩺' }));
    await assertSucceeds(getDoc(doc(db('u1'), 'config/goalCategories/items/health')));
  });
  it('abonnements et quotas : jamais écrits par le client', async () => {
    await assertFails(setDoc(doc(db('u1'), 'subscriptions/u1'), { plan: 'family' }));
    await assertFails(setDoc(doc(db('u1'), 'usage/u1'), { ai: 0 }));
  });
});
