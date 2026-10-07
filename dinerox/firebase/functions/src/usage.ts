/**
 * Statistiques d'usage de la SAISIE (écran d'administration) — logique PURE.
 * Uniquement des comptages agrégés d'événements anonymes : jamais de montant,
 * de texte prononcé, de bénéficiaire ni de catégorie (ils ne sont d'ailleurs
 * jamais collectés).
 */
export const ENTRY_METHODS = ['voice', 'text_phrase', 'quick_manual', 'full_form'] as const;
export const MIC_ROUTES = ['entry', 'assistant', 'ambiguous'] as const;
export const HISTORY_SOURCES = ['home', 'toast', 'more', 'account', 'envelope'] as const;

export type EntryMethod = (typeof ENTRY_METHODS)[number];

export interface EntryCounts {
  created: Record<EntryMethod, number>;
  voiceCorrected: number;
  voiceFailed: number;
  reminderOpened: number;
  micRouted: Record<(typeof MIC_ROUTES)[number], number>;
  historyOpened: Record<(typeof HISTORY_SOURCES)[number], number>;
}

export interface EntryUsage extends EntryCounts {
  total: number;
  /** Part de chaque méthode (%, arrondie), 0 sans saisie. */
  shares: Record<EntryMethod, number>;
  /** Saisies vocales corrigées sur la carte de confirmation (%), null sans saisie vocale. */
  voiceCorrectionRate: number | null;
}

export function entryUsage(c: EntryCounts): EntryUsage {
  const total = ENTRY_METHODS.reduce((n, m) => n + c.created[m], 0);
  const shares = Object.fromEntries(ENTRY_METHODS.map((m) => [m, total ? Math.round((c.created[m] / total) * 100) : 0])) as Record<EntryMethod, number>;
  const voice = c.created.voice;
  return { ...c, total, shares, voiceCorrectionRate: voice ? Math.round((Math.min(c.voiceCorrected, voice) / voice) * 100) : null };
}

/** Comptage d'événements : `event`, éventuellement filtré sur une propriété (`props.<clé>` = valeur). */
export type EventCounter = (event: string, prop?: [string, string]) => Promise<number>;

/** Requête minimale (Firestore) : égalités uniquement, servies sans index composite. */
interface Countable {
  where(field: string, op: '==', value: string): Countable;
  count(): { get(): Promise<{ data(): { count: number } }> };
}

/** Compteur sur la collection `analyticsEvents` (agrégation côté serveur, aucun document lu). */
export function firestoreCounter(events: Countable): EventCounter {
  return (event, prop) => {
    let q = events.where('event', '==', event);
    if (prop) q = q.where(`props.${prop[0]}`, '==', prop[1]);
    return q.count().get().then((s) => s.data().count);
  };
}

/** Tous les comptages de la saisie, en parallèle. */
export async function collectEntryCounts(count: EventCounter): Promise<EntryCounts> {
  const [created, voiceCorrected, voiceFailed, reminderOpened, routed, history] = await Promise.all([
    Promise.all(ENTRY_METHODS.map((m) => count('entry_created', ['method', m]))),
    count('voice_entry_corrected'),
    count('voice_entry_failed'),
    count('daily_reminder_opened'),
    Promise.all(MIC_ROUTES.map((r) => count('mic_routed', ['to', r]))),
    Promise.all(HISTORY_SOURCES.map((s) => count('history_opened', ['source', s]))),
  ]);
  return {
    created: Object.fromEntries(ENTRY_METHODS.map((m, i) => [m, created[i]])) as EntryCounts['created'],
    voiceCorrected,
    voiceFailed,
    reminderOpened,
    micRouted: Object.fromEntries(MIC_ROUTES.map((r, i) => [r, routed[i]])) as EntryCounts['micRouted'],
    historyOpened: Object.fromEntries(HISTORY_SOURCES.map((x, i) => [x, history[i]])) as EntryCounts['historyOpened'],
  };
}
