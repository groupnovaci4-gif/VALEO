/**
 * « À lire » (refonte finale B5, E1 à E4) — module pur, testé (tests/etape5-notifications.test.ts).
 * Tous les messages du coach au même endroit : alertes (budget…), conseil du jour, points de
 * « Votre coach » (échéances, rappels…) et « Votre analyse ». Aucun calcul d'argent ici : les
 * textes viennent des moteurs existants (insights, coach, recommandations).
 *  - E1 : un message lu (× ou « Écouter » arrivé à la fin) disparaît ;
 *  - E2 : s'il est toujours d'actualité, il revient UNE fois en rappel après 3 jours (ou la veille
 *    de son échéance), jamais en permanence ; une situation nouvelle a un nouvel identifiant ;
 *  - E3 : sans doublon dans une même liste (même identifiant, même enveloppe, même conseil) ;
 *  - E4 : mémorisation locale par identifiant (`services/readState`).
 */
export type ToReadKind = 'budget' | 'advice' | 'coach' | 'analysis';
export type ToReadTone = 'danger' | 'warning' | 'advice' | 'info';

export interface ToReadItem {
  /** Identifiant déterministe du fait (même fait = même identifiant). */
  id: string;
  kind: ToReadKind;
  tone: ToReadTone;
  /** Texte affiché ET lu par « Écouter ». */
  text: string;
  /** Écran ouvert par un toucher sur le message (comme avant). */
  link?: string | null;
  /** Échéance (AAAA-MM-JJ) : rappel possible la veille. */
  dueDate?: string | null;
  /** Clés de dédoublonnage : identifiant, « envelope:<id> », « rec:<sorte> »… */
  keys: string[];
}

export interface ReadRecord {
  readAt: number;
  readDay: string;
  /** Le rappel unique a déjà été montré puis lu. */
  reminded?: boolean;
}
export type ReadStore = Record<string, ReadRecord>;

export const REMIND_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;
const KEEP_DAYS = 60;

/** Fusion dans l'ordre donné, sans doublon : un message dont une clé a déjà été vue est écarté. */
export function mergeToRead(groups: ToReadItem[][]): ToReadItem[] {
  const seen = new Set<string>();
  const out: ToReadItem[] = [];
  for (const g of groups) {
    for (const x of g) {
      const keys = [x.id, ...x.keys];
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));
      out.push(x);
    }
  }
  return out;
}

/** Veille d'une date AAAA-MM-JJ (calendrier, sans fuseau). */
function eveOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

/** Messages à montrer maintenant ; `reminder` : c'est le rappel unique. */
export function visibleToRead(items: ToReadItem[], store: ReadStore, now: number, today: string): (ToReadItem & { reminder: boolean })[] {
  const out: (ToReadItem & { reminder: boolean })[] = [];
  for (const x of items) {
    const rec = store[x.id];
    if (!rec) {
      out.push({ ...x, reminder: false });
      continue;
    }
    if (rec.reminded) continue;
    if (now - rec.readAt >= REMIND_AFTER_DAYS * DAY_MS) {
      out.push({ ...x, reminder: true });
      continue;
    }
    if (x.dueDate) {
      const eve = eveOf(x.dueDate);
      if (today >= eve && today <= x.dueDate && rec.readDay < eve) out.push({ ...x, reminder: true });
    }
  }
  return out;
}

/** Marque un message comme lu ; lu pendant son rappel : il ne revient plus jamais. */
export function markRead(store: ReadStore, x: { id: string; reminder: boolean }, now: number, today: string): ReadStore {
  return { ...store, [x.id]: { readAt: now, readDay: today, ...(x.reminder ? { reminded: true } : null) } };
}

/** Mémoire locale bornée : on oublie ce qui a été lu il y a plus de 60 jours. */
export function pruneReadStore(store: ReadStore, now: number): ReadStore {
  const out: ReadStore = {};
  let changed = false;
  for (const [id, rec] of Object.entries(store)) {
    if (now - rec.readAt > KEEP_DAYS * DAY_MS) changed = true;
    else out[id] = rec;
  }
  return changed ? out : store;
}
