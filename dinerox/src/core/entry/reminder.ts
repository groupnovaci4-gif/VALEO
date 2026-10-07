/**
 * Rappel du soir « Qu'avez-vous dépensé aujourd'hui ? » — planification PURE.
 *
 *  - un rappel par jour à l'heure choisie (20 h par défaut) ;
 *  - aucun rappel le jour où une opération a déjà été saisie ;
 *  - après 7 jours sans aucune saisie : un rappel par semaine seulement ;
 *  - dates précises (et non une répétition) : l'application replanifie à
 *    chaque ouverture et à chaque saisie, ce qui retire le rappel du jour.
 */
export const INACTIVITY_DAYS = 7;
export const DEFAULT_REMINDER_HOUR = 20;
/** Nombre maximal de rappels programmés d'avance (les systèmes limitent le total). */
export const MAX_REMINDERS = 12;

export interface ReminderPlanInput {
  /** Maintenant (ms). */
  now: number;
  enabled: boolean;
  hour: number;
  /** Dernière saisie de l'utilisateur (ms), null si aucune. */
  lastEntryAt: number | null;
  /** Horizon en jours. */
  horizonDays?: number;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
};
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a.getTime()).getTime() - startOfDay(b.getTime()).getTime()) / 86_400_000);

/** Dates (locales) des prochains rappels, dans l'ordre. */
export function planEntryReminders({ now, enabled, hour, lastEntryAt, horizonDays = 63 }: ReminderPlanInput): Date[] {
  if (!enabled) return [];
  const h = Math.min(23, Math.max(0, Math.round(hour)));
  // Jamais de saisie : la « dernière activité » est aujourd'hui (rappels quotidiens d'abord).
  const ref = new Date(lastEntryAt ?? now);
  const out: Date[] = [];
  for (let i = 0; i <= horizonDays && out.length < MAX_REMINDERS; i++) {
    const day = startOfDay(now);
    day.setDate(day.getDate() + i);
    const at = new Date(day);
    at.setHours(h, 0, 0, 0);
    if (at.getTime() <= now) continue; // heure déjà passée
    const since = dayDiff(day, ref);
    if (lastEntryAt !== null && since === 0) continue; // saisie déjà faite ce jour-là
    if (since <= INACTIVITY_DAYS) out.push(at);
    else if ((since - INACTIVITY_DAYS) % 7 === 0) out.push(at); // ensuite : une fois par semaine
  }
  return out;
}

/** Dernière saisie de l'utilisateur : opérations qu'il a créées lui-même (hors récurrences générées). */
export function lastEntryAt(transactions: { createdAt: number; createdBy: string; recurringId?: string | null; deleted?: boolean }[], uid: string): number | null {
  let last: number | null = null;
  for (const t of transactions) {
    if (t.deleted || t.createdBy !== uid || t.recurringId) continue;
    if (last === null || t.createdAt > last) last = t.createdAt;
  }
  return last;
}
