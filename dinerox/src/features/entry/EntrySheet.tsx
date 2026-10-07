/**
 * Feuille de saisie. Étape 0 : renvoie vers le menu de saisie existant
 * (dépense, revenu, transfert, épargne, objectif, assistant) — remplacée par
 * la saisie rapide, la phrase écrite et la voix aux phases suivantes.
 */
import { useEffect } from 'react';
import { useQuickAdd } from '@/features/QuickAdd';
import type { EntryMode } from './EntryProvider';

export function EntrySheet({ mode, onClose }: { mode: EntryMode | null; onClose: () => void; onModeChange: (m: EntryMode) => void }) {
  const quick = useQuickAdd();
  useEffect(() => {
    if (!mode) return;
    quick.open();
    onClose();
  }, [mode, quick, onClose]);
  return null;
}
