/**
 * Secrets FICTIFS pour l'émulateur des Cloud Functions (tests uniquement).
 * Écrit `firebase/functions/.secret.local` (fichier ignoré par git) : crée le fichier s'il
 * n'existe pas, et AJOUTE seulement les noms qui manquent — une ligne déjà présente n'est jamais
 * modifiée. Les vrais secrets de production vivent dans Secret Manager
 * (`firebase functions:secrets:set`), tapés par le fondateur.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'firebase/functions/.secret.local';
const FICTIVE = {
  REFERRAL_DEVICE_PEPPER: 'emulateur-seulement-pas-un-vrai-secret',
  ANTHROPIC_API_KEY: 'emulateur-seulement',
  ELEVENLABS_API_KEY: 'emulateur-seulement',
  // Connexion par téléphone : poivre des empreintes + noms des fournisseurs (aucun vrai envoi).
  PHONE_CODE_PEPPER: 'emulateur-seulement-pas-un-vrai-secret',
  META_WHATSAPP_TOKEN: 'emulateur-seulement',
  SMS_API_KEY: 'emulateur-seulement',
};
const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
const present = new Set(current.split('\n').map((l) => l.split('=')[0].trim()).filter(Boolean));
const missing = Object.entries(FICTIVE).filter(([k]) => !present.has(k));
if (missing.length) {
  const base = current && !current.endsWith('\n') ? `${current}\n` : current;
  writeFileSync(file, base + missing.map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log(`${file} : ${missing.map(([k]) => k).join(', ')} ajouté(s) (valeurs fictives pour l'émulateur)`);
}
