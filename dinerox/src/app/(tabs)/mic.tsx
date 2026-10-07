/**
 * Emplacement du micro central : ce n'est pas un écran. Arriver ici (lien
 * profond `/mic`) ouvre la saisie vocale sur l'accueil.
 */
import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { requestEntry } from '@/features/entry/EntryProvider';

export default function MicSlot() {
  useEffect(() => requestEntry('voice'), []);
  return <Redirect href="/" />;
}
