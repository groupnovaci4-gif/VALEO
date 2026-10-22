/**
 * Icônes de CONTENU (design-pro, docs/design-system.md › Icônes) — module pur, testé
 * (tests/design-pro-system.test.ts). Contenu = catégories, sous-catégories, comptes, objectifs,
 * réserves, tontines… : Fluent Emoji 3D (MIT) et icônes composées validées par le fondateur.
 * Navigation et actions restent au trait (Ionicons, `Icon`).
 * Une icône inconnue (catégorie créée par la personne, emoji libre) n'a pas d'icône 3D : l'écran
 * garde son rendu actuel (emoji ou icône au trait). Aucune donnée n'est modifiée.
 */
import type { AccountProvider, AccountType } from '@/core/types';
import bundledOperators from '@/config/operators.json';
import dictionary from '@/config/dictionnaire-icones.json';
import { ICON_BY_EMOJI, ICON_BY_ID } from './contentIcons.generated';

export { CONTENT_ICON_SLUGS } from './contentIcons.generated';

const norm = (g: string) => g.replace(/️/g, '');

/**
 * Icône 3D d'un contenu : l'emoji choisi par la personne d'abord (objectifs, réserves), puis les
 * identifiants dans l'ordre donné (sous-catégorie avant catégorie). `null` : aucune icône 3D.
 */
export function iconSlugFor({ ids = [], emoji }: { ids?: (string | null | undefined)[]; emoji?: string | null }): string | null {
  if (emoji) {
    const e = ICON_BY_EMOJI[norm(emoji)];
    if (e) return e;
  }
  for (const id of ids) if (id && ICON_BY_ID[id]) return ICON_BY_ID[id];
  return null;
}

/** Emoji donné par défaut à une réserve (démo, création rapide, catalogue). */
const DEFAULT_RESERVE_EMOJI = '🤝';

/**
 * Icône d'une réserve (étape 4) : l'icône validée de la réserve (famille + cœur) ; un emoji
 * CHOISI par la personne (autre que celui par défaut) reste prioritaire.
 */
export function reserveIcon(r: { icon?: string | null; templateId?: string | null }): { emoji: string | null; ids: (string | null | undefined)[] } {
  const chosen = r.icon && r.icon !== DEFAULT_RESERVE_EMOJI ? r.icon : null;
  return { emoji: chosen, ids: ['reserve', r.templateId] };
}

/**
 * Icône d'une enveloppe (étape 4) : celle de sa première catégorie ; une enveloppe « fourre-tout »
 * qui regroupe « Autres » (`cat_other`, comme « Libre ») prend l'icône de « Autres » (sacs de
 * courses) plutôt que celle des loisirs. Par IDENTIFIANT, jamais par libellé.
 */
export function envelopeIconIds(categoryIds: string[]): string[] {
  return categoryIds.length > 1 && categoryIds.includes('cat_other') ? ['cat_other'] : categoryIds.slice(0, 1);
}

/** Listes d'opérations : la SOUS-catégorie quand l'opération en a une, sinon la catégorie. */
export function transactionIconIds(tx: { subcategoryId?: string | null; categoryId?: string | null }): string[] {
  return [tx.subcategoryId, tx.categoryId].filter((x): x is string => !!x);
}

/** Sans majuscules ni accents ; apostrophe typographique = apostrophe simple. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Mots-clés du dictionnaire, prêts à chercher (mot ENTIER : ni lettre ni chiffre autour).
 * Les notes (« objectif « Ma moto » ») ne sont pas des mots-clés.
 */
const KEYWORDS = dictionary.entrees.flatMap((e, order) =>
  e.motsCles
    .filter((k) => !k.includes('«'))
    .map((k) => {
      const key = fold(k);
      return { slug: e.icone, order, length: key.length, re: new RegExp(`(^|[^a-z0-9])${escapeRe(key)}(?=$|[^a-z0-9])`) };
    }),
);

/**
 * Refonte finale A4 : icône donnée par un LIBELLÉ (`src/config/dictionnaire-icones.json`, 50 entrées).
 * Plusieurs mots-clés trouvés : le premier dans le libellé, puis le plus long (« recharge gaz » avant
 * « recharge »), puis l'ordre du dictionnaire. `null` : aucun mot-clé.
 */
export function labelIconSlug(label: string | null | undefined): string | null {
  if (!label) return null;
  const text = fold(label);
  let best: { slug: string; at: number; length: number; order: number } | null = null;
  for (const k of KEYWORDS) {
    const m = k.re.exec(text);
    if (!m) continue;
    const at = m.index + m[1].length;
    if (!best || at < best.at || (at === best.at && (k.length > best.length || (k.length === best.length && k.order < best.order)))) best = { slug: k.slug, at, length: k.length, order: k.order };
  }
  return best?.slug ?? null;
}

/**
 * Refonte finale A4 — icône d'une OPÉRATION, dans l'ordre : libellé → objectif lié (son nom, puis
 * son icône) → sous-catégorie → catégorie → type. `null` : l'icône de type actuelle (virement,
 * ajustement, financement…) reste affichée par l'écran. `categories` : faux pour un virement, un
 * ajustement ou un financement (leur catégorie n'est pas leur sens).
 */
export function transactionIconSlug(
  tx: { type: string; payee?: string | null; subcategoryId?: string | null; categoryId?: string | null },
  goal?: { name?: string | null; icon?: string | null; templateId?: string | null; categoryId?: string | null } | null,
  categories: boolean = tx.type === 'expense' || tx.type === 'income',
): string | null {
  const byLabel = labelIconSlug(tx.payee);
  if (byLabel) return byLabel;
  if (goal) {
    const g = labelIconSlug(goal.name) ?? iconSlugFor({ emoji: goal.icon, ids: [goal.templateId, goal.categoryId ? `goal.${goal.categoryId}` : null] });
    if (g) return g;
  }
  return categories ? iconSlugFor({ ids: transactionIconIds(tx) }) : null;
}

export interface OperatorData {
  operateurs: { id: string; provider?: string; affichage: string; logo: string | null; pastille: { initiales: string; fond: string; texte: string } }[];
}

export type AccountMark = { kind: 'logo'; operator: string } | { kind: 'pill'; operator: string; initials: string; background: string; color: string } | { kind: '3d'; slug: string } | null;

/** Type de compte → ligne de la planche (« acc.* »). */
const ACCOUNT_KEY: Partial<Record<AccountType, string>> = { cash: 'acc.cash', bank: 'acc.bank', savings: 'acc.savings', card: 'acc.card', investment: 'acc.investment', mobile_money: 'acc.mobile' };

/**
 * Marque d'un compte : logo ou pastille de l'opérateur (réglage par opérateur dans
 * `config/operators.json`, remplaçable à distance), sinon l'icône 3D de son type.
 */
export function accountMark(account: { type: AccountType; provider: AccountProvider }, data: OperatorData = bundledOperators): AccountMark {
  const op = data.operateurs.find((o) => o.provider === account.provider);
  if (op) {
    if (op.affichage === 'logo' && op.logo) return { kind: 'logo', operator: op.id };
    return { kind: 'pill', operator: op.id, initials: op.pastille.initiales, background: op.pastille.fond, color: op.pastille.texte };
  }
  if (account.provider === 'tontine') return { kind: '3d', slug: ICON_BY_ID['acc.tontine'] };
  const key = ACCOUNT_KEY[account.type];
  return key && ICON_BY_ID[key] ? { kind: '3d', slug: ICON_BY_ID[key] } : null;
}

/**
 * Réglage publié à distance (`config/operators/items/v1`, écrit par l'administrateur) :
 * `{ affichage: { orange: 'pastille', … } }`. Seul le choix logo / pastille peut changer à
 * distance (les fichiers des logos sont embarqués) ; toute autre valeur est ignorée.
 */
export function withOperatorOverrides(base: OperatorData, remote: unknown): OperatorData {
  const aff = (remote as { affichage?: unknown } | null)?.affichage;
  if (!aff || typeof aff !== 'object') return base;
  const map = aff as Record<string, unknown>;
  return {
    operateurs: base.operateurs.map((o) => {
      const v = map[o.id];
      return v === 'logo' || v === 'pastille' ? { ...o, affichage: v } : o;
    }),
  };
}
