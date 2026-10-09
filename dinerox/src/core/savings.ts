/**
 * « Mon épargne » (1.8) — calculs PURS des mouvements d'épargne.
 *
 * Deux notions bien distinctes :
 *  - « Mon épargne » = l'ACTION et l'ENDROIT : les comptes où l'argent est mis
 *    de côté. On y VERSE, on y RETIRE, on y AJUSTE le solde ;
 *  - « Objectif d'épargne » = le DÉFI (cible, date). Un versement PEUT
 *    l'alimenter (contribution liée au versement : jamais comptée deux fois).
 *
 * Verser :
 *  - depuis un de mes comptes → TRANSFERT (le compte source baisse, l'épargne
 *    monte ; ni revenu ni dépense) ;
 *  - argent déjà sur le compte d'épargne (virement direct de l'employeur,
 *    solde jamais saisi) → AJUSTEMENT DE SOLDE (`adjustment`) : ni revenu ni
 *    dépense, les analyses ne bougent pas.
 * Retirer : transfert vers un compte courant, ou dépense directe (catégorie).
 */
import type { Account, Goal, GoalContribution, Transaction } from './types';
import { accountBalance, goalSaved } from './balance';
import { isValidAmount } from './money';
import { isISODate } from './dates';

export type SavingsError =
  | 'amount.invalid'
  | 'date.invalid'
  | 'account.missing'
  | 'account.inactive'
  | 'savings.notSavings'
  | 'transfer.sameAccount'
  | 'transfer.currencyMismatch'
  | 'savings.goalPartTooBig'
  | 'savings.insufficient'
  | 'goal.withdrawTooMuch'
  | 'goal.inactive';

export interface DepositInput {
  savingsAccountId: string;
  amount: number;
  date: string;
  /** Compte d'où vient l'argent ; null = argent déjà sur le compte d'épargne (ajustement). */
  fromAccountId: string | null;
  /** Part affectée à un objectif (≤ montant). */
  goal?: { goalId: string; amount: number } | null;
}

export interface WithdrawInput {
  savingsAccountId: string;
  amount: number;
  date: string;
  /** Vers un compte courant (transfert) ; null = dépense directe (catégorie obligatoire). */
  toAccountId: string | null;
  categoryId?: string | null;
  /** Part retirée d'un objectif (garde-fou : jamais plus que ce qui y est affecté). */
  goal?: { goalId: string; amount: number } | null;
}

type Data = { accounts: Account[]; transactions: Transaction[]; goals: Goal[]; goalContributions: GoalContribution[] };

const live = (accounts: Account[], id: string | null | undefined) => accounts.find((a) => a.id === id && !a.deleted);

/** Contrôle d'un versement : chaque refus a un message compréhensible (`error.<code>`). */
export function validateDeposit(i: DepositInput, d: Data): SavingsError[] {
  const errors: SavingsError[] = [];
  if (!isValidAmount(i.amount)) errors.push('amount.invalid');
  if (!isISODate(i.date)) errors.push('date.invalid');
  const sav = live(d.accounts, i.savingsAccountId);
  if (!sav) return [...errors, 'account.missing'];
  if (!sav.isSavings) errors.push('savings.notSavings');
  if (!sav.active) errors.push('account.inactive');
  if (i.fromAccountId) {
    const from = live(d.accounts, i.fromAccountId);
    if (!from) errors.push('account.missing');
    else {
      if (from.id === sav.id) errors.push('transfer.sameAccount');
      if (!from.active) errors.push('account.inactive');
      if (from.currency !== sav.currency) errors.push('transfer.currencyMismatch');
    }
  }
  if (i.goal) {
    const g = d.goals.find((x) => x.id === i.goal!.goalId && !x.deleted);
    if (!g || (g.status !== 'active' && g.status !== 'paused')) errors.push('goal.inactive');
    if (!isValidAmount(i.goal.amount) || i.goal.amount > i.amount) errors.push('savings.goalPartTooBig');
  }
  return [...new Set(errors)];
}

/** Contrôle d'un retrait : jamais plus que le solde du compte, ni que l'objectif. */
export function validateWithdraw(i: WithdrawInput, d: Data): SavingsError[] {
  const errors: SavingsError[] = [];
  if (!isValidAmount(i.amount)) errors.push('amount.invalid');
  if (!isISODate(i.date)) errors.push('date.invalid');
  const sav = live(d.accounts, i.savingsAccountId);
  if (!sav) return [...errors, 'account.missing'];
  if (!sav.isSavings) errors.push('savings.notSavings');
  if (isValidAmount(i.amount) && i.amount > accountBalance(sav, d.transactions)) errors.push('savings.insufficient');
  if (i.toAccountId) {
    const to = live(d.accounts, i.toAccountId);
    if (!to) errors.push('account.missing');
    else {
      if (to.id === sav.id) errors.push('transfer.sameAccount');
      if (!to.active) errors.push('account.inactive');
      if (to.currency !== sav.currency) errors.push('transfer.currencyMismatch');
    }
  }
  if (i.goal) {
    const g = d.goals.find((x) => x.id === i.goal!.goalId && !x.deleted);
    if (!g || (g.status !== 'active' && g.status !== 'paused')) errors.push('goal.inactive');
    else if (i.goal.amount > goalSaved(g, d.goalContributions)) errors.push('goal.withdrawTooMuch');
    if (i.goal.amount > i.amount) errors.push('savings.goalPartTooBig');
  }
  return [...new Set(errors)];
}

/** « Ajuster le solde » : écart entre le solde réel saisi et le solde calculé (null si aucun). */
export function adjustmentFor(current: number, real: number): { direction: 'in' | 'out'; amount: number } | null {
  const diff = Math.round(real) - Math.round(current);
  if (diff === 0) return null;
  return { direction: diff > 0 ? 'in' : 'out', amount: Math.abs(diff) };
}

/** Mouvements d'un compte (versements, retraits, ajustements, opérations), du plus récent au plus ancien. */
export function accountMovements(accountId: string, transactions: Transaction[]): Transaction[] {
  return transactions
    .filter((t) => !t.deleted && (t.accountId === accountId || t.toAccountId === accountId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** Effet d'un mouvement sur le solde d'un compte (+ entrée, − sortie). */
export function movementEffect(t: Transaction, accountId: string): number {
  if (t.type === 'adjustment') return t.accountId === accountId ? (t.direction === 'out' ? -t.amount : t.amount) : 0;
  if (t.type === 'income') return t.accountId === accountId ? t.amount : 0;
  if (t.type === 'expense') return t.accountId === accountId ? -t.amount : 0;
  let n = 0;
  if (t.accountId === accountId) n -= t.amount;
  if (t.toAccountId === accountId) n += t.toAmount ?? t.amount;
  return n;
}

/**
 * Part d'objectif liée à un mouvement, après modification de ce mouvement.
 * Une part COMPLÈTE (tout le montant allait à l'objectif) suit le nouveau
 * montant ; une part PARTIELLE (1.8 : « 5 000 sur 20 000 pour la Moto ») est
 * gardée, sans jamais dépasser le nouveau montant. Signe conservé (retrait < 0).
 */
export function linkedPartAfterEdit(part: number, before: number | null, after: number): number {
  const abs = Math.abs(part);
  const next = before === null || abs === before ? after : Math.min(abs, after);
  return part < 0 ? -next : next;
}
