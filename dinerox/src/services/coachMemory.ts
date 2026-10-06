/**
 * Mémoire locale du coach, par utilisateur (appareil partagé : jamais mélangée).
 *  - `notifiedInsights` : identifiants déjà signalés (commun aux notifications
 *    système et aux alertes immédiates : aucune alerte en double) ;
 *  - mémoire des alertes de budget par espace (`core/coach/envelopeAlerts`).
 * Cache en mémoire + écritures sérialisées : deux circuits qui écrivent en
 * même temps ne s'écrasent pas.
 */
import { readJSON, storageKey, writeJSON } from './storage';
import type { EnvelopeAlertMemory } from '@/core/coach/envelopeAlerts';

const notified = new Map<string, Promise<Set<string>>>();
const envMemory = new Map<string, Promise<EnvelopeAlertMemory>>();
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
};

const notifiedKey = (uid: string) => storageKey(uid, 'notifiedInsights');
const envKey = (uid: string, spaceId: string) => storageKey(uid, 'coach', 'envAlerts', spaceId);

function notifiedSet(uid: string): Promise<Set<string>> {
  let p = notified.get(uid);
  if (!p) {
    p = readJSON<string[]>(notifiedKey(uid)).then((l) => new Set(l ?? []));
    notified.set(uid, p);
  }
  return p;
}

export async function hasNotified(uid: string, id: string): Promise<boolean> {
  return (await notifiedSet(uid)).has(id);
}

export function addNotified(uid: string, ids: string[]): Promise<void> {
  return serial(async () => {
    const set = await notifiedSet(uid);
    for (const id of ids) set.add(id);
    await writeJSON(notifiedKey(uid), [...set].slice(-300));
  });
}

export function envelopeMemory(uid: string, spaceId: string): Promise<EnvelopeAlertMemory> {
  const k = envKey(uid, spaceId);
  let p = envMemory.get(k);
  if (!p) {
    p = readJSON<EnvelopeAlertMemory>(k).then((m) => m ?? {});
    envMemory.set(k, p);
  }
  return p;
}

export function saveEnvelopeMemory(uid: string, spaceId: string, memory: EnvelopeAlertMemory): Promise<void> {
  const k = envKey(uid, spaceId);
  envMemory.set(k, Promise.resolve(memory));
  return serial(() => writeJSON(k, memory));
}

/** Oublie le cache en mémoire (changement de compte). */
export function resetCoachMemoryCache() {
  notified.clear();
  envMemory.clear();
}

