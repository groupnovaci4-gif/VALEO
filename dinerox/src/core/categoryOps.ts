/**
 * Gestion des catégories par l'utilisateur (1.8) — calculs PURS : usage,
 * fusion (« Déplacer ses opérations vers… »), rétablissement par défaut,
 * listes de choix (recherche, récentes en premier, masquées).
 *
 * Règles :
 *  - une catégorie JAMAIS utilisée peut être supprimée (après confirmation) ;
 *  - une catégorie utilisée ne se supprime pas directement : fusion vers une
 *    autre (aperçu du nombre d'opérations, confirmation) ou désactivation ;
 *  - une catégorie SYSTÈME n'est jamais supprimée : « Supprimer » la masque
 *    (identifiants, rapports et saisie vocale restent stables) ; « Rétablir par
 *    défaut » lui rend son libellé, son emoji et sa couleur d'origine.
 */
import type { Category, Envelope, RecurringRule, SpaceData, Transaction } from './types';
import { CATALOG_LABEL_PREFIX, EMBEDDED_CATALOG, catalogDoc, catalogEntry, normalizeWord, shownByDefault, type CategoryCatalog } from './categoryCatalog';
import { subcategoriesFor, subcategoryLabel } from './catalog';
import { SAVING_CATEGORY_IDS } from './savingsFlows';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './defaults';

export interface CategoryUsage {
  transactions: number;
  recurring: number;
  envelopes: number;
  /** Sous-catégories (non supprimées). */
  children: number;
}

type Data = Pick<SpaceData, 'transactions' | 'recurring' | 'envelopes' | 'categories'>;

const touches = (id: string) => (x: { categoryId?: string | null; subcategoryId?: string | null; deleted?: boolean }) => !x.deleted && (x.categoryId === id || x.subcategoryId === id);

export function categoryUsage(id: string, data: Data): CategoryUsage {
  return {
    transactions: data.transactions.filter(touches(id)).length,
    recurring: data.recurring.filter(touches(id)).length,
    envelopes: data.envelopes.filter((e) => !e.deleted && e.categoryIds.includes(id)).length,
    children: data.categories.filter((c) => !c.deleted && c.parentId === id).length,
  };
}

/** Utilisée = au moins une opération ou une récurrence (elle-même ou ses sous-catégories). */
export function isCategoryUsed(id: string, data: Data): boolean {
  const ids = [id, ...data.categories.filter((c) => !c.deleted && c.parentId === id).map((c) => c.id)];
  return ids.some((x) => data.transactions.some(touches(x)) || data.recurring.some(touches(x)));
}

/** Ce que « Supprimer » fera : suppression réelle, masquage (système) ou choix fusion / désactivation. */
export function deleteMode(c: Pick<Category, 'id' | 'system'>, data: Data): 'delete' | 'hide' | 'merge_or_disable' {
  if (c.system) return 'hide';
  return isCategoryUsed(c.id, data) ? 'merge_or_disable' : 'delete';
}

export interface MergePlan {
  /** Opérations déplacées (documents complets, prêts à écrire). */
  transactions: Transaction[];
  recurring: RecurringRule[];
  envelopes: Envelope[];
  /** Sous-catégories rattachées à la cible (fusion d'une catégorie principale). */
  children: Category[];
  /** La catégorie fusionnée (supprimée si personnelle, masquée si système), mots repris par la cible. */
  source: Category;
  target: Category;
}

/**
 * « Déplacer ses opérations vers… » : chaque opération et récurrence de
 * `fromId` (et de ses sous-catégories) passe sur la cible ; les enveloppes qui
 * citaient `fromId` citent la cible ; les sous-catégories suivent ; les mots de
 * la saisie vocale passent à la cible. Aucune opération orpheline.
 */
export function planMerge(fromId: string, toId: string, data: Data): MergePlan | null {
  const from = data.categories.find((c) => c.id === fromId && !c.deleted);
  const to = data.categories.find((c) => c.id === toId && !c.deleted);
  if (!from || !to || from.id === to.id || from.kind !== to.kind) return null;
  // Une catégorie ne peut pas être fusionnée dans sa propre sous-catégorie.
  if (to.parentId === from.id) return null;
  const toParent = to.parentId ?? to.id;
  const toSub = to.parentId ? to.id : null;
  const fromIsParent = !from.parentId;
  const move = <T extends { categoryId?: string | null; subcategoryId?: string | null }>(x: T): T => {
    if (x.subcategoryId === from.id) return { ...x, categoryId: toParent, subcategoryId: toSub };
    if (fromIsParent && x.categoryId === from.id) {
      // Sous-catégorie de la source : elle suit la source (rattachée à la cible), sauf si la cible est une sous-catégorie.
      return { ...x, categoryId: toParent, subcategoryId: toSub ?? x.subcategoryId ?? null };
    }
    return x;
  };
  const transactions = data.transactions.filter(touches(from.id)).map(move);
  const recurring = data.recurring.filter(touches(from.id)).map(move);
  const envelopes = data.envelopes
    .filter((e) => !e.deleted && e.categoryIds.includes(from.id))
    .map((e) => ({ ...e, categoryIds: [...new Set(e.categoryIds.map((id) => (id === from.id ? toParent : id)))] }));
  const children = fromIsParent ? data.categories.filter((c) => !c.deleted && c.parentId === from.id).map((c) => ({ ...c, parentId: toParent })) : [];
  // Les opérations des sous-catégories (gardées) suivent leur sous-catégorie.
  if (fromIsParent && !toSub) {
    for (const ch of children) {
      for (const t of data.transactions.filter((x) => !x.deleted && x.subcategoryId === ch.id && x.categoryId !== toParent)) {
        if (!transactions.some((m) => m.id === t.id)) transactions.push({ ...t, categoryId: toParent });
      }
    }
  }
  const words = [...new Set([...(to.keywords ?? []), ...(from.keywords ?? [])])];
  const learned = [...new Set([...(to.learnedWords ?? []), ...(from.learnedWords ?? [])])];
  return {
    transactions,
    recurring,
    envelopes,
    children,
    source: { ...from, keywords: [], learnedWords: [], ...(from.system ? { disabled: true } : {}) },
    target: { ...to, keywords: words, learnedWords: learned },
  };
}

/** Libellé, emoji et couleur d'origine d'une catégorie système (catalogue 1.8, sinon catégories d'avant). */
export function restoreDefaults(c: Category, cat: CategoryCatalog = EMBEDDED_CATALOG): Category {
  const e = catalogEntry(c.id, cat);
  if (e) {
    const parent = e.parentId ? catalogEntry(e.parentId, cat) : undefined;
    const { disabled: _d, ...rest } = c;
    void _d;
    return { ...rest, name: '', labelKey: CATALOG_LABEL_PREFIX + c.id, emoji: e.emoji, color: e.color ?? parent?.color ?? c.color, icon: e.icon ?? parent?.icon ?? c.icon, parentId: e.parentId, spendKind: e.bucket };
  }
  const seed = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((s) => s.id === c.id);
  const { disabled: _d, ...rest } = c;
  void _d;
  return seed ? { ...rest, name: '', labelKey: seed.key, color: seed.color, icon: seed.icon } : rest;
}

/** Peut-on « Rétablir par défaut » ? (catégorie système modifiée ou masquée). */
export function canRestore(c: Category, cat: CategoryCatalog = EMBEDDED_CATALOG): boolean {
  if (!c.system) return false;
  const d = restoreDefaults(c, cat);
  return c.disabled === true || (c.name ?? '') !== d.name || c.emoji !== d.emoji || c.color !== d.color || (c.parentId ?? null) !== (d.parentId ?? null);
}

export interface PickOptions {
  kind: 'income' | 'expense';
  /** « Afficher toutes les catégories ». */
  showAll: boolean;
  query: string;
  /** Identifiants récents (le plus récent d'abord). */
  recent: string[];
  label: (id: string) => string;
  profile?: Parameters<typeof shownByDefault>[1]['profile'];
  /** L'espace a reçu le catalogue 1.8 (une catégorie y porte `catalogVersion`). */
  spaceOnCatalog: boolean;
  used: Set<string>;
  /** Toujours proposer celle-ci (catégorie déjà choisie). */
  keep?: string | null;
}

/**
 * Catégories PRINCIPALES proposées dans une liste de choix : visibles par
 * défaut (ou toutes), filtrées par la recherche (nom de la catégorie ou de ses
 * sous-catégories), récentes en premier puis ordre de l'utilisateur.
 */
export function pickCategories(categories: Category[], o: PickOptions): Category[] {
  const q = normalizeWord(o.query);
  const ctx = { profile: o.profile, spaceOnCatalog: o.spaceOnCatalog, used: o.used };
  // « Afficher toutes » montre les catégories masquées par défaut (profil, anciennes) ; une
  // catégorie DÉSACTIVÉE par l'utilisateur reste hors des choix (il la réactive dans Catégories).
  const visible = (c: Category) => c.id === o.keep || (c.disabled !== true && (o.showAll || shownByDefault(c, ctx)));
  const parents = categories.filter((c) => !c.deleted && c.kind === o.kind && !c.parentId && visible(c));
  const matches = (c: Category) =>
    !q || normalizeWord(o.label(c.id)).includes(q) || categories.some((s) => s.parentId === c.id && !s.deleted && normalizeWord(o.label(s.id)).includes(q)) || (c.keywords ?? []).some((w) => w.includes(q));
  const rank = (c: Category) => {
    const r = o.recent.indexOf(c.id);
    return r === -1 ? Number.MAX_SAFE_INTEGER : r;
  };
  return parents.filter(matches).sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

/** Sous-catégories proposées sous une catégorie principale (mêmes règles de visibilité). */
export function pickSubcategories(categories: Category[], parentId: string, o: Omit<PickOptions, 'kind' | 'recent'>): Category[] {
  const q = normalizeWord(o.query);
  const ctx = { profile: o.profile, spaceOnCatalog: o.spaceOnCatalog, used: o.used };
  return categories
    .filter((c) => !c.deleted && c.parentId === parentId && (c.id === o.keep || (c.disabled !== true && (o.showAll || shownByDefault(c, ctx)))))
    .filter((c) => !q || normalizeWord(o.label(c.id)).includes(q) || normalizeWord(o.label(parentId)).includes(q))
    .sort((a, b) => a.order - b.order);
}

/** Nouvel ordre après un glisser-déposer : `id` placé à l'index `to` (ordres 0..n-1, seuls ceux qui changent). */
export function reorder(list: Pick<Category, 'id' | 'order'>[], id: string, to: number): { id: string; order: number }[] {
  const ids = [...list].sort((a, b) => a.order - b.order).map((c) => c.id);
  const from = ids.indexOf(id);
  if (from === -1) return [];
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
  const before = new Map(list.map((c) => [c.id, c.order]));
  return ids.map((x, i) => ({ id: x, order: i })).filter((x) => before.get(x.id) !== x.order);
}

/** Mots de la saisie (« quand je dis… ») : normalisés, sans doublon, 2 à 40 caractères. */
export function cleanKeywords(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[,;\n]/);
  return [...new Set(list.map(normalizeWord).filter((w) => w.length >= 2 && w.length <= 40))].slice(0, 30);
}

export interface LibraryItem {
  id: string;
  parentId: string | null;
  /** Libellé à afficher (langue de l'utilisateur). */
  label: string;
  /** Document à écrire si l'utilisateur l'ajoute. */
  doc: Category;
}

/**
 * Bibliothèque « Ajouter une catégorie du catalogue » : ce que l'espace n'a pas
 * (ou plus) — catalogue 1.8, puis anciennes catégories (ex. « Impôts »),
 * JAMAIS « Épargne » ni « Investissement ». Une sous-catégorie n'est proposée
 * que si sa catégorie principale est présente.
 */
export function libraryItems(categories: Category[], o: { country: string | null | undefined; zone: 'africa' | 'europe' | 'other' | null; lang: 'fr' | 'en'; now: number; uid: string }, cat: CategoryCatalog = EMBEDDED_CATALOG): LibraryItem[] {
  const live = new Set(categories.filter((c) => !c.deleted).map((c) => c.id));
  const meta = { now: o.now, uid: o.uid };
  const out: LibraryItem[] = [];
  const seen = new Set<string>();
  const push = (item: LibraryItem) => {
    if (live.has(item.id) || seen.has(item.id) || SAVING_CATEGORY_IDS.has(item.id) || cat.retired.includes(item.id)) return;
    seen.add(item.id);
    out.push({ ...item, doc: { ...item.doc, deleted: false } });
  };
  const nextOrder = Math.max(0, ...categories.filter((c) => c.kind === 'expense' && !c.parentId).map((c) => c.order)) + 1;
  for (const e of [...cat.entries].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || a.sortOrder - b.sortOrder)) {
    if (e.parentId && !live.has(e.parentId)) continue;
    push({ id: e.id, parentId: e.parentId, label: e.label[o.lang], doc: catalogDoc(e, { ...meta, order: e.parentId ? e.sortOrder : nextOrder + out.length }, cat) });
  }
  for (const s of EXPENSE_CATEGORIES) {
    if (s.zones && o.zone && !s.zones.includes(o.zone)) continue;
    push({ id: s.id, parentId: null, label: '', doc: { id: s.id, kind: 'expense', name: '', labelKey: s.key, icon: s.icon, color: s.color, order: nextOrder + out.length, system: true, createdAt: o.now, updatedAt: o.now, createdBy: o.uid } });
  }
  if (o.country && o.zone) {
    for (const sc of subcategoriesFor(o.country, o.zone)) {
      if (!live.has(sc.parent)) continue;
      push({ id: sc.id, parentId: sc.parent, label: subcategoryLabel(sc, o.lang, o.country), doc: { id: sc.id, kind: 'expense', name: subcategoryLabel(sc, o.lang, o.country), icon: 'ellipse', color: '#94A3B8', order: 99, parentId: sc.parent, ...(sc.fixed ? { fixed: true } : {}), createdAt: o.now, updatedAt: o.now, createdBy: o.uid } });
    }
  }
  return out;
}
