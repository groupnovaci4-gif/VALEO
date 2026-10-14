/**
 * Liens publics modifiables À DISTANCE par l'admin (sans nouvelle version de
 * l'application) : `config/app/items/links` (lecture : tout compte connecté,
 * écriture : admin — règles existantes `config/{doc}/items/{itemId}`).
 * Aujourd'hui : l'adresse de la chaîne WhatsApp DineroX. Vide ou invalide → rien n'est affiché.
 */
import { doc, getDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import { readJSON, writeJSON } from './storage';
import { isWhatsAppChannelUrl } from '@/core/share';

const KEY = 'dinerox:v1:config:appLinks';

export interface AppLinks {
  whatsappChannelUrl: string | null;
}

const clean = (raw: unknown): AppLinks => {
  const url = (raw as { whatsappChannelUrl?: unknown } | null)?.whatsappChannelUrl;
  return { whatsappChannelUrl: isWhatsAppChannelUrl(url) ? url.trim() : null };
};

/** Dernière valeur connue (cache), puis la valeur publiée si le réseau répond. */
export async function loadAppLinks(): Promise<AppLinks> {
  const cached = clean(await readJSON<AppLinks>(KEY));
  if (!isFirebaseConfigured) return cached;
  try {
    const snap = await getDoc(doc(firebase().db, 'config', 'app', 'items', 'links'));
    const links = clean(snap.exists() ? snap.data() : null);
    await writeJSON(KEY, links);
    return links;
  } catch {
    return cached;
  }
}
