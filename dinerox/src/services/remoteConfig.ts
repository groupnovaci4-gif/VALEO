/**
 * Configuration publiée par les administrateurs (lecture seule pour les
 * utilisateurs) : catégories d'objectifs supplémentaires, etc. Mise en
 * cache locale ; en cas d'échec, les valeurs par défaut s'appliquent.
 */
import { collection, getDocs } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';
import type { GoalCategory } from '@/core/goalCategories';

const KEY = 'dinerox:v1:config:goalCategories';

export async function loadRemoteGoalCategories(): Promise<Partial<GoalCategory>[]> {
  const cached = (await readJSON<Partial<GoalCategory>[]>(KEY)) ?? [];
  if (!isFirebaseConfigured) return cached;
  try {
    const snap = await getDocs(collection(firebase().db, 'config', 'goalCategories', 'items'));
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Partial<GoalCategory>) }));
    await writeJSON(KEY, items);
    return items;
  } catch {
    return cached;
  }
}
