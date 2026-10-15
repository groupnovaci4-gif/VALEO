/**
 * L'ARGENT MIS DE CÔTÉ — cercle fermé (règle du fondateur, 2026-10-14).
 * Module PUR (testé : tests/savings-circle.test.ts).
 *
 * 1. Comptes d'épargne (Épargne, Investissement, compte Tontine), objectifs,
 *    tontines et réserve forment un cercle : cet argent n'est jamais
 *    disponible pour les dépenses.
 * 2. Dans le cercle, l'argent circule librement (ce n'est pas une dépense) :
 *    une cotisation de tontine peut être payée depuis l'épargne ou un objectif.
 * 3. Une dépense n'est JAMAIS prise sur un compte d'épargne, ni par défaut ni
 *    par choix : il faut d'abord retirer l'argent vers un compte courant.
 * 4. Exception inchangée : la réserve famille paie ce pour quoi elle existe
 *    (la dépense reste sur un compte courant, liée à la réserve).
 * Le critère « mouvement dans le cercle » d'une opération est `isCircleMovement`
 * (core/savingsFlows.ts), utilisé par tous les calculs.
 */
import { goalSaved } from './balance';
import { isTontineContribution } from './savingsFlows';
import type { Account, Goal, GoalContribution, Transaction } from './types';

type Acc = Pick<Account, 'id' | 'isSavings' | 'active' | 'deleted' | 'currency'>;

/** Comptes courants (où l'on dépense) : actifs, hors épargne. */
export function spendingAccounts<A extends Acc>(accounts: A[], currency?: string): A[] {
  return accounts.filter((a) => a.active && !a.deleted && !a.isSavings && (!currency || a.currency === currency));
}

/**
 * Compte par défaut d'une dépense : le dernier compte COURANT utilisé, sinon le
 * premier compte courant. Jamais un compte d'épargne (null : aucun compte
 * courant → l'appelant crée « Espèces », règle 10).
 */
export function defaultSpendingAccountId(accounts: Acc[], lastAccountId: string | null | undefined, currency: string): string | null {
  const spending = spendingAccounts(accounts, currency);
  return (spending.find((a) => a.id === lastAccountId) ?? spending[0])?.id ?? null;
}

/** Comptes proposés pour une DÉPENSE : les comptes courants (+ le compte actuel d'une ancienne opération, pour l'afficher). */
export function expenseAccountOptions<A extends Acc>(accounts: A[], keepId?: string | null): A[] {
  return accounts.filter((a) => (a.active && !a.deleted && !a.isSavings) || (!!keepId && a.id === keepId));
}

/**
 * Compte réellement utilisé pour une opération : une dépense (hors cotisation
 * de tontine, mouvement dans le cercle) sur un compte d'épargne est reportée
 * sur le compte courant par défaut (`redirected` : expliquer pourquoi).
 */
export function expenseAccountFor(
  t: Pick<Transaction, 'type' | 'accountId' | 'categoryId' | 'subcategoryId' | 'tontineId'>,
  accounts: Pick<Account, 'id' | 'isSavings'>[],
  defaultSpendingId: string | null,
): { accountId: string; redirected: boolean } {
  const acc = accounts.find((a) => a.id === t.accountId);
  if (t.type !== 'expense' || !acc?.isSavings || isTontineContribution(t) || !defaultSpendingId) return { accountId: t.accountId, redirected: false };
  return { accountId: defaultSpendingId, redirected: true };
}

/** Source d'une cotisation de tontine : un compte (courant ou d'épargne) ou un objectif (réserve comprise). */
export type TontineSource = { kind: 'account'; accountId: string } | { kind: 'goal'; goalId: string };

/**
 * Où enregistrer une cotisation, et quel objectif baisse :
 *  - un compte → ce compte ;
 *  - un objectif rangé sur un compte d'épargne → ce compte, l'objectif baisse ;
 *  - un objectif mis de côté sur un compte courant → le compte courant par
 *    défaut, l'objectif baisse (le disponible libre ne change pas).
 * Jamais plus que ce que l'objectif contient (`goal.withdrawTooMuch`).
 */
export function planTontinePayment(input: {
  source: TontineSource;
  amount: number;
  accounts: Acc[];
  goals: Pick<Goal, 'id' | 'accountId' | 'status' | 'deleted' | 'initialAmount'>[];
  contributions: GoalContribution[];
  defaultAccountId: string | null;
}): { accountId: string; fundingGoalId: string | null } {
  const { source, amount, accounts } = input;
  if (source.kind === 'account') {
    if (!accounts.some((a) => a.id === source.accountId && a.active && !a.deleted)) throw new Error('account.missing');
    return { accountId: source.accountId, fundingGoalId: null };
  }
  const goal = input.goals.find((g) => g.id === source.goalId && !g.deleted && (g.status === 'active' || g.status === 'paused'));
  if (!goal) throw new Error('goal.inactive');
  if (amount > goalSaved(goal as Goal, input.contributions)) throw new Error('goal.withdrawTooMuch');
  const own = goal.accountId ? accounts.find((a) => a.id === goal.accountId && a.active && !a.deleted) : undefined;
  const accountId = own?.id ?? input.defaultAccountId;
  if (!accountId) throw new Error('account.missing');
  return { accountId, fundingGoalId: goal.id };
}

/**
 * La personne a-t-elle renseigné son argent ? (sinon : ni message ni carte
 * « pas assez d'argent », Espèces à 0 n'étant qu'un compte de départ).
 * Oui dès qu'un compte courant a un solde de départ, ou qu'un revenu, un
 * virement reçu ou un ajustement à la hausse arrive sur un compte courant.
 */
export function moneyTracked(accounts: Acc[] & Pick<Account, 'openingBalance'>[], transactions: Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'deleted' | 'currency' | 'direction'>[], currency: string): boolean {
  const spending = new Set(accounts.filter((a) => !a.deleted && !a.isSavings && a.currency === currency).map((a) => a.id));
  if (accounts.some((a) => spending.has(a.id) && (a as Account).openingBalance > 0)) return true;
  return transactions.some(
    (t) =>
      !t.deleted &&
      t.currency === currency &&
      ((t.type === 'income' && spending.has(t.accountId)) || (t.type === 'transfer' && !!t.toAccountId && spending.has(t.toAccountId)) || (t.type === 'adjustment' && t.direction !== 'out' && spending.has(t.accountId))),
  );
}

/** Manque après une sortie du disponible : un nombre seulement si le disponible devient NÉGATIF. */
export function shortfallAfter(freeBefore: number, outflow: number): number | null {
  const after = freeBefore - outflow;
  return after < 0 ? -after : null;
}

export interface WithdrawSource {
  kind: 'account' | 'goal';
  id: string;
  name: string;
  amount: number;
}

/** Où retirer : comptes d'épargne et objectifs (réserve comprise) qui contiennent de l'argent. */
export function withdrawSources(input: {
  accounts: (Acc & Pick<Account, 'name'>)[];
  balances: Record<string, number>;
  goals: Goal[];
  contributions: GoalContribution[];
  currency: string;
}): WithdrawSource[] {
  const accounts = input.accounts
    .filter((a) => a.active && !a.deleted && a.isSavings && a.currency === input.currency && (input.balances[a.id] ?? 0) > 0)
    .map((a) => ({ kind: 'account' as const, id: a.id, name: a.name, amount: input.balances[a.id] ?? 0 }));
  const goals = input.goals
    .filter((g) => !g.deleted && (g.status === 'active' || g.status === 'paused') && g.currency === input.currency)
    .map((g) => ({ kind: 'goal' as const, id: g.id, name: g.name, amount: goalSaved(g, input.contributions) }))
    .filter((g) => g.amount > 0);
  return [...accounts, ...goals];
}
