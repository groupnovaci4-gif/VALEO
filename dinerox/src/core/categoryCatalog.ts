/**
 * Catalogue de catégories de DÉPENSES (1.8) — une DONNÉE, pas du code figé.
 *
 * `categoryCatalog.v2.json` est embarqué dans l'application (hors connexion,
 * il s'applique) ; l'administrateur peut publier une version corrigée dans
 * `config/categories/items/v2` (lecture pour tout utilisateur connecté,
 * écriture administrateur : règles Firestore). La version publiée n'est
 * acceptée que si elle passe `sanitizeCatalog`.
 *
 * Règles :
 *  - identifiants STABLES (`cat_*`, `sub_*`) : réutilisés quand le sens est le
 *    même (rapports, enveloppes, saisie vocale continuent de fonctionner) ;
 *  - un changement de parent ne réécrit JAMAIS l'historique : les opérations
 *    gardent leurs identifiants, `effectiveCategoryId` les compte sous le
 *    parent actuel de leur sous-catégorie (`legacyParentMap` en secours) ;
 *  - pas de catégorie « Épargne » : épargner n'est pas dépenser
 *    (`retired` : jamais proposées, ni au départ ni dans la bibliothèque).
 *
 * Module PUR : aucune lecture réseau ni stockage ici.
 */
import RAW from './categoryCatalog.v2.json';
import type { Category, FinancialProfile, SpendKind, Transaction } from './types';
import type { BudgetBucket } from './budget';

type L = { fr: string; en: string };

/** Règle de profil : `children` = masquée par défaut sans enfant ni personne à charge déclarés. */
export type ProfileRule = 'children';

export interface CatalogEntry {
  id: string;
  parentId: string | null;
  label: L;
  emoji?: string;
  /** Icône Ionicons (catégorie principale) : affichée si l'emoji manque. */
  icon?: string;
  color?: string;
  sortOrder: number;
  bucket: SpendKind;
  /** Compartiment d'enveloppe du budget automatique (catégorie principale). */
  envelope?: Exclude<BudgetBucket, 'needs' | 'wants'> | null;
  /** Pays où elle est proposée au départ (vide = tous les pays du catalogue). */
  countries: string[];
  profileRules: ProfileRule[];
  defaultEnabled: boolean;
  /** Mots de la saisie vocale et écrite (minuscules, sans accents). */
  keywords: string[];
  fixed?: boolean;
}

export interface CategoryCatalog {
  catalogVersion: number;
  /** Pays qui reçoivent CE catalogue au départ (les autres gardent leurs catégories). */
  countries: string[];
  entries: CatalogEntry[];
  /** Sous-catégorie → ancien parent (rattachement changé : alias, aucune réécriture). */
  legacyParentMap: Record<string, string>;
  /** Ancien identifiant de sous-catégorie → identifiant actuel de même sens. */
  subAliases: Record<string, string>;
  /** Catégories qui ne sont plus proposées (jamais supprimées chez qui les a). */
  retired: string[];
}

const ID = /^(cat|sub)_[a-z0-9_]{1,40}$/;
const BUCKETS: SpendKind[] = ['need', 'want', 'obligation', 'debt'];
const ENVELOPES = ['housing', 'food', 'transport', 'family', 'savings', 'project', 'free'];
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => str(x, max)).slice(0, 60) : []);

/**
 * Valide un catalogue (embarqué ou publié) : forme, identifiants stables,
 * parents existants, libellés FR et EN. Rien d'invalide n'est accepté ; un
 * catalogue publié rejeté laisse simplement le catalogue embarqué en place.
 */
export function sanitizeCatalog(x: unknown): CategoryCatalog | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.catalogVersion !== 'number' || o.catalogVersion < 2 || !Array.isArray(o.entries)) return null;
  const entries: CatalogEntry[] = [];
  const ids = new Set<string>();
  for (const raw of o.entries as unknown[]) {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as Record<string, unknown>;
    const label = e.label as Record<string, unknown> | undefined;
    if (!str(e.id, 48) || !ID.test(e.id) || ids.has(e.id) || !label || !str(label.fr, 60) || !str(label.en, 60)) return null;
    if (e.parentId !== null && !(str(e.parentId, 48) && ID.test(e.parentId))) return null;
    ids.add(e.id);
    entries.push({
      id: e.id,
      parentId: (e.parentId as string | null) ?? null,
      label: { fr: label.fr as string, en: label.en as string },
      emoji: str(e.emoji, 16) ? e.emoji : undefined,
      icon: str(e.icon, 40) ? e.icon : undefined,
      color: str(e.color, 16) && /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : undefined,
      sortOrder: typeof e.sortOrder === 'number' ? e.sortOrder : entries.length,
      bucket: BUCKETS.includes(e.bucket as SpendKind) ? (e.bucket as SpendKind) : 'want',
      envelope: ENVELOPES.includes(e.envelope as string) ? (e.envelope as CatalogEntry['envelope']) : null,
      countries: strList(e.countries, 4),
      profileRules: strList(e.profileRules, 20).filter((r): r is ProfileRule => r === 'children'),
      defaultEnabled: e.defaultEnabled !== false,
      keywords: strList(e.keywords, 40).map(normalizeWord),
      fixed: e.fixed === true ? true : undefined,
    });
  }
  // Une sous-catégorie a un parent présent, et un seul niveau.
  for (const e of entries) {
    if (!e.parentId) continue;
    const p = entries.find((x) => x.id === e.parentId);
    if (!p || p.parentId) return null;
  }
  const map = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) if (ID.test(k) && typeof val === 'string' && ID.test(val)) out[k] = val;
    return out;
  };
  return {
    catalogVersion: o.catalogVersion,
    countries: strList(o.countries, 4),
    entries,
    legacyParentMap: map(o.legacyParentMap),
    subAliases: map(o.subAliases),
    retired: strList(o.retired, 48).filter((id) => ID.test(id)),
  };
}

/** Mot de saisie normalisé : minuscules, sans accents, espaces simples. */
export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const EMBEDDED_CATALOG: CategoryCatalog = sanitizeCatalog(RAW)!;

/** Préfixe de `labelKey` des catégories dont le libellé vient du catalogue (traduit, corrigeable à distance). */
export const CATALOG_LABEL_PREFIX = 'catalog:';

/** Le pays reçoit-il ce catalogue au départ ? (sinon : catégories actuelles du pays). */
export function usesCatalog(country: string | null | undefined, cat: CategoryCatalog = EMBEDDED_CATALOG): boolean {
  return !!country && cat.countries.includes(country);
}

export function catalogEntry(id: string, cat: CategoryCatalog = EMBEDDED_CATALOG): CatalogEntry | undefined {
  return cat.entries.find((e) => e.id === id);
}

export function catalogLabel(id: string, lang: 'fr' | 'en', cat: CategoryCatalog = EMBEDDED_CATALOG): string | null {
  return catalogEntry(id, cat)?.label[lang] ?? null;
}

/** Proposée au départ dans ce pays ? (`countries` vide = tous les pays du catalogue). */
export function offeredIn(e: CatalogEntry, country: string | null | undefined): boolean {
  return e.defaultEnabled && (!e.countries.length || (!!country && e.countries.includes(country)));
}

/**
 * Masquée par défaut d'après le profil DÉCLARÉ (jamais supprimée) :
 * `children` → seulement si la situation familiale est renseignée ET 0 enfant
 * ET 0 personne à charge. Une information inconnue ne masque rien.
 */
export function maskedByProfile(e: Pick<CatalogEntry, 'profileRules'> | undefined, profile: Pick<FinancialProfile, 'familyStatus' | 'children' | 'dependents'> | null | undefined): boolean {
  if (!e?.profileRules.length || !profile) return false;
  return e.profileRules.some((r) => r === 'children' && profile.familyStatus != null && (profile.children ?? 0) === 0 && (profile.dependents ?? 0) === 0);
}

/** Documents « catégorie » d'une entrée du catalogue (libellé traduit par le catalogue). */
export function catalogDoc(e: CatalogEntry, meta: { now: number; uid: string; order?: number }, cat: CategoryCatalog = EMBEDDED_CATALOG): Category {
  const parent = e.parentId ? catalogEntry(e.parentId, cat) : undefined;
  return {
    id: e.id,
    kind: 'expense',
    name: '',
    labelKey: CATALOG_LABEL_PREFIX + e.id,
    icon: e.icon ?? parent?.icon ?? 'ellipse',
    color: e.color ?? parent?.color ?? '#94A3B8',
    ...(e.emoji ? { emoji: e.emoji } : {}),
    order: meta.order ?? e.sortOrder,
    system: true,
    parentId: e.parentId,
    ...(e.fixed ? { fixed: true } : {}),
    spendKind: e.bucket,
    catalogVersion: cat.catalogVersion,
    createdAt: meta.now,
    updatedAt: meta.now,
    createdBy: meta.uid,
  };
}

/** Catégories de dépenses installées au départ dans un pays du catalogue (ordre du catalogue). */
export function catalogStarterDocs(country: string, meta: { now: number; uid: string }, cat: CategoryCatalog = EMBEDDED_CATALOG): Category[] {
  const parents = cat.entries.filter((e) => !e.parentId && offeredIn(e, country) && !cat.retired.includes(e.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  const out: Category[] = [];
  for (const p of parents) {
    out.push(catalogDoc(p, meta, cat));
    for (const s of cat.entries.filter((e) => e.parentId === p.id && offeredIn(e, country)).sort((a, b) => a.sortOrder - b.sortOrder)) out.push(catalogDoc(s, meta, cat));
  }
  return out;
}

// ─── Alias : un changement de parent ne réécrit jamais l'historique ──────

/**
 * Catégorie principale sous laquelle une opération est COMPTÉE (rapports,
 * budgets, analyses, export) : le parent actuel de sa sous-catégorie s'il a
 * changé (ex. Tontine passée de « Tontines et cotisations » à « Finance
 * sociale & obligations »), sinon la catégorie enregistrée. L'opération
 * elle-même n'est jamais modifiée.
 */
export function effectiveCategoryId(
  t: Pick<Transaction, 'categoryId' | 'subcategoryId'>,
  byId: Map<string, Pick<Category, 'id' | 'parentId' | 'deleted'>>,
  cat: CategoryCatalog = EMBEDDED_CATALOG,
): string | null {
  const stored = t.categoryId ?? null;
  if (!t.subcategoryId) return stored;
  const sub = byId.get(t.subcategoryId) ?? byId.get(cat.subAliases[t.subcategoryId] ?? '');
  if (sub && !sub.deleted && sub.parentId && sub.parentId !== stored) return sub.parentId;
  // Sous-catégorie absente de l'espace : l'ancien parent n'y existe plus → parent du catalogue.
  if (!sub && stored && cat.legacyParentMap[t.subcategoryId] === stored && !byId.get(stored)) {
    return catalogEntry(t.subcategoryId, cat)?.parentId ?? stored;
  }
  return stored;
}

/** Opération vue sous sa catégorie effective ; `legacyCategoryId` garde l'identifiant enregistré. */
export type ViewTransaction = Transaction & { legacyCategoryId?: string | null };

/**
 * Vue des opérations pour les CALCULS (jamais réécrite en base) : chaque
 * opération dont la sous-catégorie a changé de parent est comptée sous le
 * nouveau parent. Même tableau si rien ne change.
 */
export function effectiveTransactions(transactions: Transaction[], categories: Category[], cat: CategoryCatalog = EMBEDDED_CATALOG): ViewTransaction[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let changed = false;
  const out = transactions.map((t) => {
    if (t.type === 'transfer' || !t.subcategoryId) return t;
    const eff = effectiveCategoryId(t, byId, cat);
    if (eff === (t.categoryId ?? null)) return t;
    changed = true;
    return { ...t, categoryId: eff, legacyCategoryId: t.categoryId ?? null };
  });
  return changed ? out : transactions;
}
