/**
 * Connexion par téléphone, étape 2 : les collections du serveur sont DÉCLARÉES fermées dans
 * firebase/firestore.rules (aucune lecture ni écriture client, même administrateur). Le refus
 * effectif est vérifié sur l'émulateur (tests/rules/firestore.rules.test.ts, `npm run test:rules`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

export const PHONE_COLLECTIONS = ['phoneAuth', 'phoneSecrets', 'phoneGuard', 'phoneDevices', 'phoneIndex', 'phoneOutbox'] as const;

describe('règles : collections de la connexion par téléphone fermées au client', () => {
  const rules = readFileSync('firebase/firestore.rules', 'utf8');
  it.each(PHONE_COLLECTIONS)('%s : « allow read, write: if false »', (c) => {
    expect(rules).toMatch(new RegExp(`match /${c}/\\{\\w+\\} \\{\\s*allow read, write: if false;\\s*\\}`));
  });
});
