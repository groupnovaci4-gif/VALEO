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
import { isRevenue, spendingAmount, txNature } from './nature';
import { goalBacking, positionOf } from './position';
import { today as todayISO } from './dates';

export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (t.deleted) continue;
    if (t.type === 'income' && t.accountId === account.id) balance += t.amount;
    else if (t.type === 'expense' && t.accountId === account.id) balance -= t.amount;
    else if (t.type === 'adjustment' && t.accountId === account.id) balance += t.direction === 'out' ? -t.amount : t.amount;
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
    else if (t.type === 'adjustment' && t.accountId in out) out[t.accountId] += t.direction === 'out' ? -t.amount : t.amount;
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
  /** Argent mis de côté par des opérations de type dépense (anciennes « dépenses » Épargne, cotisations de tontine) : hors dépenses. */
  savedAsExpense: number;
}

/**
 * Revenus et dépenses d'une période, dans UNE devise (les opérations d'autres
 * devises sont ignorées et comptées dans `otherCurrencyCount`). Les transferts
 * sont exclus. Argent disponible v2 (§2.3) : lus par NATURE (`withLedgerView`) —
 * un emprunt, une cagnotte, un remboursement reçu ne sont jamais des revenus, le
 * capital remboursé jamais une dépense ; un remboursement d'achat vient en déduction.
 */
export function flowTotals(
  transactions: Transaction[],
  period: { start: ISODate; end: ISODate },
  currency: CurrencyCode,
): FlowTotals & { otherCurrencyCount: number } {
  let income = 0;
  let expense = 0;
  let savedAsExpense = 0;
  let count = 0;
  let otherCurrencyCount = 0;
  for (const t of transactions) {
    // Transferts et ajustements de solde : ni revenu ni dépense.
    if (t.deleted || (t.type !== 'income' && t.type !== 'expense') || !inPeriod(t.date, period)) continue;
    if (t.currency !== currency) {
      otherCurrencyCount++;
      continue;
    }
    count++;
    const n = txNature(t);
    if (isRevenue(t)) income += t.amount;
    else expense += spendingAmount(t);
    if (n === 'cotisation_tontine' || n === 'versement_epargne') savedAsExpense += t.amount;
  }
  return { income, expense, net: income - expense, count, otherCurrencyCount, savedAsExpense };
}

/** Montant actuellement affecté à un objectif = déjà disponible + contributions nettes. */
export function goalSaved(goal: Goal, contributions: GoalContribution[]): number {
  let saved = goal.initialAmount;
  for (const c of contributions) if (!c.deleted && c.goalId === goal.id) saved += c.amount;
  return Math.max(0, saved);
}

export interface MoneyPosition {
  /** Somme des soldes des comptes courants qui comptent, dans la devise principale. */
  available: number;
  /** Somme des comptes d'épargne. */
  savings: number;
  /** Argent des objectifs et réserves (adossé à un compte ou hors comptes). */
  allocatedToGoals: number;
  /** Mises de côté sur des comptes courants. */
  earmarkedInSpending: number;
  /** Argent disponible D (§4) : max(0, solde) − mises de côté, opérations jusqu'à aujourd'hui. */
  free: number;
  /** Soldes dans d'autres devises, non convertis. */
  otherCurrencies: Partial<Record<CurrencyCode, number>>;
}

/**
 * Ancienne signature, REDIRIGÉE vers la position v2 (`positionOf`, §4) : un seul calcul de
 * l'argent disponible dans toute l'application.
 */
export function moneyPosition(accounts: Account[], transactions: Transaction[], goals: Goal[], contributions: GoalContribution[], currency: CurrencyCode, today: string = todayISO()): MoneyPosition {
  const d = { accounts, transactions, goals, goalContributions: contributions };
  const p = positionOf(d, currency, today);
  let available = 0;
  let savings = 0;
  let earmarkedInSpending = 0;
  for (const a of Object.values(p.accounts)) {
    if (a.isSavings) savings += a.balance;
    else {
      available += a.balance;
      earmarkedInSpending += a.setAside;
    }
  }
  let allocatedToGoals = 0;
  for (const b of goalBacking(d, currency, today).values()) allocatedToGoals += b.total;
  const otherCurrencies: Partial<Record<CurrencyCode, number>> = {};
  for (const [cur, v] of Object.entries(p.otherCurrencies)) otherCurrencies[cur as CurrencyCode] = v!.totalAccounts;
  return { available, savings, allocatedToGoals, earmarkedInSpending, free: p.available, otherCurrencies };
}
