/**
 * Tontine partagée — accès serveur. Le client ne fait que DEMANDER (fonction
 * `tontineGroup`) et LIRE ce que les règles lui permettent. Les surnoms privés
 * de l'organisateur (« Place 3 = tante Awa ») restent SUR SON TÉLÉPHONE
 * (décision 1 du fondateur) : jamais envoyés, jamais synchronisés.
 */
import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { firebase } from './firebase';
import { readJSON, storageKey, writeJSON } from './storage';
import { deviceId } from './deviceId';
import type { GroupPayment, TontineGroup } from '@/core/tontineGroup';

type Action =
  | 'create'
  | 'invite'
  | 'preview'
  | 'requestJoin'
  | 'approve'
  | 'reject'
  | 'setOrder'
  | 'draw'
  | 'setTreasurer'
  | 'declare'
  | 'confirm'
  | 'dispute'
  | 'leave'
  | 'settings'
  | 'newCycle';

export async function tontineGroupCall<O = { ok: true }>(action: Action, data: Record<string, unknown> = {}): Promise<O> {
  const extra = action === 'requestJoin' ? { deviceId: await deviceId() } : {};
  const r = await httpsCallable<Record<string, unknown>, O>(firebase().functions, 'tontineGroup')({ action, ...data, ...extra });
  return r.data;
}

/** Code d'erreur d'une action refusée (`tg/…`, `plan/…`), null si réseau ou autre. */
export function tgRefusal(e: unknown): string | null {
  const m = /^(tg|plan)\/[a-z-]+/.exec(String((e as { message?: string })?.message ?? ''));
  return m ? m[0] : null;
}

export function listenMyGroups(uid: string, cb: (groups: TontineGroup[]) => void): () => void {
  return onSnapshot(
    query(collection(firebase().db, 'tontineGroups'), where('memberUids', 'array-contains', uid)),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<TontineGroup, 'id'>), id: d.id }))),
    () => cb([]),
  );
}

/** Déclarations : toutes pour l'organisateur et le trésorier, les siennes seulement pour un membre (règles). */
export function listenPayments(groupId: string, uid: string, manager: boolean, cb: (p: (GroupPayment & { id: string })[]) => void): () => void {
  const col = collection(firebase().db, 'tontineGroups', groupId, 'payments');
  return onSnapshot(
    manager ? col : query(col, where('uid', '==', uid)),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as GroupPayment), id: d.id }))),
    () => cb([]),
  );
}

export interface HistoryLine {
  id: string;
  at: number;
  by: string;
  action: string;
  visibility: 'all' | 'managers';
  slotUid: string | null;
  slotId: string | null;
  cycle: number | null;
  period: number | null;
}

/** Journal : public pour tous ; le reste pour les gestionnaires et la personne concernée (deux lectures pour un membre). */
export function listenHistory(groupId: string, uid: string, manager: boolean, cb: (lines: HistoryLine[]) => void): () => void {
  const col = collection(firebase().db, 'tontineGroups', groupId, 'history');
  const map = (docs: { id: string; data: () => unknown }[]) => docs.map((d) => ({ ...(d.data() as Omit<HistoryLine, 'id'>), id: d.id }));
  if (manager) return onSnapshot(col, (s) => cb(map(s.docs).sort((a, b) => b.at - a.at)), () => cb([]));
  let pub: HistoryLine[] = [];
  let mine: HistoryLine[] = [];
  const emit = () => cb([...new Map([...pub, ...mine].map((l) => [l.id, l])).values()].sort((a, b) => b.at - a.at));
  const off1 = onSnapshot(query(col, where('visibility', '==', 'all')), (s) => ((pub = map(s.docs)), emit()), () => undefined);
  const off2 = onSnapshot(query(col, where('slotUid', '==', uid)), (s) => ((mine = map(s.docs)), emit()), () => undefined);
  return () => {
    off1();
    off2();
  };
}

export interface JoinRequest {
  uid: string;
  label: string | null;
  at: number;
  status: 'pending' | 'approved' | 'rejected';
}

/** Demandes en attente (organisateur). */
export function listenRequests(groupId: string, cb: (r: JoinRequest[]) => void): () => void {
  return onSnapshot(
    query(collection(firebase().db, 'tontineGroups', groupId, 'requests'), where('status', '==', 'pending')),
    (snap) => cb(snap.docs.map((d) => d.data() as JoinRequest)),
    () => cb([]),
  );
}

/** Ma demande pour un groupe (en attente de validation). */
export function listenMyRequest(groupId: string, uid: string, cb: (r: JoinRequest | null) => void): () => void {
  return onSnapshot(
    doc(firebase().db, 'tontineGroups', groupId, 'requests', uid),
    (snap) => cb(snap.exists() ? (snap.data() as JoinRequest) : null),
    () => cb(null),
  );
}

// ─── Surnoms privés de l'organisateur (sur ce téléphone seulement) ─────

const nickKey = (uid: string, groupId: string) => storageKey(uid, 'tontineGroupNicknames', groupId);

export async function readNicknames(uid: string, groupId: string): Promise<Record<string, string>> {
  return (await readJSON<Record<string, string>>(nickKey(uid, groupId))) ?? {};
}

export async function writeNickname(uid: string, groupId: string, slotId: string, nickname: string): Promise<Record<string, string>> {
  const all = await readNicknames(uid, groupId);
  const clean = nickname.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (clean) all[slotId] = clean;
  else delete all[slotId];
  await writeJSON(nickKey(uid, groupId), all);
  return all;
}
