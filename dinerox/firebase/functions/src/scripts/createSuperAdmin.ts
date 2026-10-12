/**
 * Crée le PREMIER Super Admin du back-office (ou rétablit l'accès d'un Super Admin
 * qui a perdu sa double vérification). À lancer UNE fois depuis le Mac du fondateur,
 * jamais depuis le portail. Aucun fichier de clé : identifiants Google du Terminal.
 *
 *   gcloud auth application-default login
 *   gcloud auth application-default set-quota-project dinerox-app
 *   cd dinerox/firebase/functions && npm run build
 *   GOOGLE_CLOUD_PROJECT=dinerox-app node lib/scripts/createSuperAdmin.js prenom@exemple.com "Prénom Nom"
 *
 * Options :
 *   --reset-mfa   double vérification à refaire (Super Admin existant, dernier recours)
 *   --emulator    obligatoire si FIRESTORE_EMULATOR_HOST est défini (et interdit sinon)
 *   --shared      accepter une adresse qui a déjà un compte personnel dans l'app (déconseillé, D15)
 *
 * Le compte est créé SANS mot de passe ; le script affiche un lien à ouvrir soi-même
 * pour le choisir (jamais de mot de passe tapé dans le Terminal).
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildEntry, GENESIS_HASH } from '../backoffice/auditCore';
import { cleanEmail, cleanName } from '../backoffice/registry';

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const [rawEmail, rawName] = args.filter((a) => !a.startsWith('--'));
  const email = cleanEmail(rawEmail);
  const displayName = cleanName(rawName);
  if (!email || !displayName) throw new Error('usage : createSuperAdmin <email> "<Prénom Nom>" [--reset-mfa] [--emulator] [--shared]');
  const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (onEmulator !== flags.has('--emulator')) {
    throw new Error(onEmulator ? 'FIRESTORE_EMULATOR_HOST est défini : ajoutez --emulator pour viser les émulateurs.' : '--emulator demandé mais FIRESTORE_EMULATOR_HOST n’est pas défini.');
  }
  if (!onEmulator && !process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Indiquez le projet : GOOGLE_CLOUD_PROJECT=dinerox-app');
  initializeApp(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined);
  const db = getFirestore();
  const auth = getAuth();

  let user = await auth.getUserByEmail(email).catch(() => null);
  if (user && !flags.has('--shared') && (await db.doc(`users/${user.uid}`).get()).exists) {
    throw new Error('Cette adresse a déjà un compte personnel dans l’app. Utilisez une adresse dédiée (D15), ou --shared en connaissance de cause.');
  }
  if (!user) user = await auth.createUser({ email, emailVerified: false, displayName });
  const uid = user.uid;
  const now = Date.now();
  const staffRef = db.doc(`boStaff/${uid}`);
  const resetMfa = flags.has('--reset-mfa');

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(staffRef);
    const headRef = db.doc('boAuditHead/head');
    const head = await tx.get(headRef);
    if (existing.exists && !resetMfa) throw new Error('Ce collaborateur existe déjà. Pour refaire sa double vérification : --reset-mfa.');
    if (existing.exists && existing.get('roleId') !== 'superAdmin') throw new Error('--reset-mfa ne sert qu’à un Super Admin (les autres : depuis le portail).');
    const mfa = { enrolled: false, secretEnc: null, pendingSecretEnc: null, recoveryHashes: [], lastStep: null };
    if (existing.exists) {
      tx.update(staffRef, { mfa, status: 'active' });
      tx.delete(db.doc(`boSessions/${uid}`));
    } else {
      tx.create(staffRef, { email, displayName, roleId: 'superAdmin', status: 'active', mfa, createdAt: now, createdBy: 'script', lastLoginAt: null });
    }
    const seq = Number(head.get('count') ?? 0) + 1;
    const entry = buildEntry(
      { actorUid: null, actorEmail: 'script', actorRole: 'script', action: existing.exists ? 'staff.mfa-reset' : 'staff.bootstrap', result: 'ok', targetUid: uid, targetLabel: displayName, after: existing.exists ? { mfa: 'reset' } : { role: 'superAdmin', status: 'active' } },
      seq,
      now,
      String(head.get('lastHash') ?? GENESIS_HASH),
    );
    const id = String(seq).padStart(12, '0');
    tx.create(db.doc(`boAudit/${id}`), entry);
    tx.set(headRef, { count: seq, lastId: id, lastHash: entry.hash });
  });

  console.log(resetMfa ? 'Double vérification réinitialisée.' : 'Super Admin créé.');
  if (!resetMfa) {
    const link = await auth.generatePasswordResetLink(email);
    console.log('Ouvrez ce lien vous-même pour choisir votre mot de passe (usage unique) :');
    console.log(link);
  }
  console.log('Puis connectez-vous au portail : votre appli d’authentification vous sera demandée.');
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
