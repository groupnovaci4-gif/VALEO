/**
 * Secrets FICTIFS pour l'émulateur des Cloud Functions (tests uniquement).
 * Écrit `firebase/functions/.secret.local` s'il n'existe pas (fichier ignoré
 * par git) ; un fichier déjà présent n'est jamais modifié. Les vrais secrets
 * de production vivent dans Secret Manager (`firebase functions:secrets:set`).
 */
import { existsSync, writeFileSync } from 'node:fs';

const file = 'firebase/functions/.secret.local';
if (!existsSync(file)) {
  writeFileSync(file, ['REFERRAL_DEVICE_PEPPER=emulateur-seulement-pas-un-vrai-secret', 'ANTHROPIC_API_KEY=emulateur-seulement', 'ELEVENLABS_API_KEY=emulateur-seulement', ''].join('\n'));
  console.log(`${file} créé (valeurs fictives pour l'émulateur)`);
}
