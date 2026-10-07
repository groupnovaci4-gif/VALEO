/**
 * Lien profond de la saisie (`dinerox://entry?mode=voice`) : utilisé par le
 * rappel du soir. Ce n'est pas un écran : une fois la session et l'espace
 * prêts (démarrage à froid depuis la notification), ouvre la feuille de
 * saisie sur l'accueil.
 */
import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, useSpaceReady } from '@/store/app';
import { requestEntry } from '@/features/entry/EntryProvider';
import { analytics } from '@/services/analytics';

export default function EntryLink() {
  const { mode, from } = useLocalSearchParams<{ mode?: string; from?: string }>();
  const { status } = useApp();
  const ready = useSpaceReady();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || status !== 'signedIn' || !ready) return;
    done.current = true;
    if (from === 'reminder') analytics.track('daily_reminder_opened');
    router.replace('/');
    requestEntry(mode === 'keyboard' ? 'keyboard' : 'voice');
  }, [mode, from, status, ready]);
  return null;
}
