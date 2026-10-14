/**
 * Suppression définitive d'un compte : espace personnel, profil, appareils,
 * invitations, justificatifs, appartenances ; familles dont l'utilisateur
 * est le seul administrateur supprimées ; puis compte d'authentification.
 *
 * Source UNIQUE, utilisée par `deleteAccount` (l'utilisateur, depuis l'app)
 * et par `boDeleteUser` (back-office) : mêmes effets dans les deux cas,
 * y compris pour le parrainage (filleul retiré de la liste de son parrain) et
 * les tontines partagées (places libérées, historique intact pour les autres).
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { forgetReferralData } from './referralApi';
import { forgetTontineGroups } from './tontineGroupApi';

interface SpaceMembers {
  members: Record<string, string>;
  memberIds: string[];
}

export async function deleteUserData(uid: string, email: string | null): Promise<void> {
  const db = getFirestore();
  const families = await db.collection('spaces').where('memberIds', 'array-contains', uid).get();
  for (const doc of families.docs) {
    const space = doc.data() as SpaceMembers;
    if (doc.id === uid) continue;
    const admins = Object.entries(space.members).filter(([, r]) => r === 'admin').map(([u]) => u);
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
  // Parrainage : avant d'effacer le profil (il dit qui était le parrain).
  await forgetReferralData(uid);
  // Tontines partagées : places libérées (« Ancien membre »), historique intact pour les autres.
  await forgetTontineGroups(uid);
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
}
