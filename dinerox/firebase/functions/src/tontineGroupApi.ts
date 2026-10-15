/**
 * Tontine partagée — Cloud Functions. Le client ne fait que DEMANDER : toute
 * écriture (groupe, paiements, historique, demandes, invitations) est faite
 * ici, après vérification, dans une transaction (l'historique est donc
 * toujours cohérent avec l'état). Règles Firestore : lecture seule, réservée.
 * Logique pure : ./tontineGroup.ts. DineroX ne collecte ni ne transfère d'argent.
 */
import './options';
import { randomInt } from 'node:crypto';
import { getFirestore, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { generateCode, normalizeCode, REFERRAL } from './referral';
import { applyReferralCore, deviceHash, ensureReferralCode, REFERRAL_DEVICE_PEPPER, signupAtOf, takeCodeAttempt } from './referralApi';
import { canCreateTontineGroup, effectivePlan } from './plans';
import {
  TG,
  TgFailure,
  approveJoin,
  confirmPayment,
  createGroup,
  declarePayment,
  disputePayment,
  draw,
  hasFreeSlot,
  invitePreview,
  inviteExpired,
  isMember,
  accountDeleted,
  leave,
  makeInvite,
  newCycle,
  paymentId,
  setOrder,
  setTreasurer,
  updateSettings,
  type Group,
  type HistoryEntry,
  type Invite,
  type Payment,
  type Result,
} from './tontineGroup';

const db = (): Firestore => getFirestore();
const DAY_MS = 24 * 3600 * 1000;
const groupRef = (id: string) => db().doc(`tontineGroups/${id}`);
const today = () => new Date().toISOString().slice(0, 10);

function requireUid(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'auth/required');
  return req.auth.uid;
}

const asId = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new HttpsError('invalid-argument', 'tg/id');
  return v;
};

function writeHistory(tx: Transaction, ref: DocumentReference, entries: HistoryEntry[]) {
  for (const e of entries) tx.create(ref.collection('history').doc(), e);
}

/** Lit le groupe, applique une action pure, écrit l'état, le paiement et l'historique. */
async function mutate(groupId: string, fn: (g: Group, tx: Transaction) => Promise<Result> | Result): Promise<Group> {
  const ref = groupRef(groupId);
  try {
    return await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'tg/not-found');
      const r = await fn(snap.data() as Group, tx);
      tx.set(ref, r.group);
      if (r.payment) tx.set(ref.collection('payments').doc(r.payment.id), r.payment.data);
      writeHistory(tx, ref, r.history);
      return r.group;
    });
  } catch (e) {
    if (e instanceof TgFailure) throw new HttpsError('failed-precondition', e.code);
    throw e;
  }
}

async function readPayment(tx: Transaction, groupId: string, g: Group, period: unknown, slotId: unknown): Promise<Payment | null> {
  if (typeof period !== 'number' || typeof slotId !== 'string') return null;
  const snap = await tx.get(groupRef(groupId).collection('payments').doc(paymentId(g.cycle, period, slotId)));
  return snap.exists ? (snap.data() as Payment) : null;
}

const fromFailure = <T>(f: () => T): T => {
  try {
    return f();
  } catch (e) {
    if (e instanceof TgFailure) throw new HttpsError('failed-precondition', e.code);
    throw e;
  }
};

export const tontineGroup = onCall({ secrets: [REFERRAL_DEVICE_PEPPER] }, async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const now = Date.now();

  switch (d.action) {
    case 'create': {
      const user = await db().doc(`users/${uid}`).get();
      if (!canCreateTontineGroup(effectivePlan(user.get('subscription'), now, user.get('grants')))) throw new HttpsError('permission-denied', 'plan/tontine-group');
      const { group, history } = fromFailure(() => createGroup(d as never, uid, now));
      const ref = db().collection('tontineGroups').doc();
      const batch = db().batch();
      batch.set(ref, group);
      for (const e of history) batch.create(ref.collection('history').doc(), e);
      await batch.commit();
      return { groupId: ref.id };
    }

    case 'invite': {
      const groupId = asId(d.groupId);
      const g = (await groupRef(groupId).get()).data() as Group | undefined;
      if (!g) throw new HttpsError('not-found', 'tg/not-found');
      const invite = fromFailure(() => makeInvite(g, groupId, uid, { days: d.days, showAmount: d.showAmount }, now));
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = generateCode(() => randomInt(0, 1_000_000) / 1_000_000);
        const ok = await db().runTransaction(async (tx) => {
          const ref = db().doc(`tontineInvites/${code}`);
          if ((await tx.get(ref)).exists) return false;
          tx.create(ref, invite);
          tx.create(groupRef(groupId).collection('history').doc(), { at: now, by: uid, action: 'invite', visibility: 'managers', slotUid: null, slotId: null, cycle: null, period: null, info: { days: Math.round((invite.expiresAt - now) / DAY_MS), showAmount: invite.showAmount } } satisfies HistoryEntry);
          return true;
        });
        if (ok) return { code, expiresAt: invite.expiresAt };
      }
      throw new HttpsError('resource-exhausted', 'tg/code-unavailable');
    }

    case 'preview': {
      // Audit 2026-10 (F5) : plafond quotidien d'essais de codes par compte.
      await takeCodeAttempt(uid, 'tg/too-many-tries');
      const code = normalizeCode(d.code);
      const inv = code ? await db().doc(`tontineInvites/${code}`).get() : null;
      if (!inv?.exists) throw new HttpsError('failed-precondition', 'tg/unknown-invite');
      const invite = inv.data() as Invite;
      const g = (await groupRef(invite.groupId).get()).data() as Group | undefined;
      if (!g || g.status !== 'active') throw new HttpsError('failed-precondition', 'tg/unknown-invite');
      return { ...invitePreview(invite, g, now), alreadyMember: isMember(g, uid) };
    }

    case 'requestJoin': {
      await takeCodeAttempt(uid, 'tg/too-many-tries');
      const code = normalizeCode(d.code);
      const label = typeof d.label === 'string' ? d.label.replace(/\s+/g, ' ').trim() : '';
      if (!label || label.length > TG.LABEL_MAX) throw new HttpsError('failed-precondition', 'tg/label');
      const inv = code ? await db().doc(`tontineInvites/${code}`).get() : null;
      if (!inv?.exists) throw new HttpsError('failed-precondition', 'tg/unknown-invite');
      const invite = inv.data() as Invite;
      if (inviteExpired(invite, now)) throw new HttpsError('failed-precondition', 'tg/invite-expired');
      const signupAt = await signupAtOf(uid);
      const newAccount = now - signupAt <= REFERRAL.APPLY_WINDOW_DAYS * DAY_MS;
      await db().runTransaction(async (tx) => {
        const ref = groupRef(invite.groupId);
        const g = (await tx.get(ref)).data() as Group | undefined;
        if (!g || g.status !== 'active') throw new HttpsError('failed-precondition', 'tg/unknown-invite');
        if (isMember(g, uid)) throw new HttpsError('failed-precondition', 'tg/already-member');
        if (!hasFreeSlot(g)) throw new HttpsError('failed-precondition', 'tg/full');
        // La demande seule : la personne ne devient membre qu'après validation de l'organisateur.
        tx.set(ref.collection('requests').doc(uid), { uid, label, at: now, status: 'pending', newAccount, code });
        writeHistory(tx, ref, [{ at: now, by: uid, action: 'join_request', visibility: 'managers', slotUid: uid, slotId: null, cycle: null, period: null, info: null }]);
      });
      // Nouveau compte sans parrain : l'organisateur devient son parrain (jamais à la place d'un parrain existant).
      let referred = false;
      if (newAccount) {
        const g = (await groupRef(invite.groupId).get()).data() as Group;
        const organizerCode = await ensureReferralCode(g.organizerUid);
        const r = await applyReferralCore(uid, organizerCode, 'tontine', deviceHash(d.deviceId, REFERRAL_DEVICE_PEPPER.value()));
        referred = !r.refusal;
      }
      return { groupId: invite.groupId, status: 'pending', referred };
    }

    case 'approve': {
      const groupId = asId(d.groupId);
      const who = asId(d.uid);
      await mutate(groupId, async (g, tx) => {
        const reqRef = groupRef(groupId).collection('requests').doc(who);
        const r = await tx.get(reqRef);
        if (!r.exists || r.get('status') !== 'pending') throw new HttpsError('failed-precondition', 'tg/no-request');
        const res = approveJoin(g, uid, { uid: who, label: r.get('label') }, d.slotIds, now);
        // Demande traitée : gardée pour les statistiques, sans le nom (il vit désormais sur la place).
        tx.set(reqRef, { status: 'approved', label: null, decidedAt: now }, { merge: true });
        return res;
      });
      return { ok: true };
    }

    case 'reject': {
      const groupId = asId(d.groupId);
      const who = asId(d.uid);
      await mutate(groupId, async (g, tx) => {
        if (g.organizerUid !== uid) throw new TgFailure('tg/not-organizer');
        const reqRef = groupRef(groupId).collection('requests').doc(who);
        const r = await tx.get(reqRef);
        if (!r.exists || r.get('status') !== 'pending') throw new HttpsError('failed-precondition', 'tg/no-request');
        // Refus : le nom choisi par la personne est effacé, seul le statut reste (statistiques).
        tx.set(reqRef, { status: 'rejected', label: null, decidedAt: now }, { merge: true });
        return { group: { ...g, updatedAt: now }, history: [{ at: now, by: uid, action: 'join_rejected', visibility: 'managers', slotUid: who, slotId: null, cycle: null, period: null, info: null }] };
      });
      return { ok: true };
    }

    case 'setOrder':
      await mutate(asId(d.groupId), (g) => setOrder(g, uid, d.order, now));
      return { ok: true };
    case 'draw':
      await mutate(asId(d.groupId), (g) => draw(g, uid, () => randomInt(0, 1_000_000) / 1_000_000, now));
      return { ok: true };
    case 'setTreasurer':
      await mutate(asId(d.groupId), (g) => setTreasurer(g, uid, d.uid ?? null, now));
      return { ok: true };
    case 'declare': {
      const groupId = asId(d.groupId);
      await mutate(groupId, async (g, tx) => declarePayment(g, await readPayment(tx, groupId, g, d.period, d.slotId), uid, { period: d.period, slotId: d.slotId }, now));
      return { ok: true };
    }
    case 'confirm': {
      const groupId = asId(d.groupId);
      await mutate(groupId, async (g, tx) => confirmPayment(g, await readPayment(tx, groupId, g, d.period, d.slotId), uid, { period: d.period, slotId: d.slotId }, now));
      return { ok: true };
    }
    case 'dispute': {
      const groupId = asId(d.groupId);
      await mutate(groupId, async (g, tx) => disputePayment(g, await readPayment(tx, groupId, g, d.period, d.slotId), uid, { period: d.period, slotId: d.slotId }, now));
      return { ok: true };
    }
    case 'leave':
      await mutate(asId(d.groupId), (g) => leave(g, uid, now));
      return { ok: true };
    case 'settings':
      await mutate(asId(d.groupId), (g) => updateSettings(g, uid, { name: d.name, amountPerShare: d.amountPerShare, potAmount: d.potAmount }, now));
      return { ok: true };
    case 'newCycle':
      await mutate(asId(d.groupId), (g) => newCycle(g, uid, today(), now));
      return { ok: true };
    default:
      throw new HttpsError('invalid-argument', 'tg/action');
  }
});

/** Statistiques AGRÉGÉES (admin) : groupes, taille moyenne, invitations, demandes, nouveaux comptes venus par une invitation. */
export const adminTontineStats = onCall(async (req) => {
  requireUid(req);
  if (req.auth?.token.admin !== true) throw new HttpsError('permission-denied', 'admin/required');
  const [groups, invites, requests, newAccounts] = await Promise.all([
    db().collection('tontineGroups').select('memberUids').get(),
    db().collection('tontineInvites').count().get(),
    db().collectionGroup('requests').count().get(),
    db().collectionGroup('requests').where('newAccount', '==', true).count().get(),
  ]);
  const sizes = groups.docs.map((g) => ((g.get('memberUids') as string[] | undefined) ?? []).length);
  const invitesCount = invites.data().count;
  return {
    groups: groups.size,
    averageMembers: sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10 : 0,
    invites: invitesCount,
    joinRequests: requests.data().count,
    newAccountsFromInvites: newAccounts.data().count,
    newAccountRate: invitesCount ? newAccounts.data().count / invitesCount : 0,
    generatedAt: Date.now(),
  };
});

/**
 * Compte supprimé (deleteUserData, donc deleteAccount ET boDeleteUser) : la
 * personne quitte ses groupes, ses places deviennent « Ancien membre »,
 * l'historique reste intact pour les autres ; ses demandes en cours sont effacées.
 */
export async function forgetTontineGroups(uid: string): Promise<void> {
  const now = Date.now();
  const groups = await db().collection('tontineGroups').where('memberUids', 'array-contains', uid).get();
  for (const doc of groups.docs) {
    await mutate(doc.id, (g) => accountDeleted(g, uid, now));
  }
  const requests = await db().collectionGroup('requests').where('uid', '==', uid).get();
  await Promise.all(requests.docs.map((r) => r.ref.delete()));
}

