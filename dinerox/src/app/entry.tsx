/**
 * Lien profond de la saisie (`dinerox://entry?mode=voice`) : utilisé par le
 * rappel du soir. Ce n'est pas un écran : ouvre la feuille de saisie sur
 * l'accueil.
 */
import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { requestEntry } from '@/features/entry/EntryProvider';
import { analytics } from '@/services/analytics';

export default function EntryLink() {
  const { mode, from } = useLocalSearchParams<{ mode?: string; from?: string }>();
  useEffect(() => {
    if (from === 'reminder') analytics.track('daily_reminder_opened');
    requestEntry(mode === 'keyboard' ? 'keyboard' : 'voice');
  }, [mode, from]);
  return <Redirect href="/" />;
}
