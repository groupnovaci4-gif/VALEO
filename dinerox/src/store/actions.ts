/**
 * Actions métier : SEUL point d'entrée des écritures depuis les écrans.
 * Chaque action valide (core/*), vérifie le rôle et les limites de la
 * formule, puis écrit via le moteur de synchro (hors-ligne d'abord).
 */
import { useCallback, useMemo } from 'react';
import { useApp } from './app';
import type {
  Account,
  Asset,
  BudgetMethod,
  BudgetPlan,
  Category,
  CollectionName,
  Debt,
  DebtPayment,
  Envelope,
  Goal,
  GoalContribution,
  GoalStatus,
  RecurringRule,
  SpaceData,
  SyncedDoc,
  Transaction,
} from '@/core/types';
import { validateTransaction, type TxError } from '@/core/transactions';
import { applyGoalChanges } from '@/core/goals';
import { withinLimit, type LimitKey } from '@/core/subscription';
import { can, canEditDoc } from '@/core/permissions';
import { dueOccurrences, materialize } from '@/core/recurring';
import { newId } from '@/core/sync';
import { today } from '@/core/dates';
import { isValidAmount } from '@/core/money';
import { goalSaved } from '@/core/balance';
import { analytics } from '@/services/analytics';
import { useI18n } from '@/i18n';

export class ActionError extends Error {
  constructor(
    public readonly code: 'permission' | 'limit' | 'validation' | 'notReady',
    public readonly details: { limit?: number; errors?: TxError[] } = {},
  ) {
    super(code);
  }
}

type Draft<T extends SyncedDoc> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string };

const PREFIX: Record<CollectionName, string> = {
  accounts: 'acc_',
  categories: 'cat_u_',
  transactions: 'tx_',
  recurring: 'rec_',
  envelopes: 'env_',
  budgets: 'bud_',
  goals: 'goal_',
  goalContributions: 'gc_',
  debts: 'debt_',
  debtPayments: 'dp_',
  assets: 'ast_',
};

export function useActions() {
  const { engine, activeSpace, role, user, plan } = useApp();
  const { t } = useI18n();

  const ctx = useCallback(() => {
    if (!engine || !activeSpace || !user) throw new ActionError('notReady');
    return { engine, spaceId: activeSpace.id, uid: user.uid, currency: activeSpace.currency };
  }, [engine, activeSpace, user]);

  const data = useCallback((): SpaceData => {
    const { engine: e, spaceId } = ctx();
    return e.getData(spaceId);
  }, [ctx]);

  const ensure = useCallback(
    (action: 'create' | 'update' | 'delete', col: CollectionName, doc?: SyncedDoc) => {
      if (!can(role, action, col)) throw new ActionError('permission');
      if (doc && action !== 'create' && !canEditDoc(role, col, doc.createdBy, user?.uid ?? '')) throw new ActionError('permission');
    },
    [role, user],
  );

  const limit = useCallback(
    (key: LimitKey, count: number) => {
      if (!withinLimit(plan, key, count)) throw new ActionError('limit', { limit: count });
    },
    [plan],
  );

  /** Création/modification générique d'un document d'une collection. */
  const save = useCallback(
    <T extends SyncedDoc>(col: CollectionName, draft: Draft<T> & { id?: string }): T => {
      const { engine: e, spaceId } = ctx();
      const existing = draft.id ? e.getDoc(spaceId, col, draft.id) : undefined;
      ensure(existing ? 'update' : 'create', col, existing);
      return e.write<T>(spaceId, col, { ...(draft as object), id: draft.id ?? newId(PREFIX[col]) } as never);
    },
    [ctx, ensure],
  );

  const remove = useCallback(
    (col: CollectionName, id: string) => {
      const { engine: e, spaceId } = ctx();
      ensure('delete', col, e.getDoc(spaceId, col, id));
      e.remove(spaceId, col, id);
      // Écritures liées : une opération et le remboursement / la contribution qu'elle
      // représente vont ensemble (sinon une dette resterait « payée » ou un objectif
      // garderait un transfert fantôme).
      const d = e.getData(spaceId);
      if (col === 'transactions') {
        for (const p of d.debtPayments) if (p.transactionId === id) e.remove(spaceId, 'debtPayments', p.id);
        for (const c of d.goalContributions) if (c.transferId === id) e.remove(spaceId, 'goalContributions', c.id);
      } else if (col === 'debtPayments' || col === 'goalContributions') {
        const doc = e.getDoc(spaceId, col, id) as { transactionId?: string | null; transferId?: string | null } | undefined;
        const txId = doc?.transactionId ?? doc?.transferId;
        if (txId && d.transactions.some((t) => t.id === txId)) e.remove(spaceId, 'transactions', txId);
      }
    },
    [ctx, ensure],
  );

  // ─── Opérations ───────────────────────────────────────────────────

  /**
   * Aucun compte n'est obligatoire pour commencer : sans compte actif, une
   * opération est rattachée à un compte « Espèces » créé automatiquement.
   */
  const ensureCashAccount = useCallback(
    (currency: string): string => {
      const d = data();
      const usable = d.accounts.find((a) => a.active && !a.deleted && !a.isSavings && a.currency === currency) ?? d.accounts.find((a) => a.active && !a.deleted && a.currency === currency);
      if (usable) return usable.id;
      const id = d.accounts.some((a) => a.id === 'acc_cash_auto') ? newId(PREFIX.accounts) : 'acc_cash_auto';
      save<Account>('accounts', {
        id,
        name: t('acc.type.cash'),
        type: 'cash',
        provider: 'none',
        currency: currency as Account['currency'],
        openingBalance: 0,
        color: '#16A34A',
        icon: 'cash',
        active: true,
        isSavings: false,
        order: d.accounts.length,
      });
      return id;
    },
    [data, save, t],
  );

  const saveTransaction = useCallback(
    (input: Draft<Transaction>): Transaction => {
      let d = data();
      let draft = input;
      const hasAccount = d.accounts.some((a) => a.id === draft.accountId && !a.deleted);
      if (!hasAccount && draft.type !== 'transfer' && !d.accounts.some((a) => a.active && !a.deleted)) {
        draft = { ...draft, accountId: ensureCashAccount(draft.currency) };
        d = data();
      }
      const errors = validateTransaction(draft, d.accounts);
      if (errors.length) throw new ActionError('validation', { errors });
      const isFirst = !d.transactions.some((t) => t.type === draft.type);
      const tx = save<Transaction>('transactions', {
        ...draft,
        toAccountId: draft.type === 'transfer' ? draft.toAccountId : null,
        toAmount: draft.type === 'transfer' ? (draft.toAmount ?? null) : null,
        categoryId: draft.type === 'transfer' ? null : (draft.categoryId ?? null),
        envelopeId: draft.type === 'expense' ? (draft.envelopeId ?? null) : null,
      });
      if (!draft.id && isFirst && draft.type !== 'transfer') analytics.track(draft.type === 'expense' ? 'first_expense' : 'first_income');
      // Modification d'une opération liée : le remboursement / la contribution suit.
      if (draft.id) {
        const payment = d.debtPayments.find((p) => p.transactionId === tx.id);
        if (payment && (payment.amount !== tx.amount || payment.date !== tx.date)) save<DebtPayment>('debtPayments', { ...payment, amount: tx.amount, date: tx.date });
        const contribution = d.goalContributions.find((c) => c.transferId === tx.id);
        if (contribution && (Math.abs(contribution.amount) !== tx.amount || contribution.date !== tx.date)) {
          save<GoalContribution>('goalContributions', { ...contribution, amount: contribution.amount < 0 ? -tx.amount : tx.amount, date: tx.date });
        }
      }
      return tx;
    },
    [data, save, ensureCashAccount],
  );

  // ─── Comptes ──────────────────────────────────────────────────────

  const saveAccount = useCallback(
    (draft: Draft<Account>): Account => {
      if (!draft.name.trim()) throw new ActionError('validation');
      if (!draft.id) limit('accounts', data().accounts.length);
      return save<Account>('accounts', { ...draft, isSavings: draft.type === 'savings' || draft.isSavings });
    },
    [data, limit, save],
  );

  /** Un compte ayant des opérations ne se supprime pas (il se désactive). */
  const deleteAccount = useCallback(
    (id: string): 'deleted' | 'blocked' => {
      const used = data().transactions.some((t) => t.accountId === id || t.toAccountId === id);
      if (used) return 'blocked';
      remove('accounts', id);
      return 'deleted';
    },
    [data, remove],
  );

  // ─── Enveloppes & budget ──────────────────────────────────────────

  const saveEnvelope = useCallback(
    (draft: Draft<Envelope>): Envelope => {
      if (!draft.name.trim()) throw new ActionError('validation');
      const d = data();
      if (!draft.id) limit('envelopes', d.envelopes.length);
      const first = d.envelopes.length === 0;
      const env = save<Envelope>('envelopes', draft);
      if (first) analytics.track('first_envelope');
      return env;
    },
    [data, limit, save],
  );

  /** Applique un budget automatique : met à jour/crée les enveloppes et le plan du mois. */
  const applyBudget = useCallback(
    (month: string, method: BudgetMethod, expectedIncome: number, lines: { envelopeId: string | null; name: string; icon: string; color: string; amount: number; categoryIds: string[] }[]) => {
      const { engine: e, spaceId } = ctx();
      ensure('create', 'envelopes');
      const d = data();
      const allocations: Record<string, number> = {};
      const items: { col: CollectionName; doc: SyncedDoc }[] = [];
      lines.forEach((l, i) => {
        const existing = l.envelopeId ? d.envelopes.find((x) => x.id === l.envelopeId) : undefined;
        const env: Envelope = existing
          ? { ...existing, monthlyBudget: l.amount, active: true }
          : {
              id: newId('env_'),
              name: l.name,
              icon: l.icon,
              color: l.color,
              monthlyBudget: l.amount,
              categoryIds: l.categoryIds,
              order: d.envelopes.length + i,
              active: true,
              createdAt: 0,
              updatedAt: 0,
              createdBy: '',
            };
        allocations[env.id] = l.amount;
        items.push({ col: 'envelopes', doc: env });
      });
      const existingPlan = d.budgets.find((b) => b.month === month);
      const plan: BudgetPlan = { ...(existingPlan ?? { createdAt: 0, updatedAt: 0, createdBy: '' }), id: month, month, method, expectedIncome, allocations };
      items.push({ col: 'budgets', doc: plan });
      e.writeMany(spaceId, items);
    },
    [ctx, data, ensure],
  );

  // ─── Catégories ───────────────────────────────────────────────────

  const saveCategory = useCallback((draft: Draft<Category>) => save<Category>('categories', draft), [save]);

  // ─── Objectifs ────────────────────────────────────────────────────

  const createGoal = useCallback(
    (draft: Draft<Goal>): Goal => {
      const d = data();
      const active = d.goals.filter((g) => g.status === 'active' || g.status === 'paused').length;
      limit('goals', active);
      const first = d.goals.length === 0;
      const rank = draft.rank || d.goals.filter((g) => g.status === 'active').length + 1;
      const goal = save<Goal>('goals', { ...draft, rank, history: [] });
      if (first) analytics.track('first_goal', { kind: goal.type });
      return goal;
    },
    [data, limit, save],
  );

  const updateGoal = useCallback(
    (id: string, patch: Partial<Pick<Goal, 'name' | 'targetAmount' | 'targetDate' | 'priority' | 'status' | 'monthlyContribution'>> & Partial<Pick<Goal, 'accountId' | 'rank' | 'planned' | 'scope' | 'initialAmount' | 'icon' | 'categoryId'>>) => {
      const { engine: e, spaceId, uid } = ctx();
      const goal = e.getDoc(spaceId, 'goals', id) as Goal | undefined;
      if (!goal) return;
      ensure('update', 'goals', goal);
      const { name, targetAmount, targetDate, priority, status, monthlyContribution, ...rest } = patch;
      const tracked = Object.fromEntries(Object.entries({ name, targetAmount, targetDate, priority, status, monthlyContribution }).filter(([k]) => k in patch));
      const next = applyGoalChanges(goal, tracked, uid, Date.now());
      e.write<Goal>(spaceId, 'goals', { ...next, ...rest });
    },
    [ctx, ensure],
  );

  const setGoalStatus = useCallback((id: string, status: GoalStatus) => updateGoal(id, { status }), [updateGoal]);

  /** Réordonne les priorités (rangs 1..n). */
  const reorderGoals = useCallback(
    (orderedIds: string[]) => {
      const { engine: e, spaceId } = ctx();
      ensure('update', 'goals');
      const d = data();
      const items = orderedIds
        .map((id, i) => {
          const g = d.goals.find((x) => x.id === id);
          return g && g.rank !== i + 1 ? { col: 'goals' as const, doc: { ...g, rank: i + 1 } } : null;
        })
        .filter((x): x is { col: 'goals'; doc: Goal } => !!x);
      if (items.length) e.writeMany(spaceId, items);
    },
    [ctx, data, ensure],
  );

  /**
   * Contribution à un objectif. Si `moveTo` est fourni, l'argent est
   * RÉELLEMENT déplacé : un transfert est créé du compte source vers le
   * compte associé à l'objectif. Sinon, la somme est simplement mise de côté.
   */
  const contributeToGoal = useCallback(
    (input: { goalId: string; amount: number; date: string; accountId: string | null; note?: string | null; moveTo?: string | null; withdraw?: boolean }) => {
      const d = data();
      const goal = d.goals.find((g) => g.id === input.goalId);
      if (!goal || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      if (goal.status !== 'active' && goal.status !== 'paused') throw new ActionError('validation', { errors: ['goal.inactive'] });
      // Un retrait ne peut pas dépasser ce qui est mis de côté pour cet objectif.
      if (input.withdraw && input.amount > goalSaved(goal, d.goalContributions)) throw new ActionError('validation', { errors: ['goal.withdrawTooMuch'] });
      let transferId: string | null = null;
      if (input.moveTo && input.accountId && input.moveTo !== input.accountId) {
        const from = input.withdraw ? input.moveTo : input.accountId;
        const to = input.withdraw ? input.accountId : input.moveTo;
        const t = saveTransaction({
          type: 'transfer',
          amount: input.amount,
          currency: goal.currency,
          date: input.date,
          accountId: from,
          toAccountId: to,
          goalId: goal.id,
          payee: goal.name,
          note: input.note ?? null,
        });
        transferId = t.id;
      }
      return save<GoalContribution>('goalContributions', {
        goalId: goal.id,
        amount: input.withdraw ? -input.amount : input.amount,
        date: input.date,
        accountId: input.accountId,
        transferId,
        note: input.note ?? null,
      });
    },
    [data, save, saveTransaction],
  );

  // ─── Dettes ───────────────────────────────────────────────────────

  const saveDebt = useCallback((draft: Draft<Debt>) => save<Debt>('debts', draft), [save]);

  /** Remboursement : crée aussi une opération si un compte est choisi (le solde suit). */
  const recordDebtPayment = useCallback(
    (input: { debtId: string; amount: number; date: string; accountId: string | null; note?: string | null; label: string }) => {
      const d = data();
      const debt = d.debts.find((x) => x.id === input.debtId);
      if (!debt || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      let transactionId: string | null = null;
      if (input.accountId) {
        const t = saveTransaction({
          type: debt.direction === 'i_owe' ? 'expense' : 'income',
          amount: input.amount,
          currency: debt.currency,
          date: input.date,
          accountId: input.accountId,
          categoryId: debt.direction === 'i_owe' ? 'cat_debts' : 'inc_other',
          debtId: debt.id,
          payee: debt.counterparty,
          note: input.note ?? input.label,
        });
        transactionId = t.id;
      }
      return save<DebtPayment>('debtPayments', { debtId: debt.id, amount: input.amount, date: input.date, accountId: input.accountId, transactionId, note: input.note ?? null });
    },
    [data, save, saveTransaction],
  );

  // ─── Patrimoine & récurrences ─────────────────────────────────────

  const saveAsset = useCallback((draft: Draft<Asset>) => save<Asset>('assets', draft), [save]);
  const saveRecurring = useCallback((draft: Draft<RecurringRule>) => save<RecurringRule>('recurring', draft), [save]);

  /**
   * Matérialise les échéances récurrentes dues (identifiants déterministes :
   * aucun doublon même si deux appareils le font hors-ligne).
   */
  const runRecurring = useCallback(() => {
    if (!engine || !activeSpace || !user || !can(role, 'create', 'recurring')) return 0;
    const d = engine.getData(activeSpace.id);
    const now = today();
    const items: { col: CollectionName; doc: SyncedDoc }[] = [];
    for (const rule of d.recurring) {
      const dates = dueOccurrences(rule, now);
      if (!dates.length) continue;
      const account = d.accounts.find((a) => a.id === rule.accountId && a.active);
      if (!account) continue;
      for (const date of dates) items.push({ col: 'transactions', doc: materialize(rule, date, { now: Date.now(), uid: user.uid }) });
      items.push({ col: 'recurring', doc: { ...rule, lastGenerated: dates[dates.length - 1] } as RecurringRule });
    }
    if (items.length) engine.writeMany(activeSpace.id, items);
    return items.length;
  }, [engine, activeSpace, user, role]);

  return useMemo(
    () => ({
      save,
      remove,
      saveTransaction,
      saveAccount,
      deleteAccount,
      saveEnvelope,
      applyBudget,
      saveCategory,
      createGoal,
      updateGoal,
      setGoalStatus,
      reorderGoals,
      contributeToGoal,
      saveDebt,
      recordDebtPayment,
      saveAsset,
      saveRecurring,
      runRecurring,
      ensureCashAccount,
    }),
    [save, remove, saveTransaction, saveAccount, deleteAccount, saveEnvelope, applyBudget, saveCategory, createGoal, updateGoal, setGoalStatus, reorderGoals, contributeToGoal, saveDebt, recordDebtPayment, saveAsset, saveRecurring, runRecurring, ensureCashAccount],
  );
}

export type Actions = ReturnType<typeof useActions>;
