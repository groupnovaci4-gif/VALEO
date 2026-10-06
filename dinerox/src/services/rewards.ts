/**
 * Récompenses PERSONNELLES : cache local par utilisateur + users/{uid}/rewards
 * (création seule, identifiant `${rewardId}_${période}` : jamais deux fois la
 * même). Jamais dans l'espace familial : personne d'autre ne les voit.
 */
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { readJSON, storageKey, writeJSON } from './storage';
import { rewardKey, type RewardRecord } from '@/core/coach/rewards';

export interface StoredReward extends RewardRecord {
  spaceId: string;
}

const key = (uid: string) => storageKey(uid, 'rewards');
const merge = (a: StoredReward[], b: StoredReward[]) => {
  const m = new Map<string, StoredReward>();
  for (const r of [...a, ...b]) {
    const k = rewardKey(r.rewardId, r.period);
    if (!m.has(k)) m.set(k, r);
  }
  return [...m.values()].sort((x, y) => x.earnedAt - y.earnedAt);
};

export async function loadRewards(uid: string, online: boolean): Promise<StoredReward[]> {
  const local = (await readJSON<StoredReward[]>(key(uid))) ?? [];
  if (!online) return local;
  try {
    const snap = await getDocs(collection(firebase().db, 'users', uid, 'rewards'));
    const remote: StoredReward[] = [];
    snap.forEach((d) => {
      const v = d.data() as Partial<StoredReward>;
      if (typeof v.rewardId === 'string' && typeof v.period === 'string') remote.push({ rewardId: v.rewardId, period: v.period, earnedAt: Number(v.earnedAt) || 0, spaceId: String(v.spaceId ?? '') });
    });
    const all = merge(local, remote);
    await writeJSON(key(uid), all);
    return all;
  } catch {
    return local;
  }
}

export async function saveRewards(uid: string, records: StoredReward[], online: boolean): Promise<void> {
  if (!records.length) return;
  const all = merge((await readJSON<StoredReward[]>(key(uid))) ?? [], records);
  await writeJSON(key(uid), all);
  if (!online) return;
  await Promise.all(
    records.map((r) => setDoc(doc(firebase().db, 'users', uid, 'rewards', rewardKey(r.rewardId, r.period).slice(0, 160)), { rewardId: r.rewardId, period: r.period, earnedAt: Math.round(r.earnedAt), spaceId: r.spaceId })),
  ).catch(() => undefined);
}
