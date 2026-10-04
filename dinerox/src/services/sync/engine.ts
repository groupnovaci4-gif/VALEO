/**
 * Moteur de synchronisation hors-ligne d'abord.
 *
 * - Cache local par espace (AsyncStorage), chargé avant tout accès réseau :
 *   l'application s'ouvre et fonctionne sans connexion.
 * - Écritures : appliquées localement tout de suite, puis placées dans une
 *   outbox persistante, poussée vers Firestore dès que possible (backoff).
 * - Lecture distante incrémentale (`syncedAt > curseur`) : seul ce qui a
 *   changé depuis la dernière synchro est téléchargé.
 * - Conflits : logique pure de core/sync.ts (le plus récent gagne, par
 *   document), arbitrée aussi côté serveur par firestore.rules.
 */
import { COLLECTIONS, emptySpaceData, type CollectionName, type Role, type SpaceData, type SyncedDoc } from '@/core/types';
import { docKey, enqueue, mergeRemote, retryDelay, stamp, visible, type PendingOp } from '@/core/sync';
import { can } from '@/core/permissions';
import { debouncedWriter, readJSON, storageKey, writeJSON } from '@/services/storage';
import type { Remote } from './remote';

type Docs = { [K in CollectionName]: Record<string, SyncedDoc> };

interface SpaceState {
  docs: Docs;
  /** Curseur par collection : plus grand `syncedAt` reçu (ms). */
  cursors: Partial<Record<CollectionName, number>>;
  loaded: boolean;
  role: Role;
  unsubscribers: (() => void)[];
  /** Instantané mémorisé pour useSyncExternalStore. */
  snapshot: SpaceData | null;
}

interface PersistedSpace {
  docs: Docs;
  cursors: Partial<Record<CollectionName, number>>;
}

const emptyDocs = (): Docs => Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as Docs;

/** Espaces jamais synchronisés (mode local, démonstration). */
export const isLocalOnlySpace = (spaceId: string) => spaceId === 'local' || spaceId.startsWith('demo_');

export class SyncEngine {
  private spaces = new Map<string, SpaceState>();
  private outbox: PendingOp[] = [];
  private outboxLoaded = false;
  private listeners = new Set<() => void>();
  private online = true;
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private writer = debouncedWriter(400);
  private status = { pending: 0, online: true, lastError: null as string | null };

  constructor(
    private readonly uid: string,
    private readonly remote: Remote | null,
  ) {}

  // ─── Abonnement de l'interface ────────────────────────────────────

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    this.status = { ...this.status, pending: this.outbox.length, online: this.online };
    for (const fn of this.listeners) fn();
  }

  getStatus = () => this.status;

  /** Données visibles d'un espace (référence stable tant que rien ne change). */
  getData(spaceId: string): SpaceData {
    const s = this.spaces.get(spaceId);
    if (!s) return EMPTY;
    if (!s.snapshot) {
      const out = emptySpaceData();
      for (const c of COLLECTIONS) (out[c] as SyncedDoc[]) = visible(s.docs[c]);
      s.snapshot = out;
    }
    return s.snapshot;
  }

  isLoaded(spaceId: string): boolean {
    return !!this.spaces.get(spaceId)?.loaded;
  }

  /** Document brut (y compris supprimé) — pour horodater une modification. */
  getDoc(spaceId: string, col: CollectionName, id: string): SyncedDoc | undefined {
    return this.spaces.get(spaceId)?.docs[col][id];
  }

  // ─── Cycle de vie des espaces ─────────────────────────────────────

  async open(spaceId: string, role: Role): Promise<void> {
    await this.loadOutbox();
    let s = this.spaces.get(spaceId);
    if (s && s.role === role) return;
    if (s) this.closeSubscriptions(s);
    if (!s) {
      const persisted = await readJSON<PersistedSpace>(this.spaceKey(spaceId));
      s = {
        docs: { ...emptyDocs(), ...(persisted?.docs ?? {}) },
        cursors: persisted?.cursors ?? {},
        loaded: true,
        role,
        unsubscribers: [],
        snapshot: null,
      };
      this.spaces.set(spaceId, s);
    }
    s.role = role;
    this.emit();
    this.startSubscriptions(spaceId, s);
    void this.flush();
  }

  close(spaceId: string) {
    const s = this.spaces.get(spaceId);
    if (!s) return;
    this.closeSubscriptions(s);
    this.spaces.delete(spaceId);
  }

  /** Efface le cache d'un espace (quitter une famille, supprimer la démo). */
  async forget(spaceId: string) {
    this.close(spaceId);
    this.outbox = this.outbox.filter((p) => p.spaceId !== spaceId);
    await writeJSON(this.spaceKey(spaceId), null);
    this.persistOutbox();
    this.emit();
  }

  destroy() {
    for (const s of this.spaces.values()) this.closeSubscriptions(s);
    this.writer.flushAll();
    this.listeners.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private startSubscriptions(spaceId: string, s: SpaceState) {
    if (!this.remote || isLocalOnlySpace(spaceId) || !this.online) return;
    for (const col of COLLECTIONS) {
      if (!can(s.role, 'read', col)) continue;
      const unsub = this.remote.subscribe(
        spaceId,
        col,
        s.cursors[col] ?? 0,
        (docs) => this.applyRemote(spaceId, col, docs),
        (code) => {
          this.status = { ...this.status, lastError: code };
          this.emit();
        },
      );
      s.unsubscribers.push(unsub);
    }
  }

  private closeSubscriptions(s: SpaceState) {
    for (const u of s.unsubscribers) u();
    s.unsubscribers = [];
  }

  private applyRemote(spaceId: string, col: CollectionName, docs: { doc: SyncedDoc; syncedAt: number | null }[]) {
    const s = this.spaces.get(spaceId);
    if (!s) return;
    const pending = new Set(this.outbox.map((p) => p.key));
    const result = mergeRemote(s.docs[col], docs.map((d) => d.doc), pending, (id) => docKey(spaceId, col, id));
    s.docs[col] = result.docs;
    const maxTs = Math.max(s.cursors[col] ?? 0, ...docs.map((d) => d.syncedAt ?? 0));
    s.cursors[col] = maxTs;
    if (result.obsoletePending.length) {
      const drop = new Set(result.obsoletePending);
      this.outbox = this.outbox.filter((p) => !drop.has(p.key));
      this.persistOutbox();
    }
    if (result.changed) s.snapshot = null;
    this.persistSpace(spaceId);
    if (result.changed || result.obsoletePending.length) this.emit();
  }

  // ─── Écritures ────────────────────────────────────────────────────

  /**
   * Crée ou remplace un document. `updatedAt`/`createdAt` sont posés ici :
   * les écrans ne doivent jamais horodater eux-mêmes.
   */
  write<T extends SyncedDoc>(spaceId: string, col: CollectionName, input: Omit<T, 'updatedAt' | 'createdAt' | 'createdBy'> & Partial<SyncedDoc>): T {
    const s = this.requireSpace(spaceId);
    const existing = s.docs[col][input.id];
    const now = Date.now();
    const doc = stamp(
      {
        ...(input as unknown as T),
        createdBy: existing?.createdBy ?? input.createdBy ?? this.uid,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      now,
      existing,
    );
    s.docs[col] = { ...s.docs[col], [doc.id]: doc };
    s.snapshot = null;
    this.persistSpace(spaceId);
    if (!isLocalOnlySpace(spaceId) && this.remote) {
      this.outbox = enqueue(this.outbox, { spaceId, collection: col, id: doc.id, doc }, now);
      this.persistOutbox();
    }
    this.emit();
    void this.flush();
    return doc;
  }

  /** Modifie partiellement un document existant. */
  patch<T extends SyncedDoc>(spaceId: string, col: CollectionName, id: string, changes: Partial<T>): T | null {
    const existing = this.getDoc(spaceId, col, id);
    if (!existing) return null;
    return this.write<T>(spaceId, col, { ...(existing as T), ...changes, id });
  }

  /** Suppression logique (propagée à tous les appareils). */
  remove(spaceId: string, col: CollectionName, id: string) {
    const existing = this.getDoc(spaceId, col, id);
    if (!existing) return;
    this.write(spaceId, col, { ...existing, deleted: true });
  }

  /** Plusieurs écritures d'un coup (onboarding, démo) : un seul rendu. */
  writeMany(spaceId: string, items: { col: CollectionName; doc: SyncedDoc }[]) {
    const s = this.requireSpace(spaceId);
    const now = Date.now();
    for (const { col, doc } of items) {
      const existing = s.docs[col][doc.id];
      const stamped = stamp({ ...doc, createdBy: doc.createdBy ?? this.uid, createdAt: existing?.createdAt ?? doc.createdAt ?? now, updatedAt: now }, now, existing);
      s.docs[col] = { ...s.docs[col], [stamped.id]: stamped };
      if (!isLocalOnlySpace(spaceId) && this.remote) {
        this.outbox = enqueue(this.outbox, { spaceId, collection: col, id: stamped.id, doc: stamped }, now);
      }
    }
    s.snapshot = null;
    this.persistSpace(spaceId);
    this.persistOutbox();
    this.emit();
    void this.flush();
  }

  // ─── Réseau ───────────────────────────────────────────────────────

  setOnline(online: boolean) {
    if (online === this.online) return;
    this.online = online;
    for (const [id, s] of this.spaces) {
      this.closeSubscriptions(s);
      if (online) this.startSubscriptions(id, s);
    }
    this.emit();
    if (online) void this.flush();
  }

  /** Pousse l'outbox, dans l'ordre, un document à la fois. */
  async flush(): Promise<void> {
    if (!this.remote || !this.online || this.flushing) return;
    this.flushing = true;
    try {
      while (this.outbox.length && this.online) {
        const op = this.outbox[0];
        const result = await this.remote.push(op);
        if (result === 'retry') {
          op.attempts += 1;
          this.persistOutbox();
          this.scheduleRetry(retryDelay(op.attempts));
          break;
        }
        // Retirer l'op (sauf si une écriture plus récente l'a remplacée entre-temps).
        this.outbox = this.outbox.filter((p) => !(p.key === op.key && p.doc.updatedAt === op.doc.updatedAt));
        this.persistOutbox();
        if (result === 'rejected') {
          // Refusée par le serveur : on restaure la version serveur (ou on retire le document local).
          this.status = { ...this.status, lastError: 'rejected' };
          const server = await this.remote.fetchOne(op.spaceId, op.collection, op.id);
          const s = this.spaces.get(op.spaceId);
          if (s) {
            const docs = { ...s.docs[op.collection] };
            if (server) docs[op.id] = server;
            else delete docs[op.id];
            s.docs[op.collection] = docs;
            s.snapshot = null;
            this.persistSpace(op.spaceId);
          }
        }
        this.emit();
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleRetry(ms: number) {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, ms);
  }

  pendingFor(spaceId: string): number {
    return this.outbox.filter((p) => p.spaceId === spaceId).length;
  }

  // ─── Persistance ──────────────────────────────────────────────────

  private spaceKey(spaceId: string) {
    return storageKey(this.uid, 'space', spaceId);
  }

  private persistSpace(spaceId: string) {
    this.writer.schedule(this.spaceKey(spaceId), () => {
      const s = this.spaces.get(spaceId);
      return s ? ({ docs: s.docs, cursors: s.cursors } satisfies PersistedSpace) : null;
    });
  }

  private persistOutbox() {
    this.writer.schedule(storageKey(this.uid, 'outbox'), () => this.outbox);
  }

  private async loadOutbox() {
    if (this.outboxLoaded) return;
    this.outboxLoaded = true;
    const saved = await readJSON<PendingOp[]>(storageKey(this.uid, 'outbox'));
    if (saved?.length) {
      // Fusion avec ce qui aurait été mis en file avant la fin du chargement.
      const keys = new Set(this.outbox.map((p) => p.key));
      this.outbox = [...saved.filter((p) => !keys.has(p.key)), ...this.outbox];
    }
  }

  private requireSpace(spaceId: string): SpaceState {
    const s = this.spaces.get(spaceId);
    if (!s) throw new Error(`sync/space-not-open:${spaceId}`);
    return s;
  }
}

const EMPTY: SpaceData = emptySpaceData();
