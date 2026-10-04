/**
 * Validation des opérations et des transferts — appliquée AVANT tout
 * enregistrement (et reprise côté serveur dans firestore.rules).
 */
import type { Account, Transaction, TransactionType } from './types';
import { isValidAmount } from './money';
import { isISODate } from './dates';

export type TxError =
  | 'amount.invalid'
  | 'date.invalid'
  | 'account.missing'
  | 'account.inactive'
  | 'transfer.sameAccount'
  | 'transfer.missingTarget'
  | 'transfer.currencyMismatch'
  | 'currency.mismatch';

export interface TxDraft {
  type: TransactionType;
  amount: number;
  date: string;
  accountId: string;
  toAccountId?: string | null;
  toAmount?: number | null;
  currency: string;
}

/**
 * Renvoie la liste des erreurs (vide si valide).
 * Transfert entre devises différentes : autorisé UNIQUEMENT si l'utilisateur
 * saisit le montant reçu (`toAmount`) — DineroX n'invente jamais de taux.
 */
export function validateTransaction(draft: TxDraft, accounts: Account[]): TxError[] {
  const errors: TxError[] = [];
  if (!isValidAmount(draft.amount)) errors.push('amount.invalid');
  if (!isISODate(draft.date)) errors.push('date.invalid');
  const from = accounts.find((a) => a.id === draft.accountId && !a.deleted);
  if (!from) errors.push('account.missing');
  else {
    if (!from.active) errors.push('account.inactive');
    if (from.currency !== draft.currency) errors.push('currency.mismatch');
  }
  if (draft.type === 'transfer') {
    if (!draft.toAccountId) errors.push('transfer.missingTarget');
    else if (draft.toAccountId === draft.accountId) errors.push('transfer.sameAccount');
    else {
      const to = accounts.find((a) => a.id === draft.toAccountId && !a.deleted);
      if (!to) errors.push('transfer.missingTarget');
      else if (!to.active) errors.push('account.inactive');
      else if (from && to.currency !== from.currency && !isValidAmount(draft.toAmount)) errors.push('transfer.currencyMismatch');
    }
  }
  return errors;
}

/** Tri antichronologique stable : date puis heure de création. */
export function sortTransactions(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export interface TxFilter {
  type?: TransactionType | 'all';
  accountId?: string;
  categoryId?: string;
  envelopeId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export function filterTransactions(list: Transaction[], f: TxFilter, labelOf?: (t: Transaction) => string): Transaction[] {
  const q = f.search?.trim().toLowerCase();
  return list.filter((t) => {
    if (t.deleted) return false;
    if (f.type && f.type !== 'all' && t.type !== f.type) return false;
    if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.envelopeId && t.envelopeId !== f.envelopeId) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (q) {
      const hay = `${t.payee ?? ''} ${t.note ?? ''} ${labelOf?.(t) ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
