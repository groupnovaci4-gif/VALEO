/**
 * Accès distant (Firestore) du moteur de synchronisation. Isolé derrière une
 * interface : le mode local et les tests n'en dépendent pas.
 */
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type FirestoreError,
} from 'firebase/firestore';
import { firebase } from '@/services/firebase';
import type { CollectionName, SyncedDoc } from '@/core/types';
import type { PendingOp } from '@/core/sync';

export type PushResult = 'ok' | 'rejected' | 'retry';

export interface RemoteDoc {
  doc: SyncedDoc;
  /** Horodatage serveur (ms) — curseur de synchronisation incrémentale. */
  syncedAt: number | null;
}

export interface Remote {
  push(op: PendingOp): Promise<PushResult>;
  fetchOne(spaceId: string, col: CollectionName, id: string): Promise<SyncedDoc | null>;
  subscribe(
    spaceId: string,
    col: CollectionName,
    since: number,
    onDocs: (docs: RemoteDoc[]) => void,
    onError: (code: string) => void,
  ): () => void;
}

const path = (spaceId: string, col: string) => `spaces/${spaceId}/${col}`;

/** Retire les champs techniques avant de stocker localement. */
function clean(data: Record<string, unknown>): SyncedDoc {
  const { syncedAt: _ignored, ...rest } = data;
  return rest as unknown as SyncedDoc;
}

export function firestoreRemote(): Remote {
  const { db } = firebase();
  return {
    async push(op) {
      try {
        const ref = doc(db, path(op.spaceId, op.collection), op.id);
        // Délai max : sans réseau, setDoc n'aboutit jamais ; on retentera.
        await Promise.race([
          setDoc(ref, { ...op.doc, syncedAt: serverTimestamp() }),
          new Promise((_, reject) => setTimeout(() => reject({ code: 'deadline-exceeded' }), 15_000)),
        ]);
        return 'ok';
      } catch (e) {
        const code = (e as FirestoreError)?.code;
        // Refus des règles : écriture non autorisée OU plus ancienne que la version serveur.
        if (code === 'permission-denied' || code === 'invalid-argument' || code === 'failed-precondition') return 'rejected';
        return 'retry';
      }
    },
    async fetchOne(spaceId, col, id) {
      try {
        const snap = await getDoc(doc(db, path(spaceId, col), id));
        return snap.exists() ? clean(snap.data()) : null;
      } catch {
        return null;
      }
    },
    subscribe(spaceId, col, since, onDocs, onError) {
      const q = query(collection(db, path(spaceId, col)), where('syncedAt', '>', Timestamp.fromMillis(since)));
      return onSnapshot(
        q,
        { includeMetadataChanges: false },
        (snap) => {
          const docs: RemoteDoc[] = [];
          for (const change of snap.docChanges()) {
            if (change.type === 'removed') continue; // suppression = tombstone, jamais de delete physique
            const d = change.doc;
            const data = d.data({ serverTimestamps: 'none' });
            const ts = data.syncedAt as Timestamp | null | undefined;
            docs.push({ doc: clean(data), syncedAt: d.metadata.hasPendingWrites || !ts ? null : ts.toMillis() });
          }
          if (docs.length) onDocs(docs);
        },
        (err) => onError(err.code),
      );
    },
  };
}
