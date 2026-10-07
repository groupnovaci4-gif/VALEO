/**
 * Compteurs LOCAUX de saisie, par compte (uid) : nombre de saisies réussies
 * (la bulle d'accueil se réduit après 10), saisies vocales du jour (limite de
 * la formule gratuite), catégories et compte récents (saisie rapide).
 * Rien n'est envoyé au serveur.
 */
import { readJSON, storageKey, writeJSON } from './storage';
import { today } from '@/core/dates';

export interface EntryStats {
  /** Saisies réussies (toutes méthodes). */
  successes: number;
  /** Saisies vocales validées aujourd'hui. */
  voiceDay: string | null;
  voiceCount: number;
  /** Catégories récentes par type (la plus récente d'abord). */
  recent: { expense: string[]; income: string[] };
  lastAccountId: string | null;
}

const EMPTY: EntryStats = { successes: 0, voiceDay: null, voiceCount: 0, recent: { expense: [], income: [] }, lastAccountId: null };
const key = (uid: string) => storageKey(uid, 'entryStats');
const listeners = new Set<() => void>();

export async function readEntryStats(uid: string): Promise<EntryStats> {
  const s = await readJSON<Partial<EntryStats>>(key(uid));
  return { ...EMPTY, ...(s ?? {}), recent: { ...EMPTY.recent, ...(s?.recent ?? {}) } };
}

/** Saisies vocales déjà validées aujourd'hui. */
export function voiceToday(s: EntryStats, day = today()): number {
  return s.voiceDay === day ? s.voiceCount : 0;
}

export async function recordEntrySuccess(
  uid: string,
  entry: { voice: boolean; items: { type: 'expense' | 'income' | 'transfer'; categoryId: string | null; accountId: string | null }[] },
): Promise<EntryStats> {
  const s = await readEntryStats(uid);
  const day = today();
  const recent = { expense: [...s.recent.expense], income: [...s.recent.income] };
  for (const it of [...entry.items].reverse()) {
    if (it.type === 'transfer' || !it.categoryId) continue;
    recent[it.type] = [it.categoryId, ...recent[it.type].filter((c) => c !== it.categoryId)].slice(0, 12);
  }
  const next: EntryStats = {
    successes: s.successes + 1,
    voiceDay: entry.voice ? day : s.voiceDay,
    voiceCount: entry.voice ? voiceToday(s, day) + 1 : s.voiceCount,
    recent,
    lastAccountId: entry.items.find((i) => i.accountId)?.accountId ?? s.lastAccountId,
  };
  await writeJSON(key(uid), next);
  listeners.forEach((l) => l());
  return next;
}

export function onEntryStatsChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
