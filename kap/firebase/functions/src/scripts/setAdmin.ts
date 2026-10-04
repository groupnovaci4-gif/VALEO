/**
 * Accorde (ou retire) le droit d'administration à un compte.
 * Usage : GOOGLE_APPLICATION_CREDENTIALS=… node lib/scripts/setAdmin.js <email> [--revoke]
 * À exécuter depuis un poste de confiance, jamais depuis l'application.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) throw new Error('usage: setAdmin <email> [--revoke]');
  initializeApp();
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, flag === '--revoke' ? { admin: null } : { ...(user.customClaims ?? {}), admin: true });
  console.log(flag === '--revoke' ? 'admin revoked' : 'admin granted');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
