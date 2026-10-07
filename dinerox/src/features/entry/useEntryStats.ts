import { useEffect, useState } from 'react';
import { useApp } from '@/store/app';
import { onEntryStatsChange, readEntryStats, type EntryStats } from '@/services/entryStats';

/** Compteurs de saisie du compte courant (null pendant la lecture). */
export function useEntryStats(): EntryStats | null {
  const { user } = useApp();
  const uid = user?.uid ?? null;
  const [stats, setStats] = useState<{ uid: string; s: EntryStats } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const load = () =>
      void readEntryStats(uid)
        .then((s) => alive && setStats({ uid, s }))
        .catch(() => undefined);
    load();
    const off = onEntryStatsChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [uid]);
  // Jamais les compteurs d'un autre compte (changement d'utilisateur).
  return stats && stats.uid === uid ? stats.s : null;
}
