/**
 * Dates des moments forts publiées par l'administrateur
 * (`config/seasons/items`, lecture pour tout utilisateur connecté, écriture
 * administrateur — règles Firestore). Mises en cache locale ; hors ligne ou en
 * mode local, le cache s'applique (sinon : « date à préciser »).
 */
import { collection, getDocs } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';
import { sanitizeSeasonDates, type SeasonDate } from '@/core/seasons';

const KEY = 'dinerox:v1:config:seasons';

export async function loadSeasonDates(online: boolean): Promise<SeasonDate[]> {
  const cached = sanitizeSeasonDates((await readJSON<unknown[]>(KEY)) ?? []);
  if (!isFirebaseConfigured || !online) return cached;
  try {
    const snap = await getDocs(collection(firebase().db, 'config', 'seasons', 'items'));
    const items = sanitizeSeasonDates(snap.docs.map((d) => d.data()));
    await writeJSON(KEY, items);
    return items;
  } catch {
    return cached;
  }
}
