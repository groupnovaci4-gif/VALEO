/**
 * Mots de la saisie vocale et écrite liés aux catégories (1.8) — PUR,
 * déterministe, sur l'appareil (aucune IA, rien n'est envoyé).
 *
 * Priorité, pour une phrase donnée :
 *   0. mots APPRIS des corrections de l'utilisateur (le plus récent gagne) ;
 *   1. mots saisis par l'utilisateur (« quand je dis… ») ;
 *   2. mots-clés du catalogue, pour les catégories installées par le catalogue
 *      (un espace pas encore mis à jour garde exactement le comportement d'avant) ;
 *   3. vocabulaire local (`vocabulary.json`, géré par le parseur).
 * À rang égal, le mot le plus long l'emporte (« pass internet » avant « internet »).
 * Une catégorie désactivée (ou dont le parent l'est) n'est jamais proposée.
 */
import type { Category } from '../types';
import { EMBEDDED_CATALOG, catalogEntry, normalizeWord, type CategoryCatalog } from '../categoryCatalog';

export interface KeywordTarget {
  word: string;
  kind: 'income' | 'expense';
  categoryId: string;
  subcategoryId: string | null;
  rank: 0 | 1 | 2;
}

/** Index des mots des catégories de l'espace. */
export function keywordIndex(categories: Category[], cat: CategoryCatalog = EMBEDDED_CATALOG): KeywordTarget[] {
  const live = new Map(categories.filter((c) => !c.deleted && c.disabled !== true).map((c) => [c.id, c]));
  const out: KeywordTarget[] = [];
  for (const c of live.values()) {
    if (c.parentId && !live.has(c.parentId)) continue;
    const target = { kind: c.kind, categoryId: c.parentId ?? c.id, subcategoryId: c.parentId ? c.id : null };
    for (const w of c.learnedWords ?? []) out.push({ ...target, word: normalizeWord(w), rank: 0 });
    for (const w of c.keywords ?? []) out.push({ ...target, word: normalizeWord(w), rank: 1 });
    if ((c.catalogVersion ?? 0) >= 2) for (const w of catalogEntry(c.id, cat)?.keywords ?? []) out.push({ ...target, word: w, rank: 2 });
  }
  return out.filter((k) => k.word.length >= 2);
}

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, w: string) => new RegExp(`(?:^|[^a-z0-9])${escape(w)}s?(?=$|[^a-z0-9])`).test(text);

/** Meilleure catégorie pour un texte NORMALISÉ (minuscules, sans accents), ou null. */
export function matchKeyword(normalizedText: string, index: KeywordTarget[], kind: 'income' | 'expense'): KeywordTarget | null {
  let best: KeywordTarget | null = null;
  for (const k of index) {
    if (k.kind !== kind || !hasWord(normalizedText, k.word)) continue;
    if (!best || k.rank < best.rank || (k.rank === best.rank && k.word.length > best.word.length)) best = k;
  }
  return best;
}

/** Mots qui ne désignent jamais une catégorie (sens, montants, liaisons, devises). */
const STOP = new Set([
  'j', 'ai', 'je', 'on', 'm', 'a', 'au', 'aux', 'de', 'des', 'du', 'd', 'la', 'le', 'les', 'l', 'un', 'une', 'et', 'pour', 'par', 'avec', 'sur', 'dans', 'en', 'mon', 'ma', 'mes', 'ton', 'ta', 'ce', 'cet', 'cette',
  'paye', 'payer', 'payes', 'achete', 'acheter', 'depense', 'depenses', 'donne', 'envoye', 'recu', 'recus', 'gagne', 'verse', 'mis', 'mise', 'mettre', 'pris', 'prendre', 'fait', 'fais', 'coute', 'cout',
  'francs', 'franc', 'fcfa', 'cfa', 'f', 'xof', 'mille', 'cent', 'cents', 'milles', 'million', 'millions', 'balles', 'eur', 'euros', 'euro',
  'aujourd', 'hui', 'hier', 'ce', 'matin', 'soir', 'midi', 'today', 'yesterday', 'i', 'paid', 'spent', 'bought', 'for', 'the', 'my', 'and', 'of', 'to',
  'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'quinze', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'cent',
]);

/**
 * Mot à retenir d'un extrait corrigé (« Djakarta 1 000 » → « djakarta ») :
 * le premier mot porteur de sens (ni nombre, ni montant, ni liaison), 3 lettres
 * au moins. null si rien de fiable : on n'apprend jamais au hasard.
 */
export function learnableWord(source: string): string | null {
  const words = normalizeWord(source)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const w of words) {
    if (/\d/.test(w) || w.length < 3 || STOP.has(w)) continue;
    return w;
  }
  return null;
}

/**
 * Apprentissage après correction : le mot rejoint la catégorie choisie et
 * quitte les autres (la dernière correction l'emporte). Renvoie les documents
 * à écrire (vide si rien ne change).
 */
export function learnWord(categories: Category[], word: string, targetId: string): Category[] {
  const w = normalizeWord(word);
  const out: Category[] = [];
  for (const c of categories) {
    if (c.deleted) continue;
    const has = (c.learnedWords ?? []).includes(w);
    if (c.id === targetId && !has) out.push({ ...c, learnedWords: [...(c.learnedWords ?? []), w].slice(-50) });
    else if (c.id !== targetId && has) out.push({ ...c, learnedWords: (c.learnedWords ?? []).filter((x) => x !== w) });
  }
  return out;
}
