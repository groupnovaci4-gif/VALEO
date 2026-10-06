/**
 * Politique de diffusion du coach — module PUR (anti-sur-alerte).
 *
 *  - jamais deux fois le même événement (identifiant déterministe mémorisé) ;
 *  - drapeaux de préférences existants respectés (`budgetAlerts`…) ;
 *  - délai minimal entre deux événements du même type (hors dépassement et
 *    hors réaction à l'action que l'utilisateur vient de faire) ;
 *  - priorité critical > warning > celebration > advice > info ;
 *  - à l'ouverture : les événements en attente sont regroupés en UN résumé ;
 *  - voix : au plus 1 intervention par ouverture et 3 par jour (hors
 *    dépassement), 1 félicitation vocale par jour ; jamais hors premier plan.
 */
import type { CoachPrefs, NotificationPrefs } from '../types';
import type { ISODate } from '../dates';
import type { CoachEvent, CoachSeverity } from './events';

export interface DeliveryState {
  /** Identifiant → horodatage de diffusion (déduplication persistante). */
  delivered: Record<string, number>;
  /** Type → dernière diffusion (délai minimal). */
  lastByKind: Record<string, number>;
  day: ISODate | null;
  voiceToday: number;
  celebrationVoiceToday: number;
}

export const EMPTY_DELIVERY: DeliveryState = { delivered: {}, lastByKind: {}, day: null, voiceToday: 0, celebrationVoiceToday: 0 };

export type CoachTrigger = 'write' | 'open';
export type CoachSound = 'warning' | 'alarm' | 'success';

export interface DeliveryPlan {
  /** Événements à présenter, du plus prioritaire au moins prioritaire. */
  show: CoachEvent[];
  /** Plusieurs événements à l'ouverture : un seul résumé. */
  summary: boolean;
  /** Événement à lire à voix haute (au plus un). */
  voice: CoachEvent | null;
  sound: CoachSound | null;
  state: DeliveryState;
  sessionVoiceUsed: boolean;
}

const HOUR = 3_600_000;
const COOLDOWN_HOURS: Record<CoachPrefs['frequency'], number> = { discreet: 24, normal: 12, active: 4 };
const MAX_AT_OPEN: Record<CoachPrefs['frequency'], number> = { discreet: 1, normal: 3, active: 5 };
export const VOICE_PER_DAY = 3;
const KEEP_DELIVERED_MS = 90 * 24 * HOUR;

const SOUND: Partial<Record<CoachSeverity, CoachSound>> = { critical: 'alarm', warning: 'warning', celebration: 'success' };

export function planDelivery(input: {
  events: CoachEvent[];
  state: DeliveryState;
  now: number;
  today: ISODate;
  trigger: CoachTrigger;
  prefs: CoachPrefs;
  notifications: NotificationPrefs;
  /** Une intervention vocale a déjà eu lieu depuis l'ouverture de l'application. */
  sessionVoiceUsed: boolean;
  /** Application au premier plan (sinon : ni son ni voix). */
  foreground: boolean;
}): DeliveryPlan {
  const { now, today, trigger, prefs, notifications, foreground } = input;
  const state: DeliveryState = {
    delivered: { ...input.state.delivered },
    lastByKind: { ...input.state.lastByKind },
    day: today,
    voiceToday: input.state.day === today ? input.state.voiceToday : 0,
    celebrationVoiceToday: input.state.day === today ? input.state.celebrationVoiceToday : 0,
  };
  for (const [id, at] of Object.entries(state.delivered)) if (now - at > KEEP_DELIVERED_MS) delete state.delivered[id];

  const seen = new Set<string>();
  let candidates = input.events.filter((e) => {
    if (seen.has(e.id) || state.delivered[e.id]) return false;
    seen.add(e.id);
    if (e.pref && notifications[e.pref] === false) return false;
    if (prefs.criticalOnly && e.severity !== 'critical') return false;
    // Coach désactivé : seules les réactions immédiates de budget restent (comportement antérieur).
    if (!prefs.enabled && !(trigger === 'write' && e.kind.startsWith('envelope_'))) return false;
    // Délai par type : jamais pour un dépassement ni pour l'action que l'utilisateur vient de faire.
    if (trigger === 'open' && e.severity !== 'critical') {
      const last = state.lastByKind[e.kind];
      if (last && now - last < COOLDOWN_HOURS[prefs.frequency] * HOUR) return false;
    }
    return true;
  });
  candidates = candidates.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  // Au plus un événement d'un même type par diffusion (le plus prioritaire).
  const kinds = new Set<string>();
  candidates = candidates.filter((e) => (kinds.has(e.kind) && e.severity !== 'critical' ? false : (kinds.add(e.kind), true)));
  const show = trigger === 'open' ? candidates.slice(0, MAX_AT_OPEN[prefs.frequency]) : candidates;

  for (const e of show) {
    state.delivered[e.id] = now;
    state.lastByKind[e.kind] = now;
  }

  const top = show[0] ?? null;
  const quiet = prefs.silent || !prefs.enabled || !foreground;
  let voice: CoachEvent | null = null;
  let sessionVoiceUsed = input.sessionVoiceUsed;
  if (top && !quiet && prefs.voice !== 'off') {
    const important = top.severity === 'critical' || top.severity === 'celebration';
    const allowedByPref = prefs.voice === 'all' || important;
    const withinCaps =
      top.severity === 'critical' ||
      (!sessionVoiceUsed && state.voiceToday < VOICE_PER_DAY && (top.severity !== 'celebration' || state.celebrationVoiceToday < 1));
    if (allowedByPref && withinCaps) {
      voice = top;
      sessionVoiceUsed = true;
      if (top.severity !== 'critical') state.voiceToday += 1;
      if (top.severity === 'celebration') state.celebrationVoiceToday += 1;
    }
  }
  const sound = top && !quiet && prefs.soundVolume > 0 ? (SOUND[top.severity] ?? null) : null;
  return { show, summary: trigger === 'open' && show.length > 1, voice, sound, state, sessionVoiceUsed };
}
