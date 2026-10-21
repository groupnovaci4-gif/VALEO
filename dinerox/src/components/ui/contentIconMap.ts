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

/** Listes d'opérations : la SOUS-catégorie quand l'opération en a une, sinon la catégorie. */
export function transactionIconIds(tx: { subcategoryId?: string | null; categoryId?: string | null }): string[] {
  return [tx.subcategoryId, tx.categoryId].filter((x): x is string => !!x);
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
