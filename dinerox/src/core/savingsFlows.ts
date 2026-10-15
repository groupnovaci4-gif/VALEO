/**
 * Épargne ≠ consommation (1.8).
 *
 * Les anciennes catégories de DÉPENSE « Épargne » (`cat_savings`) et
 * « Investissement » (`cat_investment`) ne sont plus proposées ; les
 * opérations déjà classées dedans restent intactes et visibles, mais elles
 * sont de l'ÉPARGNE : elles n'entrent ni dans les dépenses, ni dans le reste
 * par jour, ni dans les analyses de consommation, le score ou le coach.
 * L'épargne passe désormais par des versements (transferts) vers des comptes
 * d'épargne (« Mon épargne »).
 */
import type { Account, GoalContribution, TontineEntry, Transaction } from './types';
import { TONTINE_SUBCATEGORY } from './tontine';

export const SAVING_CATEGORY_IDS: ReadonlySet<string> = new Set(['cat_savings', 'cat_investment']);

/** Ancienne « dépense » d'épargne (jamais convertie automatiquement). */
export function isSavingExpense(t: Pick<Transaction, 'type' | 'categoryId'>): boolean {
  return t.type === 'expense' && !!t.categoryId && SAVING_CATEGORY_IDS.has(t.categoryId);
}

/**
 * Sous-catégories d'ÉPARGNE de la finance sociale (décision du fondateur, 2026-10-14) :
 * « Tontine » et « Épargne communautaire ». Jamais « Cotisation », « Association »,
 * « Prêt à un proche », ni une ancienne opération rangée SANS sous-catégorie (on ne sait
 * pas si c'était une tontine ou une cotisation d'association : elle reste une dépense).
 */
export const CIRCLE_SUBCATEGORY_IDS: ReadonlySet<string> = new Set([TONTINE_SUBCATEGORY, 'sub_informal_community']);

/**
 * Cotisation de tontine ou épargne communautaire. D'abord le LIEN avec une tontine (carnet ou
 * tontine partagée, `tontineId`) — reconnu dans tous les pays —, sinon la sous-catégorie, retrouvée
 * PAR IDENTIFIANT, jamais par libellé.
 */
export function isTontineContribution(t: { type: string; categoryId?: string | null; subcategoryId?: string | null; tontineId?: string | null }): boolean {
  if (t.type !== 'expense') return false;
  return !!t.tontineId || (!!t.subcategoryId && CIRCLE_SUBCATEGORY_IDS.has(t.subcategoryId));
}

/**
 * Vue des calculs : une cotisation du carnet enregistrée AVANT le lien `tontineId` est reconnue par
 * son échéance (`tontineEntries.transactionId`). Rien n'est réécrit : seule la vue porte le lien.
 */
export function withTontineLinks<T extends Pick<Transaction, 'id' | 'type' | 'tontineId'>>(transactions: T[], entries: Pick<TontineEntry, 'deleted' | 'kind' | 'transactionId' | 'tontineId'>[]): T[] {
  const linked = new Map<string, string>();
  for (const e of entries) if (!e.deleted && e.kind === 'contribution' && e.transactionId) linked.set(e.transactionId, e.tontineId);
  if (!linked.size) return transactions;
  return transactions.map((t) => (t.type === 'expense' && !t.tontineId && linked.has(t.id) ? { ...t, tontineId: linked.get(t.id) as string } : t));
}

/**
 * LE critère unique du cercle fermé (fondateur, 2026-10-14) : une opération
 * de type dépense qui n'est PAS une dépense de consommation, mais de l'argent
 * mis de côté (cotisation de tontine, ancienne « dépense » Épargne). Utilisé
 * par TOUS les calculs : dépenses, rapports, export, budget, reste par jour,
 * score, coach, conseils, résumé de l'assistant, analyse.
 */
export function isCircleMovement(t: Pick<Transaction, 'type' | 'categoryId'> & { subcategoryId?: string | null; tontineId?: string | null }): boolean {
  return isSavingExpense(t) || isTontineContribution(t);
}

/** Dépense de consommation (dépense hors argent mis de côté). */
export function isConsumption(t: Pick<Transaction, 'type' | 'categoryId'> & { subcategoryId?: string | null; tontineId?: string | null }): boolean {
  return t.type === 'expense' && !isCircleMovement(t);
}

/** Opérations payées par un objectif (contribution négative liée : réserve, cotisation payée depuis un objectif). */
export function goalFundedIds(contributions: Pick<GoalContribution, 'deleted' | 'amount' | 'linkedTransactionId'>[]): Set<string> {
  return new Set(contributions.filter((c) => !c.deleted && c.amount < 0 && !!c.linkedTransactionId).map((c) => c.linkedTransactionId as string));
}

/**
 * Une cotisation sort-elle du DISPONIBLE ? Oui si payée depuis un compte
 * courant ; non si payée depuis un compte d'épargne ou un objectif (mouvement
 * à l'intérieur du cercle : ni le disponible ni le reste par jour ne changent).
 */
export function circlePaidFromAvailable(t: Pick<Transaction, 'id' | 'accountId'>, savings: Set<string>, goalFunded: Set<string>): boolean {
  return !savings.has(t.accountId) && !goalFunded.has(t.id);
}

/** Identifiants des comptes d'épargne (actifs ou non : un versement passé reste un versement). */
export function savingsAccountIds(accounts: Pick<Account, 'id' | 'isSavings' | 'deleted'>[]): Set<string> {
  return new Set(accounts.filter((a) => a.isSavings && !a.deleted).map((a) => a.id));
}

/**
 * Versement d'épargne : transfert d'un compte courant VERS un compte d'épargne
 * (un mouvement entre deux comptes d'épargne n'en est pas un).
 */
export function isSavingsDeposit(t: Pick<Transaction, 'type' | 'accountId' | 'toAccountId'>, savings: Set<string>): boolean {
  return t.type === 'transfer' && !!t.toAccountId && savings.has(t.toAccountId) && !savings.has(t.accountId);
}

/** Retrait d'épargne : transfert d'un compte d'épargne vers un compte courant. */
export function isSavingsWithdrawal(t: Pick<Transaction, 'type' | 'accountId' | 'toAccountId'>, savings: Set<string>): boolean {
  return t.type === 'transfer' && !!t.toAccountId && savings.has(t.accountId) && !savings.has(t.toAccountId);
}

/** Données d'un espace avec la vue des cotisations liées (`withTontineLinks`) : pour les calculs qui lisent le moteur directement. */
export function withCircleView<D extends { transactions: Transaction[]; tontineEntries: TontineEntry[] }>(d: D): D {
  const transactions = withTontineLinks(d.transactions, d.tontineEntries);
  return transactions === d.transactions ? d : { ...d, transactions };
}
