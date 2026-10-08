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
import type { Account, Transaction } from './types';

export const SAVING_CATEGORY_IDS: ReadonlySet<string> = new Set(['cat_savings', 'cat_investment']);

/** Ancienne « dépense » d'épargne (jamais convertie automatiquement). */
export function isSavingExpense(t: Pick<Transaction, 'type' | 'categoryId'>): boolean {
  return t.type === 'expense' && !!t.categoryId && SAVING_CATEGORY_IDS.has(t.categoryId);
}

/** Dépense de consommation (dépense hors épargne). */
export function isConsumption(t: Pick<Transaction, 'type' | 'categoryId'>): boolean {
  return t.type === 'expense' && !isSavingExpense(t);
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
