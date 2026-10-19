/**
 * Vocabulaire de l'IA, construit À PARTIR DE L'APPLICATION (docs/ia-comprend-tout.md §2.0).
 * Module PUR : recalculé sur le téléphone à chaque ouverture, jamais envoyé à un serveur.
 *
 *  - catalogue des catégories et sous-catégories (libellés fr ET en, mots-clés, mots appris) ;
 *  - données de la personne, avec leurs vrais noms : enveloppes, objectifs, réserves, moments
 *    forts, tontines, comptes, dettes et créances, récurrences, biens ;
 *  - rubriques de l'application (`sections.ts`).
 *
 * Rapprochement tolérant : accents, majuscules, pluriels, petites fautes de frappe (une lettre sur
 * un mot de 5 lettres ou plus), articles et possessifs ignorés (« ma voiture » → « Voiture »).
 * Deux correspondances aussi bonnes → c'est à l'appelant de poser une question (§4).
 */
import { EMBEDDED_CATALOG, catalogEntry, type CategoryCatalog } from '../categoryCatalog';
import { keywordIndex, type KeywordTarget } from '../entry/keywords';
import { isReserve, isSeason } from '../reserve';
import { normalizeText } from './parser';
import { SECTIONS } from './sections';
import type { SpaceData } from '../types';

export type EntityKind = 'category' | 'envelope' | 'goal' | 'reserve' | 'season' | 'tontine' | 'account' | 'debt' | 'recurring' | 'asset' | 'section';

export interface VocabEntry {
  kind: EntityKind;
  id: string;
  /** Nom affiché (celui de la personne, ou le libellé de l'application). */
  label: string;
  /** Façons de le dire : chaque variante est une suite de mots significatifs. */
  variants: string[][];
  /** Catégorie : parent d'une sous-catégorie. */
  parentId?: string | null;
}

export interface Vocabulary {
  entries: VocabEntry[];
  /** Mots-clés des catégories (catalogue, mots de la personne, mots appris) : `core/entry/keywords`. */
  keywords: KeywordTarget[];
}

export interface EntityRef {
  kind: EntityKind;
  id: string;
  label: string;
}

/** Mots vides : articles, possessifs, liaisons (fr + en). */
const STOP = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'et', 'a', 'au', 'aux', 'en', 'pour', 'sur', 'dans', 'avec', 'par', 'chez', 'ce', 'cet', 'cette', 'ces',
  'the', 'my', 'your', 'of', 'to', 'for', 'on', 'in', 'at', 'and', 'an',
]);

/** Mots qui désignent la SORTE d'élément, pas l'élément lui-même (« ma tontine » ne nomme aucune tontine). */
export const GENERIC_WORDS: Partial<Record<EntityKind, string[]>> = {
  tontine: ['tontine', 'tontines'],
  account: ['compte', 'comptes', 'account'],
  goal: ['objectif', 'objectifs', 'projet', 'goal'],
  reserve: ['reserve', 'reserves'],
  envelope: ['enveloppe', 'enveloppes', 'budget', 'envelope'],
  debt: ['dette', 'dettes', 'pret', 'credit', 'debt', 'loan'],
  season: ['moment', 'fort'],
};

const singular = (w: string) => (w.length > 3 && /[sx]$/.test(w) && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);

/** Mots significatifs d'un texte (normalisé, sans mots vides, au singulier). */
export function tokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9+]+/)
    .filter((w) => w && !STOP.has(w))
    .map(singular);
}

/** Distance d'édition bornée (tolérance aux fautes de frappe). */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Deux mots se valent : égaux, ou une seule faute sur un mot de 5 lettres ou plus. */
export function sameWord(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && within1(a, b));
}

function addEntry(out: VocabEntry[], kind: EntityKind, id: string, label: string, extra: string[] = [], parentId?: string | null) {
  const variants = [label, ...extra].map(tokens).filter((v) => v.length);
  if (variants.length) out.push({ kind, id, label, variants, ...(parentId !== undefined ? { parentId } : null) });
}

export interface VocabularyOptions {
  /** Libellé d'une catégorie dans la langue de l'application (noms personnalisés compris). */
  categoryLabel?: (id: string) => string;
  catalog?: CategoryCatalog;
}

/** Vocabulaire de l'espace actif. */
export function buildVocabulary(
  d: Pick<SpaceData, 'categories' | 'envelopes' | 'goals' | 'tontines' | 'accounts' | 'debts' | 'recurring' | 'assets'>,
  opts: VocabularyOptions = {},
): Vocabulary {
  const cat = opts.catalog ?? EMBEDDED_CATALOG;
  const out: VocabEntry[] = [];
  const live = d.categories.filter((c) => !c.deleted && c.disabled !== true);
  const byId = new Map(live.map((c) => [c.id, c]));
  const labelsOf = (id: string): string[] => {
    const e = catalogEntry(id, cat);
    return [opts.categoryLabel?.(id) ?? '', e?.label.fr ?? '', e?.label.en ?? ''].filter((x) => x && x !== id);
  };
  for (const c of live) {
    if (c.parentId && !byId.has(c.parentId)) continue;
    const own = labelsOf(c.id);
    if (!own.length) continue;
    // Sous-catégorie : aussi « <libellé> <parent> » (« autres transport », « eau maison »),
    // pour distinguer « Autres » ou « Eau » d'une catégorie à l'autre.
    const parents = c.parentId ? labelsOf(c.parentId) : [];
    const first = (p: string) => tokens(p)[0] ?? '';
    const qualified = parents.flatMap((p) => own.flatMap((l) => [`${l} ${p}`, `${l} ${first(p)}`]));
    // « Autres » / « Other » seul ne désigne aucune catégorie : seulement « autres transport »…
    const bare = c.parentId && own.every((l) => /^(autres?|other)$/i.test(l.trim()));
    const entry = { kind: 'category' as const, id: c.id, label: own[0], parentId: c.parentId ?? null, variants: [...(bare ? [] : own), ...qualified].map(tokens).filter((v) => v.length) };
    if (entry.variants.length) out.push(entry);
  }
  for (const e of d.envelopes) if (!e.deleted && e.active) addEntry(out, 'envelope', e.id, e.name);
  for (const g of d.goals) {
    if (g.deleted || g.status === 'archived' || g.status === 'abandoned') continue;
    addEntry(out, isReserve(g) ? 'reserve' : isSeason(g) ? 'season' : 'goal', g.id, g.name);
  }
  for (const t of d.tontines) if (!t.deleted) addEntry(out, 'tontine', t.id, t.name);
  for (const a of d.accounts) {
    if (a.deleted || !a.active) continue;
    // Noms courants des opérateurs, en plus du nom donné par la personne.
    const alias: Record<string, string[]> = {
      orange_money: ['orange money', 'om', 'orange'],
      mtn_momo: ['mtn', 'momo', 'mtn money'],
      moov_money: ['moov', 'flooz', 'moov money'],
      wave: ['wave'],
    };
    const extra = [...(alias[a.provider] ?? []), ...(a.type === 'cash' ? ['especes', 'cash', 'liquide'] : []), ...(a.type === 'bank' ? ['banque', 'bank'] : []), ...(a.isSavings ? ['epargne', 'compte epargne', 'savings'] : [])];
    addEntry(out, 'account', a.id, a.name, extra);
  }
  for (const x of d.debts) if (!x.deleted && x.status !== 'closed') addEntry(out, 'debt', x.id, x.counterparty);
  for (const r of d.recurring) if (!r.deleted) addEntry(out, 'recurring', r.id, r.label);
  for (const a of d.assets) if (!a.deleted) addEntry(out, 'asset', a.id, a.name);
  for (const s of SECTIONS) out.push({ kind: 'section', id: s.id, label: s.labelKey, variants: s.words.map((w) => w.split(' ').filter((x) => x && !STOP.has(x)).map(singular)).filter((v) => v.length) });
  return { entries: out, keywords: keywordIndex(d.categories, cat) };
}

export interface EntityMatch {
  entry: VocabEntry;
  /** Lettres reconnues (le plus spécifique l'emporte). */
  score: number;
  /** Tous les mots d'une variante sont dans la phrase. */
  full: boolean;
}

/**
 * Éléments d'une sorte cités dans la phrase, du plus sûr au moins sûr. Une variante est
 * complète si TOUS ses mots (hors mots génériques de la sorte) sont dans la phrase ; sinon,
 * un mot distinctif de 4 lettres ou plus suffit à une correspondance partielle.
 */
export function matchEntities(text: string, vocab: Vocabulary, kinds: EntityKind[]): EntityMatch[] {
  const words = tokens(text);
  const out: EntityMatch[] = [];
  for (const entry of vocab.entries) {
    if (!kinds.includes(entry.kind)) continue;
    const generic = new Set(GENERIC_WORDS[entry.kind] ?? []);
    let best: EntityMatch | null = null;
    for (const v of entry.variants) {
      const distinct = v.filter((w) => !generic.has(w));
      const wanted = distinct.length ? distinct : v;
      const hit = wanted.filter((w) => words.some((x) => sameWord(x, w)));
      if (!hit.length) continue;
      // Complète seulement si TOUS les mots sont là, mot générique du nom compris (« famille »
      // seul ne nomme pas « Réserve famille » ; « ma tontine » ne nomme aucune tontine).
      const genericOk = v.filter((w) => generic.has(w)).every((w) => words.includes(w)) || !distinct.length;
      const full = hit.length === wanted.length && genericOk;
      if (!full && !hit.some((w) => w.length >= 4)) continue;
      const score = hit.reduce((n, w) => n + w.length, 0) + (full ? 100 : 0);
      if (!best || score > best.score) best = { entry, score, full };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Meilleure correspondance unique, ou plusieurs ex æquo (ambiguïté), ou aucune. */
export function bestEntity(text: string, vocab: Vocabulary, kinds: EntityKind[]): { one: VocabEntry | null; tied: VocabEntry[] } {
  const m = matchEntities(text, vocab, kinds);
  if (!m.length) return { one: null, tied: [] };
  const top = m.filter((x) => x.score === m[0].score).map((x) => x.entry);
  return top.length === 1 ? { one: top[0], tied: [] } : { one: null, tied: top };
}

export const toRef = (e: VocabEntry): EntityRef => ({ kind: e.kind, id: e.id, label: e.label });

/** Tous les éléments d'une sorte (options d'une question « Laquelle ? »). */
export function entitiesOf(vocab: Vocabulary, kind: EntityKind): VocabEntry[] {
  return vocab.entries.filter((e) => e.kind === kind);
}
