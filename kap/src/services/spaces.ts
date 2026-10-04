/**
 * Espaces (personnel, familles) et invitations.
 *
 * Moindre privilège : la création d'un espace dont on est le seul admin est
 * permise au client ; TOUTE modification des membres (inviter, accepter,
 * changer un rôle, retirer, quitter) passe par une Cloud Function qui
 * vérifie les droits et les limites de l'abonnement.
 */
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import type { FamilyInvite, Role, Space } from '@/core/types';
import type { CurrencyCode } from '@/core/money';
import { newId } from '@/core/sync';

export function personalSpace(uid: string, name: string, currency: CurrencyCode): Space {
  const now = Date.now();
  return {
    id: uid,
    kind: 'personal',
    name,
    ownerId: uid,
    members: { [uid]: 'admin' },
    memberIds: [uid],
    memberNames: { [uid]: name },
    currency,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensurePersonalSpace(uid: string, name: string, currency: CurrencyCode): Promise<void> {
  const { db } = firebase();
  const ref = doc(db, 'spaces', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, personalSpace(uid, name, currency));
}

export function listenSpaces(uid: string, cb: (spaces: Space[]) => void, onError: () => void): () => void {
  const { db } = firebase();
  return onSnapshot(
    query(collection(db, 'spaces'), where('memberIds', 'array-contains', uid)),
    (snap) => cb(snap.docs.map((d) => d.data() as Space)),
    () => onError(),
  );
}

export async function createFamily(uid: string, displayName: string, name: string, currency: CurrencyCode): Promise<Space> {
  const { db } = firebase();
  const now = Date.now();
  const space: Space = {
    id: newId('fam_'),
    kind: 'family',
    name: name.trim(),
    ownerId: uid,
    members: { [uid]: 'admin' },
    memberIds: [uid],
    memberNames: { [uid]: displayName },
    currency,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'spaces', space.id), space);
  return space;
}

export async function updateSpaceInfo(spaceId: string, patch: Pick<Partial<Space>, 'name' | 'currency'>): Promise<void> {
  const { db } = firebase();
  await setDoc(doc(db, 'spaces', spaceId), { ...patch, updatedAt: Date.now() }, { merge: true });
}

const call = <I, O = unknown>(name: string) => (data: I) => httpsCallable<I, O>(firebase().functions, name)(data).then((r) => r.data);

export const inviteMember = call<{ spaceId: string; email: string; role: Role }, { inviteId: string }>('inviteMember');
export const respondInvite = call<{ inviteId: string; accept: boolean }, { spaceId?: string }>('respondInvite');
export const revokeInvite = call<{ inviteId: string }>('revokeInvite');
export const setMemberRole = call<{ spaceId: string; uid: string; role: Role }>('setMemberRole');
export const removeMember = call<{ spaceId: string; uid: string }>('removeMember');

/** Invitations reçues (par e-mail vérifié du compte). */
export function listenMyInvites(email: string, cb: (invites: FamilyInvite[]) => void): () => void {
  const { db } = firebase();
  return onSnapshot(
    query(collection(db, 'invites'), where('email', '==', email.toLowerCase()), where('status', '==', 'pending')),
    (snap) => cb(snap.docs.map((d) => d.data() as FamilyInvite).filter((i) => i.expiresAt > Date.now())),
    () => cb([]),
  );
}

/** Invitations envoyées pour un espace (visible des admins). */
export function listenSpaceInvites(spaceId: string, cb: (invites: FamilyInvite[]) => void): () => void {
  const { db } = firebase();
  return onSnapshot(
    query(collection(db, 'invites'), where('spaceId', '==', spaceId), where('status', '==', 'pending')),
    (snap) => cb(snap.docs.map((d) => d.data() as FamilyInvite)),
    () => cb([]),
  );
}
