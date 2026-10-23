/**
 * Connexion par téléphone — effacement des données d'un compte (audit du 23/10, S2).
 * Appelé par la suppression de compte (`deleteUserData` : « Supprimer mon compte » ET back-office)
 * et quand un numéro pointe vers un compte qui n'existe plus : index du numéro, empreinte du code
 * secret, appareils connus, compteurs et demandes de code liées. Aucun secret nécessaire : le
 * numéro est retrouvé par son identifiant (HMAC) rangé avec le code secret.
 */
import { getFirestore } from 'firebase-admin/firestore';

export async function forgetPhoneData(uid: string): Promise<void> {
  const db = getFirestore();
  const secrets = await db.doc(`phoneSecrets/${uid}`).get();
  const pk = secrets.get('phoneKey');
  const refs = [db.doc(`phoneSecrets/${uid}`), db.doc(`phoneDevices/${uid}`), db.doc(`phoneGuard/acct-${uid}`)];
  const requests = (await db.collection('phoneAuth').where('uid', '==', uid).get()).docs.map((d) => d.ref);
  if (typeof pk === 'string' && pk) {
    const index = await db.doc(`phoneIndex/${pk}`).get();
    // L'index n'est retiré que s'il désigne CE compte (un numéro passé à un autre compte reste à lui).
    if (index.get('uid') === uid) refs.push(index.ref, db.doc(`phoneGuard/${pk}`), db.doc(`phoneGuard/known-${pk}`));
    requests.push(...(await db.collection('phoneAuth').where('phoneKey', '==', pk).get()).docs.map((d) => d.ref));
  }
  const all = [...new Map([...refs, ...requests].map((r) => [r.path, r])).values()];
  for (let i = 0; i < all.length; i += 400) {
    const batch = db.batch();
    for (const r of all.slice(i, i + 400)) batch.delete(r);
    await batch.commit();
  }
}
