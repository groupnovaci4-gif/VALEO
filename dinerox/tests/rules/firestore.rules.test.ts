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
