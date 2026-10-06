/**
 * Historique PERSONNEL du coach dans Firestore : users/{uid}/coachEvents.
 * Sert uniquement à ne pas répéter sur un appareil ce qui a été dit sur un
 * autre. Aucun montant ni texte n'y est écrit (voir firestore.rules).
 * Toujours facultatif : une erreur réseau n'empêche jamais le coach de parler.
 */
import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { firebase } from './firebase';
import type { CoachEvent } from '@/core/coach/events';

const DAY = 86_400_000;

export async function recordCoachEvents(uid: string, events: CoachEvent[], deliveredAt: number): Promise<void> {
  const { db } = firebase();
  await Promise.all(
    events.map((e) =>
      setDoc(doc(db, 'users', uid, 'coachEvents', e.id.slice(0, 160)), { kind: e.kind.slice(0, 60), severity: e.severity, period: e.period.slice(0, 10), spaceId: e.spaceId.slice(0, 128), deliveredAt: Math.round(deliveredAt) }),
    ),
  );
}

/** Identifiants présentés ces 90 derniers jours (tous appareils de l'utilisateur). */
export async function fetchDeliveredIds(uid: string, now = Date.now()): Promise<Record<string, number>> {
  const { db } = firebase();
  const snap = await getDocs(query(collection(db, 'users', uid, 'coachEvents'), where('deliveredAt', '>=', now - 90 * DAY), orderBy('deliveredAt', 'desc'), limit(300)));
  const out: Record<string, number> = {};
  snap.forEach((d) => {
    out[d.id] = Number(d.get('deliveredAt')) || now;
  });
  return out;
}
