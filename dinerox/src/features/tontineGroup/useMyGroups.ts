/** Mes tontines partagées (groupes dont je suis membre), en direct. Rien hors connexion en ligne. */
import { useEffect, useState } from 'react';
import { useApp } from '@/store/app';
import { listenMyGroups } from '@/services/tontineGroups';
import type { GroupSlot, TontineGroup } from '@/core/tontineGroup';
import type { TKey } from '@/i18n';

export function useMyGroups(): { groups: TontineGroup[]; uid: string | null } {
  const { user, mode } = useApp();
  const uid = mode === 'firebase' && user ? user.uid : null;
  const [groups, setGroups] = useState<TontineGroup[]>([]);
  useEffect(() => {
    if (!uid) return;
    return listenMyGroups(uid, (g) => setGroups(g.sort((a, b) => a.name.localeCompare(b.name))));
  }, [uid]);
  return { groups: uid ? groups : [], uid };
}

/** Nom affiché d'une place : nom choisi par la personne, « Ancien membre », « Membre N » ; pour l'organisateur SEUL, son surnom privé d'abord. */
export function slotName(t: (k: TKey, p?: Record<string, string | number>) => string, slot: GroupSlot, index: number, nicknames: Record<string, string> = {}): string {
  const nick = nicknames[slot.slotId];
  const base = slot.label ?? (slot.former ? t('tg.slot.former') : t('tg.slot', { n: index + 1 }));
  return nick && !slot.uid ? `${nick} (${base})` : base;
}
