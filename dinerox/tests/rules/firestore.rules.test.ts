/// <reference types="node" />
/**
 * Règles Firestore : isolation entre utilisateurs, rôles familiaux,
 * validation des écritures, arbitrage des conflits. Exécuté sur l'émulateur.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, deleteField, serverTimestamp, setDoc, updateDoc, deleteDoc, addDoc, collection, disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore';

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
  it('coach : historique personnel, propriétaire uniquement, aucun montant', async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    const ev = { kind: 'envelope_warning', severity: 'warning', period: '2026-10', spaceId: 'u1', deliveredAt: 1 };
    await assertSucceeds(setDoc(doc(db('u1'), 'users/u1/coachEvents/env_food_2026-10_warning'), ev));
    await assertSucceeds(getDoc(doc(db('u1'), 'users/u1/coachEvents/env_food_2026-10_warning')));
    await assertFails(getDoc(doc(db('u2'), 'users/u1/coachEvents/env_food_2026-10_warning')));
    await assertFails(setDoc(doc(db('u2'), 'users/u1/coachEvents/x'), ev));
    await assertFails(deleteDoc(doc(db('u2'), 'users/u1/coachEvents/env_food_2026-10_warning')));
    // Jamais de montant ni de texte libre dans l'historique.
    await assertFails(setDoc(doc(db('u1'), 'users/u1/coachEvents/y'), { ...ev, amount: 20000 }));
    await assertFails(setDoc(doc(db('u1'), 'users/u1/coachEvents/z'), { ...ev, severity: 'urgent' }));
    await assertSucceeds(deleteDoc(doc(db('u1'), 'users/u1/coachEvents/env_food_2026-10_warning')));
  });
  it('récompenses : personnelles, création seule, identifiant cohérent', async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    const r = { rewardId: 'budget_master', period: '2026-09', earnedAt: 1, spaceId: 'u1' };
    await assertSucceeds(setDoc(doc(db('u1'), 'users/u1/rewards/budget_master_2026-09'), r));
    await assertSucceeds(getDoc(doc(db('u1'), 'users/u1/rewards/budget_master_2026-09')));
    // Jamais modifiée (une récompense obtenue ne se « rejoue » pas), jamais lue par un autre.
    await assertFails(setDoc(doc(db('u1'), 'users/u1/rewards/budget_master_2026-09'), { ...r, earnedAt: 2 }));
    await assertFails(getDoc(doc(db('u2'), 'users/u1/rewards/budget_master_2026-09')));
    await assertFails(setDoc(doc(db('u2'), 'users/u1/rewards/budget_master_2026-10'), { ...r, period: '2026-10' }));
    // Identifiant incohérent ou champ en trop : refusé.
    await assertFails(setDoc(doc(db('u1'), 'users/u1/rewards/autre_2026-09'), r));
    await assertFails(setDoc(doc(db('u1'), 'users/u1/rewards/excellent_2026-09'), { ...r, rewardId: 'excellent', score: 99 }));
  });
  it("abonnement : jamais modifiable par le client (non-régression)", async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    await assertFails(updateDoc(doc(db('u1'), 'users/u1'), { 'subscription.plan': 'family' }));
    await assertFails(updateDoc(doc(db('u1'), 'users/u1'), { subscription: { plan: 'plus', status: 'active', provider: 'none' } }));
  });
  it("jetons push : personne d'autre ne lit, n'écrit ni n'efface ceux d'un utilisateur", async () => {
    await setDoc(doc(db('u1'), 'users/u1'), profile('u1'));
    const dev = { token: 'ExponentPushToken[abc]', platform: 'android', updatedAt: 1 };
    await assertSucceeds(setDoc(doc(db('u1'), 'users/u1/devices/d1'), dev));
    await assertFails(getDoc(doc(db('u2'), 'users/u1/devices/d1')));
    await assertFails(setDoc(doc(db('u2'), 'users/u1/devices/d2'), dev));
    await assertFails(deleteDoc(doc(db('u2'), 'users/u1/devices/d1')));
    // Déconnexion : le propriétaire retire son propre jeton.
    await assertSucceeds(deleteDoc(doc(db('u1'), 'users/u1/devices/d1')));
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
  it('ajustement de solde (1.8) : sens obligatoire (in / out)', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/a1'), tx('a1', 'u1', { type: 'adjustment', direction: 'in' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/a2'), tx('a2', 'u1', { type: 'adjustment', direction: 'out' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/a3'), tx('a3', 'u1', { type: 'adjustment' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/a4'), tx('a4', 'u1', { type: 'adjustment', direction: 'up' })));
    // Isolation : jamais dans l'espace d'un autre.
    await assertFails(setDoc(doc(db('u2'), 'spaces/u1/transactions/a5'), tx('a5', 'u2', { type: 'adjustment', direction: 'in' })));
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
  it('IA : compteurs de jetons du jour (aiUsage/{jour}) — ni lus ni écrits par un client, même administrateur', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'aiUsage/2026-10-19'), { day: '2026-10-19', calls: 3, tokensIn: 1200, tokensOut: 90 });
    });
    for (const who of [db('u1'), db('boss', { admin: true }), db(null)]) {
      await assertFails(getDoc(doc(who, 'aiUsage/2026-10-19')));
      await assertFails(getDocs(collection(who, 'aiUsage')));
      await assertFails(setDoc(doc(who, 'aiUsage/2026-10-19'), { calls: 0 }));
      await assertFails(setDoc(doc(who, 'aiUsage/2026-10-20'), { day: '2026-10-20', calls: 1 }));
      await assertFails(updateDoc(doc(who, 'aiUsage/2026-10-19'), { tokensIn: 0 }));
      await assertFails(deleteDoc(doc(who, 'aiUsage/2026-10-19')));
    }
  });
  it('abonnements et quotas : jamais écrits par le client', async () => {
    await assertFails(setDoc(doc(db('u1'), 'subscriptions/u1'), { plan: 'family' }));
    await assertFails(setDoc(doc(db('u1'), 'usage/u1'), { ai: 0 }));
  });
});

describe('réserve famille et cérémonies (1.6)', () => {
  const goalDoc = (id: string, by: string, over: Record<string, unknown> = {}) => ({ id, name: 'Réserve famille et cérémonies', targetAmount: 200_000, initialAmount: 0, status: 'active', priority: 'normal', createdAt: 1, updatedAt: 1, createdBy: by, syncedAt: serverTimestamp(), ...over });
  const contrib = (id: string, by: string, over: Record<string, unknown> = {}) => ({ id, goalId: 'res', amount: 10_000, date: '2026-10-04', createdAt: 1, updatedAt: 1, createdBy: by, syncedAt: serverTimestamp(), ...over });
  async function seedReserve() {
    await seedFamily();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, 'spaces/fam_1/goals/res'), { ...goalDoc('res', 'A', { kind: 'reserve' }), syncedAt: new Date() });
      await setDoc(doc(fs, 'spaces/fam_1/goals/moto'), { ...goalDoc('moto', 'A', { name: 'Moto' }), syncedAt: new Date() });
    });
  }

  it('objectif : kind absent, goal ou reserve accepté ; autre valeur refusée', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goals/g0'), goalDoc('g0', 'u1')));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goals/g1'), goalDoc('g1', 'u1', { kind: 'goal' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goals/g2'), goalDoc('g2', 'u1', { kind: 'reserve' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/goals/g3'), goalDoc('g3', 'u1', { kind: 'tontine' })));
  });

  it('utilisation liée à une dépense : enregistrée par le propriétaire, identifiant borné', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goalContributions/c1'), contrib('c1', 'u1', { amount: -5_000, linkedTransactionId: 'tx_1' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/goalContributions/c2'), contrib('c2', 'u1', { amount: -5_000, linkedTransactionId: 'x'.repeat(200) })));
    await assertFails(setDoc(doc(db('u2'), 'spaces/u1/goalContributions/c3'), contrib('c3', 'u2', { amount: -5_000, linkedTransactionId: 'tx_1' })));
  });

  it('espace familial : admin et conjoint apportent et utilisent ; l’enfant apporte mais n’utilise jamais', async () => {
    await seedReserve();
    await assertSucceeds(setDoc(doc(db('A'), 'spaces/fam_1/goalContributions/a1'), contrib('a1', 'A', { amount: -5_000, linkedTransactionId: 'tA' })));
    await assertSucceeds(setDoc(doc(db('P'), 'spaces/fam_1/goalContributions/p1'), contrib('p1', 'P')));
    await assertSucceeds(setDoc(doc(db('P'), 'spaces/fam_1/goalContributions/p2'), contrib('p2', 'P', { amount: -3_000 })));
    // Enfant : apport accepté, utilisation (ou retrait) de la réserve refusée.
    await assertSucceeds(setDoc(doc(db('C'), 'spaces/fam_1/goalContributions/c1'), contrib('c1', 'C', { amount: 2_000 })));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/goalContributions/c2'), contrib('c2', 'C', { amount: -2_000, linkedTransactionId: 'tC' })));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/goalContributions/c3'), contrib('c3', 'C', { amount: -2_000 })));
    // Non-régression : un enfant peut toujours retirer d'un objectif classique.
    await assertSucceeds(setDoc(doc(db('C'), 'spaces/fam_1/goalContributions/c4'), contrib('c4', 'C', { goalId: 'moto', amount: -1_000 })));
    // Chaque mouvement porte son auteur : impossible d'écrire au nom d'un autre membre.
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/goalContributions/c5'), contrib('c5', 'A', { amount: 2_000 })));
  });

  it('catalogue des moments forts : lecture pour tout utilisateur connecté, écriture administrateur', async () => {
    const item = { eventId: 'tabaski', country: 'CI', date: '2027-05-16' };
    await assertFails(setDoc(doc(db('u1'), 'config/seasons/items/tabaski_2027_CI'), item));
    await assertSucceeds(setDoc(doc(db('boss', { admin: true }), 'config/seasons/items/tabaski_2027_CI'), item));
    await assertSucceeds(getDoc(doc(db('u1'), 'config/seasons/items/tabaski_2027_CI')));
    await assertFails(getDoc(doc(db(null), 'config/seasons/items/tabaski_2027_CI')));
  });

  it('catalogue de catégories (1.8) : lecture pour tout utilisateur connecté, écriture administrateur', async () => {
    const catalog = { catalogVersion: 2, countries: ['CI'], entries: [{ id: 'cat_food', parentId: null, label: { fr: 'Alimentation', en: 'Food' } }] };
    await assertFails(setDoc(doc(db('u1'), 'config/categories/items/v2'), catalog));
    await assertSucceeds(setDoc(doc(db('boss', { admin: true }), 'config/categories/items/v2'), catalog));
    await assertSucceeds(getDoc(doc(db('u1'), 'config/categories/items/v2')));
    await assertFails(getDoc(doc(db(null), 'config/categories/items/v2')));
    // Un membre d'espace (même administrateur de son espace) ne peut pas le modifier.
    await assertFails(setDoc(doc(db('A'), 'config/categories/items/v2'), { ...catalog, catalogVersion: 3 }));
  });
});

describe('argent disponible v2 : champs facultatifs (docs/argent-disponible.md)', () => {
  const meta = (id: string, by = 'u1') => ({ id, createdAt: 1, updatedAt: 1, createdBy: by, syncedAt: serverTimestamp() });
  const acc = (id: string, over: Record<string, unknown> = {}) => ({ ...meta(id), name: 'Espèces', type: 'cash', provider: 'none', currency: 'XOF', openingBalance: 0, color: '#000', icon: 'cash', active: true, isSavings: false, order: 0, ...over });
  const goalDoc = (id: string, over: Record<string, unknown> = {}) => ({ ...meta(id), name: 'Moto', targetAmount: 500_000, initialAmount: 0, status: 'active', priority: 'normal', ...over });
  const debtDoc = (id: string, over: Record<string, unknown> = {}) => ({ ...meta(id), direction: 'i_owe', principal: 50_000, counterparty: 'Banque', ...over });
  const payDoc = (id: string, over: Record<string, unknown> = {}) => ({ ...meta(id), debtId: 'd1', amount: 10_000, date: '2026-10-04', ...over });
  beforeEach(async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
  });

  it('compte — openingDate : date ou absente ; autre format refusé', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/accounts/a1'), acc('a1', { openingBalance: 35_000, openingDate: '2026-10-01' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/accounts/a2'), acc('a2', { openingDate: null })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/accounts/a3'), acc('a3', { openingDate: '01/10/2026' })));
  });
  it('compte — openingNote : provenance en texte court', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/accounts/a1'), acc('a1', { openingNote: 'argent gardé à la maison' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/accounts/a2'), acc('a2', { openingNote: 'x'.repeat(201) })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/accounts/a3'), acc('a3', { openingNote: 12 })));
  });
  it('compte — overdraftLimit : entier ≥ 0 ; négatif ou décimal refusé', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/accounts/a1'), acc('a1', { overdraftLimit: 30_000 })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/accounts/a2'), acc('a2', { overdraftLimit: 0 })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/accounts/a3'), acc('a3', { overdraftLimit: -1 })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/accounts/a4'), acc('a4', { overdraftLimit: 10.5 })));
  });
  it('opération — reason : motif d’un ajustement, texte court', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { type: 'adjustment', direction: 'out', reason: 'écart de caisse' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t2'), tx('t2', 'u1', { type: 'adjustment', direction: 'out', reason: 'x'.repeat(201) })));
  });
  it('opération — linkedTransactionId : frais ou intérêts liés, identifiant borné', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { linkedTransactionId: 'tr_1', subcategoryId: 'sub_other_fees' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t2'), tx('t2', 'u1', { linkedTransactionId: 'x'.repeat(200) })));
  });
  it('E26b — transfert en même devise : montant reçu différent refusé ; entre devises accepté ; ancien montant égal accepté', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1/accounts/wave'), acc('wave'));
    await setDoc(doc(db('u1'), 'spaces/u1/accounts/eur'), acc('eur', { currency: 'EUR' }));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { type: 'transfer', toAccountId: 'wave', amount: 50_000, toAmount: 49_000 })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t2'), tx('t2', 'u1', { type: 'transfer', toAccountId: 'wave', amount: 50_000 })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t3'), tx('t3', 'u1', { type: 'transfer', toAccountId: 'wave', amount: 50_000, toAmount: 50_000 })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t4'), tx('t4', 'u1', { type: 'transfer', toAccountId: 'eur', amount: 655_957, toAmount: 100_000 })));
  });
  it('objectif — initialSource : « outside » ou absent ; autre valeur refusée', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goals/g1'), goalDoc('g1', { initialAmount: 80_000, initialSource: 'outside' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goals/g2'), goalDoc('g2', { initialSource: null })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/goals/g3'), goalDoc('g3', { initialSource: 'available' })));
  });
  it('objectif — initialNote : provenance en texte court', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/goals/g1'), goalDoc('g1', { initialNote: 'confié à ma mère' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/goals/g2'), goalDoc('g2', { initialNote: 'x'.repeat(201) })));
  });
  it('dette — closedReason : remise ou abandon ; autre valeur refusée', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/debts/d1'), debtDoc('d1', { status: 'closed', closedReason: 'forgiven' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/debts/d2'), debtDoc('d2', { direction: 'owed_to_me', status: 'closed', closedReason: 'written_off' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/debts/d3'), debtDoc('d3', { closedReason: 'paid' })));
  });
  it('dette — closedAt : date de clôture', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/debts/d1'), debtDoc('d1', { closedAt: '2026-10-10' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/debts/d2'), debtDoc('d2', { closedAt: 1760000000000 })));
  });
  it('remboursement — offAccounts : oui / non seulement', async () => {
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/debtPayments/p1'), payDoc('p1', { offAccounts: true })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/debtPayments/p2'), payDoc('p2', { offAccounts: null })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/debtPayments/p3'), payDoc('p3', { offAccounts: 'oui' })));
  });
  it('tontine — closedAt : date de clôture confirmée ; autre format refusé', async () => {
    const ton = (id: string, over: Record<string, unknown> = {}) => ({ ...meta(id), type: 'rotating', name: 'Tontine', currency: 'XOF', amountPerShare: 10_000, sharesHeld: 1, frequency: 'monthly', startDate: '2026-01-05', status: 'finished', membersCount: 10, ...over });
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/tontines/t1'), ton('t1', { closedAt: '2026-10-20' })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/tontines/t2'), ton('t2', { closedAt: null, status: 'active' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontines/t3'), ton('t3', { closedAt: '20/10/2026' })));
  });
  it('isolation : les nouveaux champs ne s’écrivent jamais dans l’espace d’un autre', async () => {
    await assertFails(setDoc(doc(db('u2'), 'spaces/u1/accounts/a9'), acc('a9', { openingDate: '2026-10-01' })));
  });
  it('E41b — enfant : ni revenu, ni transfert, ni correction (miroir de canCreateTransaction)', async () => {
    await seedFamily();
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/c1'), tx('c1', 'C', { type: 'income' })));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/c2'), tx('c2', 'C', { type: 'transfer', toAccountId: 'acc2' })));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/c3'), tx('c3', 'C', { type: 'adjustment', direction: 'in' })));
    await assertSucceeds(setDoc(doc(db('C'), 'spaces/fam_1/transactions/c4'), tx('c4', 'C')));
  });
});

describe('tontines — carnet personnel (1.7)', () => {
  const base = (id: string, by: string) => ({ id, createdAt: 1, updatedAt: 1, createdBy: by, syncedAt: serverTimestamp() });
  const tontine = (id: string, by: string, over: Record<string, unknown> = {}) => ({ ...base(id, by), type: 'rotating', name: 'Tontine du bureau', currency: 'XOF', amountPerShare: 10_000, sharesHeld: 1, frequency: 'monthly', startDate: '2026-01-05', membersCount: 10, myTurns: [6], status: 'active', ...over });
  const entry = (id: string, by: string, over: Record<string, unknown> = {}) => ({ ...base(id, by), tontineId: 't1', kind: 'contribution', period: 1, amount: 10_000, date: '2026-01-05', transactionId: 'tx_1', status: 'done', ...over });

  it('propriétaire : tontine et entrées valides acceptées, demi-main comprise', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/tontines/t1'), tontine('t1', 'u1')));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/tontines/t2'), tontine('t2', 'u1', { type: 'collector', sharesHeld: 0.5, cycleDays: 31, collectorCommission: 1_000 })));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/tontineEntries/e1'), entry('e1', 'u1')));
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/tontineEntries/e2'), entry('e2', 'u1', { kind: 'payout', period: 6, amount: 100_000 })));
  });

  it('validation : type, fréquence, montant, statut', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontines/a'), tontine('a', 'u1', { type: 'loterie' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontines/b'), tontine('b', 'u1', { frequency: 'yearly' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontines/c'), tontine('c', 'u1', { amountPerShare: 0 })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontines/d'), tontine('d', 'u1', { sharesHeld: 0 })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontineEntries/e'), entry('e', 'u1', { kind: 'gift' })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/tontineEntries/f'), entry('f', 'u1', { period: 0 })));
  });

  it('isolation : un autre utilisateur ne lit ni n’écrit les tontines', async () => {
    await setDoc(doc(db('u1'), 'spaces/u1'), personal('u1'));
    await setDoc(doc(db('u1'), 'spaces/u1/tontines/t1'), tontine('t1', 'u1'));
    await assertFails(getDoc(doc(db('u2'), 'spaces/u1/tontines/t1')));
    await assertFails(setDoc(doc(db('u2'), 'spaces/u1/tontines/t9'), tontine('t9', 'u2')));
    await assertFails(setDoc(doc(db('u2'), 'spaces/u1/tontineEntries/e9'), entry('e9', 'u2')));
  });

  it('espace familial : un enfant ne voit ni ne crée de tontine', async () => {
    await seedFamily();
    await assertSucceeds(setDoc(doc(db('A'), 'spaces/fam_1/tontines/t1'), tontine('t1', 'A')));
    await assertFails(getDoc(doc(db('C'), 'spaces/fam_1/tontines/t1')));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/tontines/t2'), tontine('t2', 'C')));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/tontineEntries/e1'), entry('e1', 'C')));
    await assertSucceeds(getDoc(doc(db('P'), 'spaces/fam_1/tontines/t1')));
  });
});

describe('back-office : aucune donnée d’administration accessible à un client', () => {
  const cols = ['boStaff', 'boRoles', 'boSessions', 'boAccess', 'boAudit', 'boAuditHead', 'boStats', 'boLoginGuard', 'boInvites', 'accountStatus'];
  it('lecture et écriture refusées, même pour soi-même et même avec le droit admin de l’app', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      for (const c of cols) await setDoc(doc(fs, `${c}/u1`), { x: 1 });
    });
    for (const c of cols) {
      for (const who of [db('u1'), db('u1', { admin: true }), db(null)]) {
        await assertFails(getDoc(doc(who, `${c}/u1`)));
        await assertFails(setDoc(doc(who, `${c}/u1`), { x: 2 }));
        await assertFails(deleteDoc(doc(who, `${c}/u1`)));
      }
    }
  });
});

describe('connexion par téléphone : aucune donnée accessible à un client', () => {
  const cols = ['phoneAuth', 'phoneSecrets', 'phoneGuard', 'phoneDevices', 'phoneIndex', 'phoneOutbox'];
  it('lecture et écriture refusées, même pour soi-même, même administrateur, même sans compte', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      for (const c of cols) await setDoc(doc(fs, `${c}/u1`), { x: 1 });
    });
    for (const c of cols) {
      for (const who of [db('u1'), db('u1', { admin: true }), db(null)]) {
        await assertFails(getDoc(doc(who, `${c}/u1`)));
        await assertFails(setDoc(doc(who, `${c}/u1`), { x: 2 }));
        await assertFails(deleteDoc(doc(who, `${c}/u1`)));
      }
    }
  });
});

describe('interrupteur « connexion par numéro » (audit 23/10, C5)', () => {
  it('lisible SANS compte (écran de bienvenue) ; écrit par un administrateur seulement ; les autres réglages restent fermés sans compte', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, 'config/app/items/phoneAuth'), { enabled: false });
      await setDoc(doc(fs, 'config/app/items/links'), { whatsappChannelUrl: null });
    });
    await assertSucceeds(getDoc(doc(db(null), 'config/app/items/phoneAuth')));
    await assertSucceeds(getDoc(doc(db('u1'), 'config/app/items/phoneAuth')));
    await assertFails(setDoc(doc(db(null), 'config/app/items/phoneAuth'), { enabled: true }));
    await assertFails(setDoc(doc(db('u1'), 'config/app/items/phoneAuth'), { enabled: true }));
    await assertSucceeds(setDoc(doc(db('boss', { admin: true }), 'config/app/items/phoneAuth'), { enabled: true }));
    await assertFails(getDoc(doc(db(null), 'config/app/items/links')));
  });
});

describe('opération supprimée par le back-office (adminDeleted)', () => {
  async function seed() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, 'spaces/u1'), personal('u1'));
      await setDoc(doc(fs, 'spaces/u1/transactions/t1'), { ...tx('t1', 'u1'), deleted: true, adminDeleted: true, updatedAt: 20, syncedAt: new Date() });
      await setDoc(doc(fs, 'spaces/u1/transactions/t2'), { ...tx('t2', 'u1'), syncedAt: new Date() });
    });
  }
  it('plus aucune modification par un téléphone, même plus récente (elle ne peut pas revenir)', async () => {
    await seed();
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { updatedAt: 99_999_999_999_999 })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t1'), tx('t1', 'u1', { updatedAt: 99_999_999_999_999, deleted: true, adminDeleted: true })));
    // Toujours lisible (le téléphone récupère la marque après le refus).
    await assertSucceeds(getDoc(doc(db('u1'), 'spaces/u1/transactions/t1')));
  });
  it('un client ne pose jamais le marqueur lui-même', async () => {
    await seed();
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t3'), tx('t3', 'u1', { adminDeleted: true })));
    await assertFails(setDoc(doc(db('u1'), 'spaces/u1/transactions/t2'), tx('t2', 'u1', { updatedAt: 30, adminDeleted: true })));
    // Les écritures normales restent permises.
    await assertSucceeds(setDoc(doc(db('u1'), 'spaces/u1/transactions/t2'), tx('t2', 'u1', { updatedAt: 30, deleted: true })));
  });
});

describe('parrainage (croissance, étape 1)', () => {
  const seedReferral = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, 'users/p1'), profile('p1'));
      await setDoc(doc(fs, 'users/f1'), { ...profile('f1'), referredBy: { uid: 'p1', code: 'ABC234', firstName: 'Awa', at: 1, source: 'manual' }, referralProgress: { status: 'signed_up', day: 1, activeDays: 1, expenses: 1, incomes: 0, goals: 0, updatedAt: 1 } });
      await setDoc(doc(fs, 'referralCodes/ABC234'), { uid: 'p1', createdAt: 1 });
      await setDoc(doc(fs, 'referralDevices/h1'), { uids: ['p1'], updatedAt: 1 });
      await setDoc(doc(fs, 'users/p1/referral/state'), { code: 'ABC234', validated: 0, converted: 0, monthsEarned: 0, monthsByPeriod: {} });
      await setDoc(doc(fs, 'users/p1/referrals/f1'), { status: 'signed_up', firstName: 'Kofi', signedUpAt: 1, progress: { day: 1 } });
    });

  it('profil : impossible de créer un profil avec un parrain, une progression ou des droits offerts', async () => {
    await assertFails(setDoc(doc(db('u1'), 'users/u1'), { ...profile('u1'), referredBy: { uid: 'x', code: 'ABC234' } }));
    await assertFails(setDoc(doc(db('u1'), 'users/u1'), { ...profile('u1'), referralProgress: { status: 'validated' } }));
    await assertFails(setDoc(doc(db('u1'), 'users/u1'), { ...profile('u1'), grants: { plusUntil: 9_999_999_999_999 } }));
    await assertSucceeds(setDoc(doc(db('u1'), 'users/u1'), profile('u1')));
  });

  it('profil : le client ne peut ni changer de parrain, ni se valider, ni s’offrir Plus', async () => {
    await seedReferral();
    await assertFails(updateDoc(doc(db('f1'), 'users/f1'), { referredBy: { uid: 'autre', code: 'ZZZ999' } }));
    await assertFails(updateDoc(doc(db('f1'), 'users/f1'), { 'referralProgress.status': 'validated' }));
    await assertFails(updateDoc(doc(db('f1'), 'users/f1'), { grants: { plusUntil: 9_999_999_999_999 } }));
    await assertFails(updateDoc(doc(db('p1'), 'users/p1'), { 'grants.plusUntil': 9_999_999_999_999 }));
    // Le reste du profil reste modifiable.
    await assertSucceeds(updateDoc(doc(db('f1'), 'users/f1'), { firstName: 'Kofi' }));
  });

  it('codes et empreintes d’appareils : aucune lecture ni écriture client', async () => {
    await seedReferral();
    await assertFails(getDoc(doc(db('p1'), 'referralCodes/ABC234')));
    await assertFails(getDoc(doc(db('f1'), 'referralCodes/ABC234')));
    await assertFails(setDoc(doc(db('f1'), 'referralCodes/MYCODE'), { uid: 'f1', createdAt: 1 }));
    await assertFails(getDoc(doc(db('p1'), 'referralDevices/h1')));
    await assertFails(setDoc(doc(db('f1'), 'referralDevices/h2'), { uids: ['f1'] }));
  });

  it('statuts et compteurs : lus par le seul parrain, jamais écrits par un client', async () => {
    await seedReferral();
    await assertSucceeds(getDoc(doc(db('p1'), 'users/p1/referral/state')));
    await assertSucceeds(getDoc(doc(db('p1'), 'users/p1/referrals/f1')));
    await assertFails(getDoc(doc(db('f1'), 'users/p1/referrals/f1')));
    await assertFails(getDoc(doc(db('f1'), 'users/p1/referral/state')));
    // Ni le parrain ni le filleul n'écrivent un statut ou une récompense.
    await assertFails(updateDoc(doc(db('p1'), 'users/p1/referrals/f1'), { status: 'validated' }));
    await assertFails(setDoc(doc(db('p1'), 'users/p1/referrals/f9'), { status: 'rewarded' }));
    await assertFails(updateDoc(doc(db('p1'), 'users/p1/referral/state'), { validated: 5, monthsEarned: 1 }));
    await assertFails(setDoc(doc(db('f1'), 'users/f1/referral/state'), { validated: 99 }));
    await assertFails(deleteDoc(doc(db('p1'), 'users/p1/referrals/f1')));
  });
});

describe('audit 2026-10', () => {
  it('M3 — statistiques : événements et propriétés des versions de l’application acceptés', async () => {
    const ev = (event: string, props: Record<string, unknown>) => addDoc(collection(db('u1'), 'analyticsEvents'), { event, props, env: 'production', day: '2026-10-15', at: serverTimestamp() });
    await assertSucceeds(ev('sign_up', { method: 'email' }));
    await assertSucceeds(ev('entry_created', { method: 'voice', count: 3 }));
    await assertSucceeds(ev('share_clicked', { context: 'invite', channel: 'whatsapp' }));
    await assertSucceeds(ev('tontine_created', { mode: 'group' }));
    await assertSucceeds(ev('review_requested', { context: 'manual' }));
    await assertSucceeds(ev('premium_viewed', {}));
    await assertSucceeds(ev('first_goal', { kind: 'purchase', step: 2, intent: true }));
  });
  it('M3 — statistiques : événement inconnu, clé inconnue, valeur longue ou imbriquée refusés', async () => {
    const ev = (event: string, props: Record<string, unknown>) => addDoc(collection(db('u1'), 'analyticsEvents'), { event, props, env: 'production', day: '2026-10-15', at: serverTimestamp() });
    await assertFails(ev('inventé', {}));
    await assertFails(ev('referral_shared', { name: 'Awa Koné' }));
    await assertFails(ev('referral_shared', { kind: 'x'.repeat(41) }));
    await assertFails(ev('referral_shared', { kind: { nested: 'x' } }));
    await assertFails(ev('referral_shared', { kind: ['a'] }));
    await assertFails(addDoc(collection(db('u1'), 'analyticsEvents'), { event: 'sign_up', props: {}, env: 'x'.repeat(41), day: '2026-10-15', at: serverTimestamp() }));
    await assertFails(addDoc(collection(db('u1'), 'analyticsEvents'), { event: 'sign_up', props: {}, env: 'production', day: 'aujourd’hui', at: serverTimestamp() }));
  });
  it('M3 — une statistique refusée ne bloque pas la file hors ligne : l’opération écrite après passe', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, 'users/u1'), profile('u1'));
      await setDoc(doc(fs, 'spaces/u1'), personal('u1'));
    });
    const fs = db('u1');
    await disableNetwork(fs);
    // Hors ligne : une statistique invalide (clé inconnue) PUIS une opération, dans cet ordre.
    const refused = addDoc(collection(fs, 'analyticsEvents'), { event: 'sign_up', props: { email: 'awa@ex.com' }, env: 'production', day: '2026-10-15', at: serverTimestamp() });
    const op = setDoc(doc(fs, 'spaces/u1/transactions/tQ'), tx('tQ', 'u1'));
    await enableNetwork(fs);
    const [a, b] = await Promise.allSettled([refused, op]);
    expect(a.status).toBe('rejected');
    expect((a as PromiseRejectedResult).reason?.code).toBe('permission-denied');
    expect(b.status).toBe('fulfilled');
    await env.withSecurityRulesDisabled(async (ctx) => {
      expect((await getDoc(doc(ctx.firestore() as unknown as Firestore, 'spaces/u1/transactions/tQ'))).exists()).toBe(true);
    });
  });
  it('F1 — à la création, l’auteur est toujours la personne connectée (admin, partenaire, enfant)', async () => {
    await seedFamily();
    await assertFails(setDoc(doc(db('P'), 'spaces/fam_1/transactions/tF1'), tx('tF1', 'A')));
    await assertFails(setDoc(doc(db('A'), 'spaces/fam_1/transactions/tF2'), tx('tF2', 'P')));
    await assertFails(setDoc(doc(db('C'), 'spaces/fam_1/transactions/tF3'), tx('tF3', 'A')));
    await assertSucceeds(setDoc(doc(db('P'), 'spaces/fam_1/transactions/tF4'), tx('tF4', 'P')));
    await assertSucceeds(setDoc(doc(db('A'), 'spaces/fam_1/transactions/tF5'), tx('tF5', 'A')));
    // Une modification garde l'auteur d'origine (déjà imposé) : le partenaire peut corriger l'opération de l'admin.
    await assertSucceeds(updateDoc(doc(db('P'), 'spaces/fam_1/transactions/tA'), { note: 'corrigé', updatedAt: 20, syncedAt: serverTimestamp() }));
  });
});

describe('origine des inscriptions (croissance, étape 5)', () => {
  it('profil : le marqueur « déjà compté » ne s’écrit jamais par le client (création, modification, effacement)', async () => {
    await assertFails(setDoc(doc(db('u1'), 'users/u1'), { ...profile('u1'), originCounted: true }));
    await assertFails(setDoc(doc(db('u1'), 'users/u1'), { ...profile('u1'), originCounted: false }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, 'users/o1'), profile('o1'));
      await setDoc(doc(fs, 'users/o2'), { ...profile('o2'), originCounted: true });
    });
    // Se marquer « compté » pour ne jamais l'être, ou s'effacer le marqueur pour être compté deux fois : refusé.
    await assertFails(updateDoc(doc(db('o1'), 'users/o1'), { originCounted: true }));
    await assertFails(updateDoc(doc(db('o2'), 'users/o2'), { originCounted: false }));
    await assertFails(updateDoc(doc(db('o2'), 'users/o2'), { originCounted: deleteField() }));
    // Le reste du profil reste modifiable, marqueur posé ou non.
    await assertSucceeds(updateDoc(doc(db('o1'), 'users/o1'), { firstName: 'Awa' }));
    await assertSucceeds(updateDoc(doc(db('o2'), 'users/o2'), { firstName: 'Kofi' }));
  });

  it('compteurs : ni lecture ni écriture client (même un administrateur passe par adminOriginStats)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'originStats/2026-10-14'), { total: 1, src: { whatsapp: 1 } });
    });
    await assertFails(getDoc(doc(db('u1'), 'originStats/2026-10-14')));
    await assertFails(getDocs(collection(db('u1'), 'originStats')));
    await assertFails(setDoc(doc(db('u1'), 'originStats/2026-10-15'), { total: 1 }));
    await assertFails(updateDoc(doc(db('u1'), 'originStats/2026-10-14'), { total: 999 }));
    await assertFails(getDoc(doc(db('boss', { admin: true }), 'originStats/2026-10-14')));
    await assertFails(setDoc(doc(db('boss', { admin: true }), 'originStats/2026-10-14'), { total: 0 }));
  });
});

describe('tontine partagée (croissance, étape 3)', () => {
  const G = 'tontineGroups/g1';
  const seedGroup = (treasurerUid: string | null = null) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const fs = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(fs, G), { name: 'Tontine', organizerUid: 'org', treasurerUid, memberUids: ['org', 'awa', 'kofi'], slots: [], paid: {}, status: 'active' });
      await setDoc(doc(fs, `${G}/payments/1_1_s2`), { uid: 'awa', status: 'declared', slotId: 's2' });
      await setDoc(doc(fs, `${G}/history/h1`), { visibility: 'all', slotUid: null, action: 'draw' });
      await setDoc(doc(fs, `${G}/history/h2`), { visibility: 'managers', slotUid: 'awa', action: 'declare' });
      await setDoc(doc(fs, `${G}/requests/zoe`), { uid: 'zoe', label: 'Zoé', status: 'pending' });
      await setDoc(doc(fs, 'tontineInvites/ABC234'), { groupId: 'g1', createdBy: 'org' });
    });

  it('groupe : lu par ses membres seulement, jamais écrit par un client', async () => {
    await seedGroup();
    for (const m of ['org', 'awa', 'kofi']) await assertSucceeds(getDoc(doc(db(m), G)));
    await assertFails(getDoc(doc(db('inconnu'), G)));
    await assertFails(getDoc(doc(db(null), G)));
    await assertFails(updateDoc(doc(db('org'), G), { name: 'X' }));
    await assertFails(setDoc(doc(db('awa'), 'tontineGroups/g2'), { organizerUid: 'awa', memberUids: ['awa'] }));
    await assertFails(updateDoc(doc(db('awa'), G), { memberUids: ['org', 'awa', 'kofi', 'zoe'] }));
  });

  it('paiements : organisateur, trésorier et la personne concernée ; jamais un autre membre ; aucune écriture', async () => {
    await seedGroup('kofi');
    await assertSucceeds(getDoc(doc(db('org'), `${G}/payments/1_1_s2`)));
    await assertSucceeds(getDoc(doc(db('awa'), `${G}/payments/1_1_s2`)));
    await assertSucceeds(getDoc(doc(db('kofi'), `${G}/payments/1_1_s2`))); // trésorier
    await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore() as unknown as Firestore, G), { treasurerUid: null }));
    await assertFails(getDoc(doc(db('kofi'), `${G}/payments/1_1_s2`))); // simple membre
    await assertFails(setDoc(doc(db('awa'), `${G}/payments/1_2_s2`), { uid: 'awa', status: 'confirmed' }));
    await assertFails(updateDoc(doc(db('org'), `${G}/payments/1_1_s2`), { status: 'confirmed' }));
  });

  it('historique : public pour tous les membres, le reste pour les gestionnaires et la personne ; jamais modifié', async () => {
    await seedGroup();
    await assertSucceeds(getDoc(doc(db('kofi'), `${G}/history/h1`)));
    await assertFails(getDoc(doc(db('kofi'), `${G}/history/h2`)));
    await assertSucceeds(getDoc(doc(db('awa'), `${G}/history/h2`)));
    await assertSucceeds(getDoc(doc(db('org'), `${G}/history/h2`)));
    await assertFails(getDoc(doc(db('inconnu'), `${G}/history/h1`)));
    await assertFails(updateDoc(doc(db('org'), `${G}/history/h1`), { action: 'order' }));
    await assertFails(deleteDoc(doc(db('org'), `${G}/history/h1`)));
    await assertFails(setDoc(doc(db('awa'), `${G}/history/h9`), { visibility: 'all', action: 'confirm' }));
  });

  it('demandes : la personne et l’organisateur ; invitations : aucun accès client', async () => {
    await seedGroup();
    await assertSucceeds(getDoc(doc(db('zoe'), `${G}/requests/zoe`)));
    await assertSucceeds(getDoc(doc(db('org'), `${G}/requests/zoe`)));
    await assertFails(getDoc(doc(db('awa'), `${G}/requests/zoe`)));
    await assertFails(setDoc(doc(db('zoe'), `${G}/requests/zoe`), { uid: 'zoe', status: 'pending' }));
    await assertFails(getDoc(doc(db('org'), 'tontineInvites/ABC234')));
    await assertFails(setDoc(doc(db('org'), 'tontineInvites/ZZZ999'), { groupId: 'g1' }));
  });
});
