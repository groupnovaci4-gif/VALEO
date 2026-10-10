/**
 * Compréhension d'une note vocale par l'IA (1.9) — Cloud Function `parseVoiceEntry`.
 * Appelée seulement si le parseur local est peu sûr, en ligne, avec consentement.
 * Envoie le MINIMUM : la transcription écrite (jamais l'audio), la langue, les
 * catégories actives (identifiants + libellés), les noms des comptes (sans
 * soldes) et la date du jour. Délai maximal 8 s ; toute erreur → null (le
 * parseur local reste seul, sans blocage).
 */
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';

export const VOICE_PARSE_TIMEOUT_MS = 8000;

export interface VoiceParseRequest {
  transcript: string;
  language: 'fr' | 'en';
  today: string;
  currency: string;
  categories: { id: string; label: string; kind: 'expense' | 'income'; parentId: string | null }[];
  accounts: string[];
  /** Espace actif : un membre d'un espace familial profite du quota de la formule Famille. */
  spaceId?: string;
}

/** Réponse brute (revérifiée par `core/entry/aiGuard`), ou null. */
export async function parseVoiceRemotely(req: VoiceParseRequest): Promise<unknown | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const fn = httpsCallable<VoiceParseRequest, unknown>(firebase().functions, 'parseVoiceEntry', { timeout: VOICE_PARSE_TIMEOUT_MS });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), VOICE_PARSE_TIMEOUT_MS));
    const res = await Promise.race([fn({ ...req, transcript: req.transcript.slice(0, 2000) }), timeout]);
    return res ? res.data : null;
  } catch {
    return null;
  }
}
