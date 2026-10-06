/**
 * Soldes et totaux. Le solde d'un compte n'est JAMAIS stocké : il est dérivé
 * de son solde d'ouverture et des opérations. Deux téléphones hors-ligne ne
 * peuvent donc pas « s'écraser » un solde : chacun ajoute des opérations,
 * qui se fusionnent sans conflit.
 *
 * Règles :
 *  - revenu  : + montant sur `accountId`
 *  - dépense : − montant sur `accountId`
 *  - transfert : − montant sur `accountId`, + (toAmount ?? montant) sur
 *    `toAccountId`. Un transfert n'est NI un revenu NI une dépense.
 */
import type { Account, Goal, GoalContribution, Transaction } from './types';
import type { CurrencyCode } from './money';
import { inPeriod, type ISODate } from './dates';

export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (t.deleted) continue;
    if (t.type === 'income' && t.accountId === account.id) balance += t.amount;
    else if (t.type === 'expense' && t.accountId === account.id) balance -= t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId === account.id) balance -= t.amount;
      if (t.toAccountId === account.id) balance += t.toAmount ?? t.amount;
    }
  }
  return balance;
}

/** Soldes de tous les comptes en un passage (O(n)). */
export function accountBalances(accounts: Account[], transactions: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of accounts) out[a.id] = a.openingBalance;
  for (const t of transactions) {
    if (t.deleted) continue;
    if (t.type === 'income' && t.accountId in out) out[t.accountId] += t.amount;
    else if (t.type === 'expense' && t.accountId in out) out[t.accountId] -= t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId in out) out[t.accountId] -= t.amount;
      if (t.toAccountId && t.toAccountId in out) out[t.toAccountId] += t.toAmount ?? t.amount;
    }
  }
  return out;
}

/** Somme par devise — jamais de conversion implicite. */
export function sumByCurrency(items: { amount: number; currency: CurrencyCode }[]): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {};
  for (const i of items) out[i.currency] = (out[i.currency] ?? 0) + i.amount;
  return out;
}

export interface FlowTotals {
  income: number;
  expense: number;
  /** income − expense. */
  net: number;
  count: number;
}

/**
 * Revenus et dépenses d'une période, dans UNE devise (les opérations d'autres
 * devises sont ignorées et comptées dans `otherCurrencyCount`). Les transferts
 * sont exclus.
 */
export function flowTotals(
  transactions: Transaction[],
  period: { start: ISODate; end: ISODate },
  currency: CurrencyCode,
): FlowTotals & { otherCurrencyCount: number } {
  let income = 0;
  let expense = 0;
  let count = 0;
  let otherCurrencyCount = 0;
  for (const t of transactions) {
    if (t.deleted || t.type === 'transfer' || !inPeriod(t.date, period)) continue;
    if (t.currency !== currency) {
      otherCurrencyCount++;
      continue;
    }
    count++;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense, count, otherCurrencyCount };
}

/** Montant actuellement affecté à un objectif = déjà disponible + contributions nettes. */
export function goalSaved(goal: Goal, contributions: GoalContribution[]): number {
  let saved = goal.initialAmount;
  for (const c of contributions) if (!c.deleted && c.goalId === goal.id) saved += c.amount;
  return Math.max(0, saved);
}

export interface MoneyPosition {
  /** Somme des soldes des comptes actifs non-épargne, dans la devise principale. */
  available: number;
  /** Somme des comptes d'épargne actifs. */
  savings: number;
  /** Argent affecté aux objectifs (information : il peut être dans l'épargne ou mis de côté). */
  allocatedToGoals: number;
  /** Partie de l'affecté qui n'est PAS dans un compte d'épargne dédié : à retirer du disponible. */
  earmarkedInSpending: number;
  /** Disponible réellement libre : available − earmarkedInSpending (peut être négatif). */
  free: number;
  /** Soldes dans d'autres devises, non convertis. */
  otherCurrencies: Partial<Record<CurrencyCode, number>>;
}

/**
 * Distingue l'argent DISPONIBLE de l'argent AFFECTÉ aux objectifs.
 *
 * Un objectif n'est jamais compté comme de l'argent disponible :
 *  - une contribution accompagnée d'un transfert vers un compte d'épargne
 *    est déjà sortie du disponible (elle est dans `savings`) ;
 *  - une contribution « mise de côté » sans déplacer l'argent reste dans un
 *    compte de dépense : on la soustrait du disponible pour obtenir `free`.
 */
export function moneyPosition(
  accounts: Account[],
  transactions: Transaction[],
  goals: Goal[],
  contributions: GoalContribution[],
  currency: CurrencyCode,
): MoneyPosition {
  const balances = accountBalances(accounts, transactions);
  let available = 0;
  let savings = 0;
  const otherCurrencies: Partial<Record<CurrencyCode, number>> = {};
  for (const a of accounts) {
    if (a.deleted || !a.active) continue;
    const b = balances[a.id] ?? 0;
    if (a.currency !== currency) {
      otherCurrencies[a.currency] = (otherCurrencies[a.currency] ?? 0) + b;
      continue;
    }
    if (a.isSavings) savings += b;
    else available += b;
  }
  let allocatedToGoals = 0;
  let earmarkedInSpending = 0;
  const activeGoals = new Map<string, Goal>();
  for (const g of goals) {
    if (g.deleted || g.currency !== currency) continue;
    if (g.status === 'archived' || g.status === 'abandoned') continue;
    activeGoals.set(g.id, g);
    allocatedToGoals += goalSaved(g, contributions);
  }
  // Seules les contributions « mises de côté » SANS transfert restent physiquement
  // dans les comptes de dépense : on les retire du disponible libre. (Une
  // contribution avec transfert a déjà quitté ces comptes.) Le calcul se fait
  // PAR OBJECTIF et borné à [0, montant de l'objectif] : le retrait d'un objectif
  // ne peut pas « libérer » l'argent réservé à un autre.
  const perGoal = new Map<string, number>();
  for (const c of contributions) {
    if (c.deleted || c.transferId || !activeGoals.has(c.goalId)) continue;
    perGoal.set(c.goalId, (perGoal.get(c.goalId) ?? 0) + c.amount);
  }
  for (const [goalId, amount] of perGoal) {
    const g = activeGoals.get(goalId)!;
    earmarkedInSpending += Math.min(Math.max(0, amount), goalSaved(g, contributions));
  }
  return {
    available,
    savings,
    allocatedToGoals,
    earmarkedInSpending,
    free: available - earmarkedInSpending,
    otherCurrencies,
  };
}
