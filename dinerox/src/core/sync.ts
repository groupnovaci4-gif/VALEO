/**
 * Synchronisation hors-ligne — logique PURE (testée sans réseau).
 *
 * Principe :
 *  1. Toute écriture est d'abord appliquée au cache local et mise dans une
 *     file d'attente persistante (« outbox »).
 *  2. Quand le réseau revient, l'outbox est poussée vers Firestore.
 *  3. Les changements distants arrivent par écoute incrémentale
 *     (`syncedAt > curseur`) et sont fusionnés document par document.
 *
 * Conflits : « le plus récent gagne » sur `updatedAt`, document par document.
 * Le serveur applique la même règle (firestore.rules refuse une mise à jour
 * dont `updatedAt` est plus ancien que la version stockée). Les opérations
 * financières étant des documents indépendants et les soldes étant DÉRIVÉS,
 * deux saisies concurrentes ne se perdent jamais : seules deux modifications
 * du MÊME document se départagent.
 *
 * Suppression : logique (`deleted: true`), pour qu'elle se propage et gagne
 * contre une version plus ancienne.
 */
import type { CollectionName, SyncedDoc } from './types';

export interface PendingOp {
  key: string;
  spaceId: string;
  collection: CollectionName;
  id: string;
  doc: SyncedDoc;
  queuedAt: number;
  attempts: number;
}

export function docKey(spaceId: string, collection: string, id: string): string {
  return `${spaceId}/${collection}/${id}`;
}

/** Qui gagne entre une version locale et une version distante ? Égalité → distante (référence serveur). */
export function winner(local: SyncedDoc | undefined, remote: SyncedDoc | undefined): 'local' | 'remote' {
  if (!local) return 'remote';
  if (!remote) return 'local';
  return local.updatedAt > remote.updatedAt ? 'local' : 'remote';
}

/**
 * Horodate une écriture locale. `updatedAt` est strictement croissant pour
 * un même document, même si l'horloge du téléphone a reculé : sinon une
 * modification faite après un changement d'heure serait perdue.
 */
export function stamp<T extends SyncedDoc>(doc: T, now: number, existing?: SyncedDoc): T {
  const updatedAt = existing ? Math.max(now, existing.updatedAt + 1) : now;
  return { ...doc, updatedAt, createdAt: existing?.createdAt ?? doc.createdAt ?? now };
}

/** Ajoute une écriture à l'outbox en remplaçant une écriture en attente du même document. */
export function enqueue(outbox: PendingOp[], op: Omit<PendingOp, 'key' | 'attempts' | 'queuedAt'>, now: number): PendingOp[] {
  const key = docKey(op.spaceId, op.collection, op.id);
  const rest = outbox.filter((p) => p.key !== key);
  return [...rest, { ...op, key, queuedAt: now, attempts: 0 }];
}

export interface MergeResult<T extends SyncedDoc> {
  docs: Record<string, T>;
  /** Clés d'outbox devenues obsolètes (une version distante plus récente a gagné). */
  obsoletePending: string[];
  /** Le contenu visible a changé. */
  changed: boolean;
}

/**
 * Fusionne des documents distants dans le cache d'une collection.
 * Une écriture locale en attente plus récente est conservée (elle sera
 * poussée) ; plus ancienne, elle est abandonnée au profit du distant.
 */
export function mergeRemote<T extends SyncedDoc>(
  current: Record<string, T>,
  remote: T[],
  pendingKeys: Set<string>,
  keyOf: (id: string) => string,
): MergeResult<T> {
  const docs = { ...current };
  const obsoletePending: string[] = [];
  let changed = false;
  for (const r of remote) {
    const local = docs[r.id];
    const k = keyOf(r.id);
    if (winner(local, r) === 'remote') {
      if (!local || local.updatedAt !== r.updatedAt || !!local.deleted !== !!r.deleted) changed = true;
      docs[r.id] = r;
      if (pendingKeys.has(k)) obsoletePending.push(k);
    }
  }
  return { docs, obsoletePending, changed };
}

/** Liste visible : sans les suppressions logiques. */
export function visible<T extends SyncedDoc>(docs: Record<string, T>): T[] {
  return Object.values(docs).filter((d) => !d.deleted);
}

/** Délai avant nouvelle tentative (backoff exponentiel plafonné à 5 min). */
export function retryDelay(attempts: number): number {
  return Math.min(300_000, 2_000 * 2 ** Math.max(0, attempts));
}

/** Identifiant unique généré côté client (utilisable hors-ligne). */
export function newId(prefix = ''): string {
  const rnd = () => Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rnd()}${rnd()}`.slice(0, 28);
}
