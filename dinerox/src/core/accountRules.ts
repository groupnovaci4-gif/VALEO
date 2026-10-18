/**
 * Cycle de vie d'un compte et correction de solde — argent disponible v2
 * (docs/argent-disponible.md §3.2, §3.3). Module PUR (testé : tests/argent-comptes-coach.test.ts).
 *
 * Aucun compte n'est désactivé, supprimé, ni ne change de devise ou de famille
 * (courant ↔ épargne) avec un solde : on transfère d'abord, ou on constate une perte.
 * Le solde n'est jamais réécrit : une correction crée un AJUSTEMENT de l'écart,
 * avec un motif (l'ouverture reste telle quelle).
 */
import type { Account, Transaction } from './types';

type Tx = Pick<Transaction, 'deleted' | 'accountId' | 'toAccountId'>;
const usedBy = (accountId: string, transactions: Tx[]) => transactions.some((t) => !t.deleted && (t.accountId === accountId || t.toAccountId === accountId));

/** Désactiver : seulement à solde 0 (sinon « Transférer le reste vers… » ou « Constater une perte »). */
export function canDeactivate(balance: number): boolean {
  return balance === 0;
}

/** Supprimer : seulement sans opération ET avec une ouverture à 0 (sinon on désactive d'abord). */
export function canDeleteAccount(account: Pick<Account, 'id' | 'openingBalance'>, transactions: Tx[]): boolean {
  return account.openingBalance === 0 && !usedBy(account.id, transactions);
}

/** Changer la devise : interdit dès la première écriture ou dès une ouverture différente de 0. */
export function canChangeCurrency(account: Pick<Account, 'id' | 'openingBalance'>, transactions: Tx[]): boolean {
  return canDeleteAccount(account, transactions);
}

/** Passer en épargne (ou l'inverse) : seulement à solde 0 (les calculs passés ne doivent pas changer). */
export function canToggleSavings(balance: number): boolean {
  return balance === 0;
}

/** « Corriger le solde » : l'ajustement de l'ÉCART entre le solde affiché et le solde réel constaté (null : rien à corriger). */
export function balanceCorrection(current: number, actual: number): { direction: 'in' | 'out'; amount: number } | null {
  if (!Number.isInteger(current) || !Number.isInteger(actual) || current === actual) return null;
  return actual > current ? { direction: 'in', amount: actual - current } : { direction: 'out', amount: current - actual };
}

/**
 * Modification d'un compte (§3.1, §3.3) : refus si elle change la devise d'un compte utilisé,
 * sa famille (courant ↔ épargne) ou le désactive avec un solde, ou réécrit l'ouverture
 * après la première opération (« Corriger le solde » à la place). null : accepté.
 */
export function accountChangeRules(
  before: Pick<Account, 'id' | 'currency' | 'isSavings' | 'active' | 'openingBalance'>,
  draft: Pick<Account, 'currency' | 'isSavings' | 'active' | 'openingBalance'>,
  balance: number,
  transactions: Tx[],
): 'account.notEmpty' | 'account.currencyLocked' | 'account.openingLocked' | null {
  if (draft.currency !== before.currency && !canChangeCurrency(before, transactions)) return 'account.currencyLocked';
  if (!!draft.isSavings !== !!before.isSavings && !canToggleSavings(balance)) return 'account.notEmpty';
  if (before.active && !draft.active && !canDeactivate(balance)) return 'account.notEmpty';
  if (draft.openingBalance !== before.openingBalance && usedBy(before.id, transactions)) return 'account.openingLocked';
  return null;
}
