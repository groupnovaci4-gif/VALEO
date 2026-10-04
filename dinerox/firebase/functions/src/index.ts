/**
 * Cloud Functions — opérations qui ne doivent PAS être confiées au client :
 * gestion des membres d'une famille, suppression de compte, IA (clé secrète),
 * statistiques d'administration, notifications push planifiées.
 *
 * Toutes les fonctions appelables exigent une session et vérifient les droits.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { effectivePlan, FAMILY_MEMBER_LIMIT, hasAiAssistant } from './plans';
import { answerWithClaude } from './assistant';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'europe-west1', maxInstances: 20 });

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const ROLES = ['admin', 'partner', 'child'] as const;
type Role = (typeof ROLES)[number];
const INVITE_TTL_MS = 14 * 24 * 3600 * 1000;

function requireAuth(req: CallableRequest): { uid: string; email: string | null; emailVerified: boolean } {
  if (!req.auth) throw new HttpsError('unauthenticated', 'auth/required');
  const t = req.auth.token;
  return { uid: req.auth.uid, email: (t.email as string | undefined)?.toLowerCase() ?? null, emailVerified: t.email_verified === true };
}

function isRole(r: unknown): r is Role {
  return typeof r === 'string' && (ROLES as readonly string[]).includes(r);
}

interface SpaceDoc {
  id: string;
  kind: 'personal' | 'family';
  name: string;
  ownerId: string;
  members: Record<string, Role>;
  memberIds: string[];
  memberNames: Record<string, string>;
}

async function loadFamily(spaceId: unknown): Promise<{ ref: DocumentReference; space: SpaceDoc }> {
  if (typeof spaceId !== 'string' || !spaceId.startsWith('fam_')) throw new HttpsError('invalid-argument', 'space/invalid');
  const ref = db.doc(`spaces/${spaceId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'space/not-found');
  return { ref, space: snap.data() as SpaceDoc };
}

function adminsOf(space: SpaceDoc): string[] {
  return Object.entries(space.members).filter(([, r]) => r === 'admin').map(([u]) => u);
}

// ─── Famille ──────────────────────────────────────────────────────────

/** Invite un membre par e-mail (admin uniquement, dans la limite de la formule). */
export const inviteMember = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const { spaceId, email, role } = req.data ?? {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || email.length > 200) throw new HttpsError('invalid-argument', 'email/invalid');
  if (!isRole(role)) throw new HttpsError('invalid-argument', 'role/invalid');
  const { space } = await loadFamily(spaceId);
  if (space.members[uid] !== 'admin') throw new HttpsError('permission-denied', 'space/not-admin');
  const owner = await db.doc(`users/${space.ownerId}`).get();
  const limit = FAMILY_MEMBER_LIMIT[effectivePlan(owner.get('subscription'))];
  const pending = await db.collection('invites').where('spaceId', '==', spaceId).where('status', '==', 'pending').count().get();
  if (space.memberIds.length - 1 + pending.data().count >= limit) throw new HttpsError('resource-exhausted', 'plan/family-limit');
  const normalized = email.trim().toLowerCase();
  const existing = await db.collection('invites').where('spaceId', '==', spaceId).where('email', '==', normalized).where('status', '==', 'pending').limit(1).get();
  if (!existing.empty) return { inviteId: existing.docs[0].id };
  const ref = db.collection('invites').doc();
  const now = Date.now();
  await ref.set({
    id: ref.id,
    spaceId,
    spaceName: space.name,
    email: normalized,
    role,
    invitedBy: uid,
    invitedByName: space.memberNames[uid] ?? '',
    status: 'pending',
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
  });
  return { inviteId: ref.id };
});

/** Accepte ou refuse une invitation adressée à l'e-mail VÉRIFIÉ de l'appelant. */
export const respondInvite = onCall(async (req) => {
  const { uid, email, emailVerified } = requireAuth(req);
  const { inviteId, accept } = req.data ?? {};
  if (typeof inviteId !== 'string') throw new HttpsError('invalid-argument', 'invite/invalid');
  const inviteRef = db.doc(`invites/${inviteId}`);
  return db.runTransaction(async (tx) => {
    const inv = await tx.get(inviteRef);
    if (!inv.exists) throw new HttpsError('not-found', 'invite/not-found');
    const i = inv.data()!;
    if (i.email !== email) throw new HttpsError('permission-denied', 'invite/not-yours');
    // Sans e-mail vérifié, n'importe qui pourrait s'inscrire avec l'adresse invitée.
    if (accept && !emailVerified) throw new HttpsError('failed-precondition', 'auth/email-not-verified');
    if (i.status !== 'pending' || i.expiresAt < Date.now()) throw new HttpsError('failed-precondition', 'invite/expired');
    if (!accept) {
      tx.update(inviteRef, { status: 'revoked' });
      return {};
    }
    const spaceRef = db.doc(`spaces/${i.spaceId}`);
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists) throw new HttpsError('not-found', 'space/not-found');
    const profile = await tx.get(db.doc(`users/${uid}`));
    tx.update(spaceRef, {
      [`members.${uid}`]: i.role,
      memberIds: FieldValue.arrayUnion(uid),
      [`memberNames.${uid}`]: String(profile.get('firstName') ?? '').slice(0, 80),
      updatedAt: Date.now(),
    });
    tx.update(inviteRef, { status: 'accepted' });
    return { spaceId: i.spaceId };
  });
});

export const revokeInvite = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const { inviteId } = req.data ?? {};
  if (typeof inviteId !== 'string') throw new HttpsError('invalid-argument', 'invite/invalid');
  const ref = db.doc(`invites/${inviteId}`);
  const inv = await ref.get();
  if (!inv.exists) throw new HttpsError('not-found', 'invite/not-found');
  const { space } = await loadFamily(inv.get('spaceId'));
  if (space.members[uid] !== 'admin') throw new HttpsError('permission-denied', 'space/not-admin');
  await ref.update({ status: 'revoked' });
  return {};
});

/** Change le rôle d'un membre. Une famille garde toujours au moins un administrateur. */
export const setMemberRole = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const { spaceId, uid: target, role } = req.data ?? {};
  if (!isRole(role) || typeof target !== 'string') throw new HttpsError('invalid-argument', 'args/invalid');
  const { ref, space } = await loadFamily(spaceId);
  if (space.members[uid] !== 'admin') throw new HttpsError('permission-denied', 'space/not-admin');
  if (!space.members[target]) throw new HttpsError('not-found', 'member/not-found');
  const admins = adminsOf(space);
  if (role !== 'admin' && admins.length === 1 && admins[0] === target) throw new HttpsError('failed-precondition', 'space/last-admin');
  await ref.update({ [`members.${target}`]: role, updatedAt: Date.now() });
  return {};
});

/** Retire un membre (admin), ou quitte la famille (soi-même). */
export const removeMember = onCall(async (req) => {
  const { uid } = requireAuth(req);
  const { spaceId, uid: target } = req.data ?? {};
  if (typeof target !== 'string') throw new HttpsError('invalid-argument', 'args/invalid');
  const { ref, space } = await loadFamily(spaceId);
  const self = target === uid;
  if (!self && space.members[uid] !== 'admin') throw new HttpsError('permission-denied', 'space/not-admin');
  if (!space.members[target]) throw new HttpsError('not-found', 'member/not-found');
  const admins = adminsOf(space);
  if (space.memberIds.length === 1) {
    // Dernier membre : la famille et ses données sont supprimées.
    await db.recursiveDelete(ref);
    return {};
  }
  if (admins.length === 1 && admins[0] === target) throw new HttpsError('failed-precondition', 'space/last-admin');
  await ref.update({
    [`members.${target}`]: FieldValue.delete(),
    [`memberNames.${target}`]: FieldValue.delete(),
    memberIds: FieldValue.arrayRemove(target),
    updatedAt: Date.now(),
  });
  return {};
});

// ─── Compte ───────────────────────────────────────────────────────────

/**
 * Suppression définitive du compte : espace personnel, profil, appareils,
 * invitations, justificatifs, appartenances ; familles dont l'utilisateur
 * est le seul administrateur supprimées ; puis compte d'authentification.
 */
export const deleteAccount = onCall(async (req) => {
  const { uid, email } = requireAuth(req);
  const families = await db.collection('spaces').where('memberIds', 'array-contains', uid).get();
  for (const doc of families.docs) {
    const space = doc.data() as SpaceDoc;
    if (doc.id === uid) continue;
    const admins = adminsOf(space);
    if (space.memberIds.length === 1 || (admins.length === 1 && admins[0] === uid)) {
      await db.recursiveDelete(doc.ref);
      await getStorage().bucket().deleteFiles({ prefix: `spaces/${doc.id}/` }).catch(() => undefined);
    } else {
      await doc.ref.update({
        [`members.${uid}`]: FieldValue.delete(),
        [`memberNames.${uid}`]: FieldValue.delete(),
        memberIds: FieldValue.arrayRemove(uid),
        updatedAt: Date.now(),
      });
    }
  }
  await db.recursiveDelete(db.doc(`spaces/${uid}`));
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.doc(`subscriptions/${uid}`).delete().catch(() => undefined);
  await db.doc(`usage/${uid}`).delete().catch(() => undefined);
  if (email) {
    const invites = await db.collection('invites').where('email', '==', email).get();
    await Promise.all(invites.docs.map((d) => d.ref.delete()));
  }
  await getStorage().bucket().deleteFiles({ prefix: `spaces/${uid}/` }).catch(() => undefined);
  await getAuth().deleteUser(uid);
  logger.info('account deleted'); // jamais d'identifiant ni de donnée dans les journaux
  return {};
});

// ─── Assistant IA ─────────────────────────────────────────────────────

const AI_DAILY_LIMIT = 30;

export const financeAssistant = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '512MiB' }, async (req) => {
  const { uid } = requireAuth(req);
  const { question, summary, language } = req.data ?? {};
  if (typeof question !== 'string' || !question.trim() || question.length > 500) throw new HttpsError('invalid-argument', 'question/invalid');
  if (typeof summary !== 'object' || summary === null || JSON.stringify(summary).length > 12_000) throw new HttpsError('invalid-argument', 'summary/invalid');
  const user = await db.doc(`users/${uid}`).get();
  if (!hasAiAssistant(effectivePlan(user.get('subscription')))) throw new HttpsError('permission-denied', 'plan/ai');
  if (user.get('preferences.aiConsent') !== true) throw new HttpsError('failed-precondition', 'consent/ai');
  // Quota quotidien (protège les coûts et limite les abus).
  const day = new Date().toISOString().slice(0, 10);
  const usageRef = db.doc(`usage/${uid}`);
  await db.runTransaction(async (tx) => {
    const u = await tx.get(usageRef);
    const count = u.get('day') === day ? Number(u.get('ai') ?? 0) : 0;
    if (count >= AI_DAILY_LIMIT) throw new HttpsError('resource-exhausted', 'ai/quota');
    tx.set(usageRef, { day, ai: count + 1 });
  });
  try {
    const answer = await answerWithClaude(ANTHROPIC_API_KEY.value(), question.trim(), summary, language === 'en' ? 'en' : 'fr');
    return { answer: answer ?? '' };
  } catch (e) {
    logger.error('assistant failed', { status: (e as { status?: number })?.status });
    throw new HttpsError('unavailable', 'ai/unavailable');
  }
});

// ─── Administration (statistiques agrégées uniquement) ───────────────

export const adminStats = onCall(async (req) => {
  requireAuth(req);
  if (req.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'admin/required');
  const users = db.collection('users');
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const [all, active, families, plus, family] = await Promise.all([
    users.count().get(),
    users.where('updatedAt', '>=', weekAgo).count().get(),
    db.collection('spaces').where('kind', '==', 'family').count().get(),
    users.where('subscription.plan', '==', 'plus').count().get(),
    users.where('subscription.plan', '==', 'family').count().get(),
  ]);
  const total = all.data().count;
  return {
    users: total,
    active7: active.data().count,
    families: families.data().count,
    plans: { free: total - plus.data().count - family.data().count, plus: plus.data().count, family: family.data().count },
    generatedAt: Date.now(),
  };
});

// ─── Abonnements ──────────────────────────────────────────────────────

/**
 * Vérification d'achat — point d'entrée prévu pour Google Play Billing,
 * App Store, Stripe ou Mobile Money. Volontairement NON implémenté : aucune
 * formule ne doit pouvoir être attribuée sans vérification réelle.
 */
export const verifyPurchase = onCall(async (req) => {
  requireAuth(req);
  throw new HttpsError('unimplemented', 'billing/not-available');
});

// ─── Résumé hebdomadaire (push) ──────────────────────────────────────

/**
 * Chaque lundi 8 h 30 (heure d'Abidjan) : rappel push générique « votre
 * résumé est prêt ». Aucune donnée financière dans la notification.
 */
export const weeklySummaryPush = onSchedule({ schedule: '30 8 * * 1', timeZone: 'Africa/Abidjan' }, async () => {
  const users = await db.collection('users').where('preferences.notifications.weeklySummary', '==', true).select('language').get();
  const messages: { to: string; title: string; body: string; data: { url: string } }[] = [];
  for (const u of users.docs) {
    const devices = await u.ref.collection('devices').get();
    const fr = u.get('language') !== 'en';
    for (const d of devices.docs) {
      messages.push({
        to: d.get('token'),
        title: fr ? 'Votre semaine en un coup d’œil' : 'Your week at a glance',
        body: fr ? 'Consultez votre résumé hebdomadaire.' : 'Check your weekly summary.',
        data: { url: '/reports?period=week' },
      });
    }
  }
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    if (!res.ok) logger.warn('push batch failed', { status: res.status });
  }
  logger.info('weekly push sent', { count: messages.length });
});
