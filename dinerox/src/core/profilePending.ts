/**
 * Modification du profil faite sur l'appareil et pas encore confirmée par le
 * serveur. Elle reste appliquée par-dessus toute version serveur plus ancienne :
 * sans cela, un instantané serveur en retard effacerait par exemple
 * « onboarding terminé » et renverrait l'utilisateur vers l'onboarding.
 */
import type { UserProfile } from './types';

export type ProfilePatch = Partial<Omit<UserProfile, 'subscription' | 'uid'>>;

export interface PendingProfile {
  patch: ProfilePatch;
  /** Horodatage local de la modification (ms). */
  at: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Cumule deux modifications : les objets imbriqués sont fusionnés (comme setDoc merge). */
export function mergePatch<T extends object>(a: T, b: ProfilePatch): T {
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = isObject(v) && isObject(prev) ? { ...prev, ...v } : v;
  }
  return out as T;
}

/** Ajoute une modification à celle déjà en attente. */
export function queuePatch(prev: PendingProfile | null, patch: ProfilePatch, at: number): PendingProfile {
  return { patch: prev ? mergePatch(prev.patch, patch) : patch, at };
}

/**
 * Profil à afficher à la réception d'un instantané. Attention : un instantané
 * peut contenir une écriture encore seulement locale (hors-ligne) ; il ne prouve
 * donc pas que le serveur l'a reçue. Seul l'accusé de réception de l'écriture
 * permet d'oublier la modification en attente.
 */
export function applyPending(snapshot: UserProfile, pending: PendingProfile | null): UserProfile {
  if (!pending || (snapshot.updatedAt ?? 0) >= pending.at) return snapshot;
  return mergePatch(snapshot, pending.patch);
}
