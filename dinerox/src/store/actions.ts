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
  Tontine,
  TontineEntry,
  SpaceData,
  SyncedDoc,
  Transaction,
} from '@/core/types';
import { validateTransaction, type TxError } from '@/core/transactions';
import { applyGoalChanges } from '@/core/goals';
import { hasFeature, withinLimit, type Feature, type LimitKey } from '@/core/subscription';
import { can, canEditDoc, canUseReserve } from '@/core/permissions';
import { isClassicGoal, isReserve, isSeason, reserveEligible, splitReserveUse } from '@/core/reserve';
import { dueOccurrences, materialize } from '@/core/recurring';
import { newId } from '@/core/sync';
import { today } from '@/core/dates';
import { isValidAmount } from '@/core/money';
import { goalSaved } from '@/core/balance';
import { analytics } from '@/services/analytics';
import { useI18n } from '@/i18n';
import { monthKey, type MonthKey } from '@/core/dates';
import { touchedByWrite } from '@/core/coach/envelopeAlerts';
import { notifyCoachWrite } from '@/features/coach/bus';

/**
 * Enveloppes/mois dont l'état de budget a pu changer après l'écriture d'un
 * document (dépense ajoutée/modifiée/supprimée, enveloppe ou budget du mois
 * modifié) : le coach les réévalue aussitôt (réaction immédiate).
 */
function budgetImpact(col: CollectionName, before: SyncedDoc | undefined, after: SyncedDoc | undefined, d: SpaceData): Map<MonthKey, Set<string>> {
  if (col === 'transactions') return touchedByWrite([before as Transaction | undefined, after as Transaction | undefined], d.envelopes);
  const month = monthKey(today());
  if (col === 'envelopes') return new Map([[month, new Set([(after ?? before)!.id])]]);
  if (col === 'budgets') {
    const p = (after ?? before) as BudgetPlan;
    return new Map([[p.month, new Set([...Object.keys(p.allocations ?? {}), ...Object.keys((before as BudgetPlan | undefined)?.allocations ?? {})])]]);
  }
  return new Map();
}

export class ActionError extends Error {
  constructor(
    public readonly code: 'permission' | 'limit' | 'validation' | 'notReady' | 'feature',
    public readonly details: { limit?: number; errors?: TxError[]; feature?: Feature } = {},
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
  tontines: 'ton_',
  tontineEntries: 'tne_',
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

  const feature = useCallback(
    (f: Feature) => {
      if (!hasFeature(plan, f)) throw new ActionError('feature', { feature: f });
    },
    [plan],
  );

  /** Création/modification générique d'un document d'une collection. */
  const save = useCallback(
    <T extends SyncedDoc>(col: CollectionName, draft: Draft<T> & { id?: string }): T => {
      const { engine: e, spaceId } = ctx();
      const existing = draft.id ? e.getDoc(spaceId, col, draft.id) : undefined;
      ensure(existing ? 'update' : 'create', col, existing);
      const written = e.write<T>(spaceId, col, { ...(draft as object), id: draft.id ?? newId(PREFIX[col]) } as never);
      notifyCoachWrite(spaceId, budgetImpact(col, existing && !existing.deleted ? existing : undefined, written, e.getData(spaceId)));
      return written;
    },
    [ctx, ensure],
  );

  const remove = useCallback(
    (col: CollectionName, id: string) => {
      const { engine: e, spaceId } = ctx();
      const before = e.getDoc(spaceId, col, id);
      ensure('delete', col, before);
      e.remove(spaceId, col, id);
      notifyCoachWrite(spaceId, budgetImpact(col, before && !before.deleted ? before : undefined, undefined, e.getData(spaceId)));
      // Écritures liées : une opération et le remboursement / la contribution qu'elle
      // représente vont ensemble (sinon une dette resterait « payée » ou un objectif
      // garderait un transfert fantôme).
      const d = e.getData(spaceId);
      if (col === 'transactions') {
        for (const p of d.debtPayments) if (p.transactionId === id) e.remove(spaceId, 'debtPayments', p.id);
        for (const c of d.goalContributions) if (c.transferId === id) e.remove(spaceId, 'goalContributions', c.id);
        // Tontine : l'entrée (cotisation ou cagnotte) part avec son opération.
        for (const te of d.tontineEntries) if (te.transactionId === id) e.remove(spaceId, 'tontineEntries', te.id);
        // Utilisation de réserve liée : annulée avec l'opération (et son transfert éventuel).
        for (const c of d.goalContributions) {
          if (c.linkedTransactionId !== id) continue;
          e.remove(spaceId, 'goalContributions', c.id);
          if (c.transferId) e.remove(spaceId, 'transactions', c.transferId);
        }
      } else if (col === 'debtPayments' || col === 'goalContributions') {
        const doc = e.getDoc(spaceId, col, id) as { transactionId?: string | null; transferId?: string | null } | undefined;
        const txId = doc?.transactionId ?? doc?.transferId;
        const linked = txId ? d.transactions.find((t) => t.id === txId) : undefined;
        if (linked) {
          e.remove(spaceId, 'transactions', linked.id);
          notifyCoachWrite(spaceId, budgetImpact('transactions', linked, undefined, d));
        }
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

  /** Retire l'utilisation de réserve liée à une opération (et son transfert éventuel). */
  const dropReserveUse = useCallback(
    (transactionId: string) => {
      const { engine: e, spaceId } = ctx();
      for (const c of e.getData(spaceId).goalContributions) {
        if (c.linkedTransactionId !== transactionId) continue;
        ensure('delete', 'goalContributions', c);
        e.remove(spaceId, 'goalContributions', c.id);
        if (c.transferId) e.remove(spaceId, 'transactions', c.transferId);
      }
    },
    [ctx, ensure],
  );

  /**
   * Prend une dépense (famille, cérémonies) sur une réserve : utilisation liée à
   * l'opération, plafonnée au solde — le complément reste sur le budget du mois,
   * rien n'est bloqué. Si la réserve est rangée sur un autre compte, l'argent
   * en est réellement transféré vers le compte qui a payé.
   */
  const applyReserveUse = useCallback(
    (tx: Transaction, reserveId: string): { fromReserve: number; complement: number } => {
      if (!canUseReserve(role)) throw new ActionError('permission');
      const d = data();
      const g = d.goals.find((x) => x.id === reserveId && !x.deleted && isReserve(x) && x.status === 'active' && x.currency === tx.currency);
      if (!g) throw new ActionError('validation', { errors: ['reserve.unavailable'] });
      if (tx.type !== 'expense' || !reserveEligible(tx.categoryId)) throw new ActionError('validation', { errors: ['reserve.category'] });
      const others = d.goalContributions.filter((c) => c.linkedTransactionId !== tx.id);
      const split = splitReserveUse(tx.amount, goalSaved(g, others));
      if (split.fromReserve <= 0) return split;
      let transferId: string | null = null;
      const from = g.accountId ? d.accounts.find((a) => a.id === g.accountId && a.active && !a.deleted) : undefined;
      if (from && from.id !== tx.accountId) {
        transferId = save<Transaction>('transactions', { type: 'transfer', amount: split.fromReserve, currency: tx.currency, date: tx.date, accountId: from.id, toAccountId: tx.accountId, toAmount: null, categoryId: null, envelopeId: null, goalId: g.id, payee: g.name, note: null }).id;
      }
      save<GoalContribution>('goalContributions', { goalId: g.id, amount: -split.fromReserve, date: tx.date, accountId: tx.accountId, transferId, linkedTransactionId: tx.id, note: null });
      return split;
    },
    [role, data, save],
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
        const te = d.tontineEntries.find((x) => !x.deleted && x.transactionId === tx.id);
        if (te && (te.amount !== tx.amount || te.date !== tx.date)) save<TontineEntry>('tontineEntries', { ...te, amount: tx.amount, date: tx.date });
        const contribution = d.goalContributions.find((c) => c.transferId === tx.id);
        if (contribution && (Math.abs(contribution.amount) !== tx.amount || contribution.date !== tx.date)) {
          save<GoalContribution>('goalContributions', { ...contribution, amount: contribution.amount < 0 ? -tx.amount : tx.amount, date: tx.date });
        }
        // Utilisation de réserve : recalculée sur le nouveau montant (jamais au-delà du
        // solde), retirée si l'opération n'est plus une dépense famille ou cérémonie.
        const use = d.goalContributions.find((c) => !c.deleted && c.linkedTransactionId === tx.id);
        if (use) {
          dropReserveUse(tx.id);
          if (tx.type === 'expense' && reserveEligible(tx.categoryId)) {
            try {
              applyReserveUse(tx, use.goalId);
            } catch {
              // Réserve supprimée ou fermée entre-temps : la dépense reste sur le budget du mois.
            }
          }
        }
      }
      return tx;
    },
    [data, save, ensureCashAccount, dropReserveUse, applyReserveUse],
  );

  /** Opération déjà enregistrée → prise sur une réserve (carte de confirmation, formulaire). */
  const takeFromReserve = useCallback(
    (transactionId: string, reserveId: string) => {
      const tx = data().transactions.find((x) => x.id === transactionId && !x.deleted);
      if (!tx) throw new ActionError('validation', { errors: ['reserve.unavailable'] });
      dropReserveUse(tx.id);
      return applyReserveUse(tx, reserveId);
    },
    [data, dropReserveUse, applyReserveUse],
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
      notifyCoachWrite(spaceId, budgetImpact('budgets', existingPlan, plan, e.getData(spaceId)));
    },
    [ctx, data, ensure],
  );

  // ─── Catégories ───────────────────────────────────────────────────

  const saveCategory = useCallback((draft: Draft<Category>) => save<Category>('categories', draft), [save]);

  // ─── Objectifs ────────────────────────────────────────────────────

  const createGoal = useCallback(
    (draft: Draft<Goal>): Goal => {
      const d = data();
      const open = d.goals.filter((g) => !g.deleted && (g.status === 'active' || g.status === 'paused'));
      // Réserves et moments forts ont leurs propres limites : la limite d'objectifs
      // des formules existantes ne compte que les objectifs classiques.
      if (isReserve(draft)) {
        if (activeSpace?.kind === 'family') feature('family_reserve');
        limit('reserves', open.filter(isReserve).length);
      } else if (isSeason(draft)) limit('seasons', open.filter(isSeason).length);
      else limit('goals', open.filter(isClassicGoal).length);
      const first = d.goals.length === 0;
      const rank = draft.rank || d.goals.filter((g) => g.status === 'active').length + 1;
      const goal = save<Goal>('goals', { ...draft, rank, history: [] });
      if (first) analytics.track('first_goal', { kind: goal.type });
      return goal;
    },
    [data, limit, save, feature, activeSpace?.kind],
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

  // ─── Tontines (carnet de suivi : aucun argent n'est détenu par l'application) ──

  /** Création ou modification. Gratuit : une tontine active ; Plus et Famille : illimité. */
  const saveTontine = useCallback(
    (draft: Draft<Tontine>): Tontine => {
      if (!draft.name.trim() || !isValidAmount(draft.amountPerShare) || !(draft.sharesHeld > 0)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      const d = data();
      const existing = draft.id ? d.tontines.find((x) => x.id === draft.id) : undefined;
      const becomesActive = draft.status === 'active' && existing?.status !== 'active';
      if (becomesActive) limit('tontines', d.tontines.filter((x) => !x.deleted && x.status === 'active').length);
      return save<Tontine>('tontines', draft);
    },
    [data, limit, save],
  );

  /** Catégorie existante chez l'utilisateur, sinon le repli (« Autres »). */
  const categoryOr = useCallback((id: string, fallback: string) => (data().categories.some((c) => c.id === id && !c.deleted) ? id : fallback), [data]);

  /**
   * « J'ai cotisé » / « J'ai reçu la cagnotte » (après confirmation) : crée
   * l'opération RÉELLE dans l'espace (dépense « Tontine / cotisation » ou
   * revenu « Tontine reçue ») et l'entrée liée. Supprimer l'opération
   * supprimera l'entrée.
   */
  const recordTontine = useCallback(
    (input: { tontineId: string; period: number; kind: 'contribution' | 'payout'; amount: number; date: string; accountId?: string | null; note?: string | null }) => {
      const d = data();
      const t = d.tontines.find((x) => x.id === input.tontineId && !x.deleted);
      if (!t || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      const contribution = input.kind === 'contribution';
      const tx = saveTransaction({
        type: contribution ? 'expense' : 'income',
        amount: input.amount,
        currency: t.currency,
        date: input.date,
        // Compte choisi, sinon celui de la tontine, sinon un compte utilisable (« Espèces » créé si besoin).
        accountId: input.accountId ?? (t.accountId && d.accounts.some((x) => x.id === t.accountId && x.active && !x.deleted) ? t.accountId : ensureCashAccount(t.currency)),
        categoryId: contribution ? categoryOr('cat_informal', 'cat_other') : categoryOr('inc_tontine', 'inc_other'),
        subcategoryId: contribution && d.categories.some((c) => c.id === 'sub_informal_tontine' && !c.deleted) ? 'sub_informal_tontine' : null,
        payee: t.name,
        note: input.note ?? null,
      });
      // Une échéance reportée (entrée « planned ») devient l'entrée payée.
      const previous = d.tontineEntries.find((e) => !e.deleted && e.tontineId === t.id && e.kind === input.kind && e.period === input.period && !e.transactionId);
      return save<TontineEntry>('tontineEntries', { ...(previous ? { id: previous.id } : {}), tontineId: t.id, kind: input.kind, period: input.period, amount: input.amount, date: input.date, transactionId: tx.id, status: 'done', note: null });
    },
    [data, saveTransaction, categoryOr, save, ensureCashAccount],
  );

  /** « Reporter » une cotisation en retard : nouvelle date, rien n'est payé. */
  const postponeTontine = useCallback(
    (input: { tontineId: string; period: number; amount: number; date: string }) => {
      const d = data();
      const previous = d.tontineEntries.find((e) => !e.deleted && e.tontineId === input.tontineId && e.kind === 'contribution' && e.period === input.period);
      if (previous?.status === 'done') return previous;
      return save<TontineEntry>('tontineEntries', { ...(previous ? { id: previous.id } : {}), tontineId: input.tontineId, kind: 'contribution', period: input.period, amount: input.amount, date: input.date, transactionId: null, status: 'planned', note: null });
    },
    [data, save],
  );

  /**
   * Conversion d'une récurrence de tontine en tontine complète. La récurrence
   * d'origine est conservée ; elle n'est désactivée que si l'utilisateur l'a confirmé.
   */
  const convertRecurringToTontine = useCallback(
    (draft: Draft<Tontine>, deactivateRule: boolean): Tontine => {
      const t = saveTontine(draft);
      const rule = draft.linkedRecurringId ? data().recurring.find((r) => r.id === draft.linkedRecurringId) : undefined;
      if (rule && deactivateRule && rule.active) save<RecurringRule>('recurring', { ...rule, active: false });
      return t;
    },
    [saveTontine, data, save],
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
    if (items.length) {
      engine.writeMany(activeSpace.id, items);
      // Échéances générées (loyer, abonnement…) : elles comptent dans les budgets.
      const after = engine.getData(activeSpace.id);
      notifyCoachWrite(activeSpace.id, touchedByWrite(items.filter((i) => i.col === 'transactions').map((i) => i.doc as Transaction), after.envelopes));
    }
    return items.length;
  }, [engine, activeSpace, user, role]);

  return useMemo(
    () => ({
      save,
      remove,
      saveTransaction,
      takeFromReserve,
      dropReserveUse,
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
      saveTontine,
      recordTontine,
      postponeTontine,
      convertRecurringToTontine,
    }),
    [save, remove, saveTransaction, takeFromReserve, dropReserveUse, saveAccount, deleteAccount, saveEnvelope, applyBudget, saveCategory, createGoal, updateGoal, setGoalStatus, reorderGoals, contributeToGoal, saveDebt, recordDebtPayment, saveAsset, saveRecurring, runRecurring, ensureCashAccount, saveTontine, recordTontine, postponeTontine, convertRecurringToTontine],
  );
}

export type Actions = ReturnType<typeof useActions>;
