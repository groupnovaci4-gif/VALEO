/**
 * Emplacement du micro central : ce n'est pas un écran. Arriver ici (lien
 * profond `/mic`) ouvre la saisie vocale sur l'accueil (via /entry, qui attend
 * que la session soit prête).
 */
import { Redirect } from 'expo-router';

export default function MicSlot() {
  return <Redirect href="/entry?mode=voice" />;
}
