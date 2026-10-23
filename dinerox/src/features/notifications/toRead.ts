/**
 * « À lire » (refonte finale B5, E1 à E4) — module pur, testé (tests/etape5-notifications.test.ts).
 * Tous les messages du coach au même endroit : alertes (budget…), conseil du jour, points de
 * « Votre coach » (échéances, rappels…) et « Votre analyse ». Aucun calcul d'argent ici : les
 * textes viennent des moteurs existants (insights, coach, recommandations).
 *  - E1 : un message lu (× ou « Écouter » arrivé à la fin) disparaît ;
 *  - E2 : s'il est toujours d'actualité, il revient UNE fois en rappel après 3 jours (ou la veille
 *    de son échéance), jamais en permanence ; une situation nouvelle a un nouvel identifiant ;
 *  - E3 : sans doublon dans une même liste (même identifiant, même enveloppe, même conseil) ;
 *  - E4 : mémorisation locale (`services/readState`) par espace + identifiant + empreinte du
 *    texte (audit du 23/10, R2 et R3 : `readKeyOf`).
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
  /** Moteur d'origine (identifiant de test `toread-<origine>` ; l'étiquette affichée suit `kind`). */
  origin?: 'insight' | 'summary' | 'advice' | 'analysis';
  /** Sorte du constat (`Insight.kind`) : sert au regroupement (E5). */
  insightKind?: string;
  /** Message regroupé (E5) : les messages qu'il représente (lus ensemble). */
  members?: { id: string; reminder: boolean }[];
  /**
   * Clé de la mémoire « lu » (audit du 23/10, R2 et R3) : espace actif + identifiant + empreinte du
   * texte affiché (`readKeyOf`). Un message dont le texte change, ou vu dans un autre espace, est à
   * lire de nouveau. Absente : l'identifiant.
   */
  readKey?: string;
}

/** Empreinte stable d'un texte (FNV-1a 32 bits, hex). */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** R2 et R3 : clé de lecture = espace actif + identifiant + empreinte du texte affiché. */
export function readKeyOf(spaceId: string | null, id: string, text: string): string {
  return `${spaceId ?? '-'}|${id}|${fingerprint(text)}`;
}

const keyOf = (x: { id: string; readKey?: string }) => x.readKey ?? x.id;

/**
 * E5 (fondateur, 22/10) : sortes de messages d'INFORMATION regroupées quand elles se répètent.
 * Jamais les alertes du budget ni les échéances : la maquette les montre une par une.
 */
export const GROUPABLE_KINDS = ['recurring_payment', 'goal_eta', 'goal_near', 'goal_reached', 'unusual_expense', 'category_increase', 'category_decrease'] as const;

/**
 * Regroupe les messages du même type (au moins 2) en UN message « N … » qui ouvre la liste
 * détaillée (écran Notifications) ; il prend la place du premier. Le texte vient de `groupText`
 * (clé `toRead.group.<sorte>`, FR + EN). À appliquer APRÈS `visibleToRead` (messages non lus).
 */
export function groupToRead<T extends ToReadItem & { reminder?: boolean }>(items: T[], groupText: (kind: string, count: number) => string): T[] {
  const byKind = new Map<string, T[]>();
  for (const x of items) {
    const k = x.insightKind;
    if (k && (GROUPABLE_KINDS as readonly string[]).includes(k)) byKind.set(k, [...(byKind.get(k) ?? []), x]);
  }
  const out: T[] = [];
  const done = new Set<string>();
  for (const x of items) {
    const k = x.insightKind;
    const group = k ? byKind.get(k) : undefined;
    if (!k || !group || group.length < 2) {
      out.push(x);
      continue;
    }
    if (done.has(k)) continue;
    done.add(k);
    // Le groupe n'a pas de clé de lecture propre : lu = chacun de SES messages (jamais un message à venir).
    out.push({ ...x, id: `grp_${k}`, readKey: undefined, text: groupText(k, group.length), link: '/notifications', dueDate: null, keys: [], reminder: group.every((g) => g.reminder), members: group.map((g) => ({ id: keyOf(g), reminder: !!g.reminder })) });
  }
  return out;
}

/** Ce que « lu » marque (clés de lecture) : chaque message d'un groupe, sinon le message lui-même (E1). */
export function readTargets(x: { id: string; readKey?: string; reminder: boolean; members?: { id: string; reminder: boolean }[] }): { id: string; reminder: boolean }[] {
  return x.members?.length ? x.members : [{ id: keyOf(x), reminder: x.reminder }];
}

/** Importance pour l'Accueil (B5bis) : alertes (danger, puis attention), puis échéances, puis le reste. */
const rank = (x: ToReadItem) => (x.tone === 'danger' ? 0 : x.tone === 'warning' ? 1 : x.dueDate ? 2 : 3);

/** B5bis : les `max` messages les plus importants (ordre stable à importance égale) et le total. */
export function homeToRead<T extends ToReadItem>(items: T[], max = 3): { shown: T[]; total: number } {
  const shown = items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
    .slice(0, max)
    .map((e) => e.x);
  return { shown, total: items.length };
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
    const rec = store[keyOf(x)];
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

/** Marque un message comme lu (`x.id` : sa clé de lecture, cf. `readTargets`) ; lu pendant son rappel : il ne revient plus jamais. */
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
