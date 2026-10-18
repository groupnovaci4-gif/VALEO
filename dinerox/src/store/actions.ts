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
import { can, canCreateTransaction, canEditDoc, canUseReserve } from '@/core/permissions';
import { isClassicGoal, isReserve, isSeason, reserveEligible } from '@/core/reserve';
import { newId } from '@/core/sync';
import { linkedRemovals } from '@/core/removal';
import { today } from '@/core/dates';
import { isValidAmount, type CurrencyCode } from '@/core/money';
import { goalSaved } from '@/core/balance';
import { tontineContributionCategory } from '@/core/tontine';
import { isTontineContribution } from '@/core/savingsFlows';
import { defaultSpendingAccountId, planTontinePayment, type TontineSource } from '@/core/savingsCircle';
import { deleteMode, planMerge, restoreDefaults } from '@/core/categoryOps';
import { learnWord } from '@/core/entry/keywords';
import { linkedPartAfterEdit, validateDeposit, validateWithdraw, type DepositInput, type WithdrawInput } from '@/core/savings';
import { currentCatalog } from '@/services/categoryCatalog';
import { analytics } from '@/services/analytics';
import { useI18n } from '@/i18n';
import { monthKey, type MonthKey } from '@/core/dates';
import { touchedByWrite } from '@/core/coach/envelopeAlerts';
import {
  accountChangeError,
  planBalanceCorrection,
  planComplementsFor,
  planDebtOpening,
  planDebtRepayment,
  planRecurringConfirmation,
  planReserveUse,
  planSpendWithComplements,
  planTransferWithFee,
  type PlanItem,
  type SourceChoice,
} from '@/core/writePlans';
import { canDeleteAccount } from '@/core/accountRules';
import { canDeleteDebt, debtStatus } from '@/core/debts';
import { goalBacking } from '@/core/position';
import { pocketClosure, type SpendSource } from '@/core/spendPlan';
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
    /**
     * Argent disponible v2 (§6) : `noMoney` — aucun argent renseigné ; `shortfall` — la sortie
     * rendrait un compte négatif (`accountId`, `missing` : ce qui manque). Rien n'est enregistré.
     */
    public readonly code: 'permission' | 'limit' | 'validation' | 'notReady' | 'feature' | 'noMoney' | 'shortfall',
    public readonly details: { limit?: number; errors?: TxError[]; feature?: Feature; accountId?: string | null; missing?: number; sources?: SpendSource[]; stale?: boolean } = {},
  ) {
    super(code);
  }
}

type Draft<T extends SyncedDoc> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string };

/**
 * Compléments choisis sur la feuille (§6.3), calculés pour CE lot : renvoie leurs écritures
 * (à écrire avec le lot, tout ou rien), sinon refuse en disant ce qui manque, sur quel
 * compte, et d'où on peut le prendre (`sources`, recalculées après chaque choix).
 */
function complementsOrThrow(d: SpaceData, items: PlanItem[], choices: SourceChoice[], purpose: 'spend' | 'set_aside'): PlanItem[] {
  const r = planComplementsFor(d, items, choices, today(), newId, purpose);
  if ('items' in r) return r.items;
  if (r.error === 'noMoney') throw new ActionError('noMoney', { errors: ['money.none'] });
  if (r.error === 'stale') throw new ActionError('shortfall', { errors: ['money.shortfall'], accountId: r.accountId, stale: true });
  throw new ActionError('shortfall', { errors: ['money.shortfall'], accountId: r.accountId, missing: r.missing, sources: r.sources });
}

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
      // Écritures liées (dette, objectif, tontine, réserve) : liste calculée par
      // core/removal.ts, partagée avec le back-office.
      const d = e.getData(spaceId);
      const removed = e.getDoc(spaceId, col, id) as { id: string; transactionId?: string | null; transferId?: string | null } | undefined;
      for (const target of linkedRemovals(d, col, removed, id)) {
        e.remove(spaceId, target.col, target.id);
        // Opération retirée avec son remboursement / sa contribution : le coach réévalue le budget.
        if (col !== 'transactions') {
          const linked = d.transactions.find((t) => t.id === target.id);
          if (linked) notifyCoachWrite(spaceId, budgetImpact('transactions', linked, undefined, d));
        }
      }
    },
    [ctx, ensure],
  );

  /**
   * Argent disponible v2 : un LOT (complément + sortie, transfert + frais, capital + intérêts…)
   * contrôlé puis écrit d'un bloc (`writeMany`) : tout ou rien. Droits vérifiés avant écriture.
   */
  const writeItems = useCallback(
    (items: PlanItem[], opts: { check?: boolean; choices?: SourceChoice[]; purpose?: 'spend' | 'set_aside' } = {}) => {
      const { engine: e, spaceId } = ctx();
      for (const it of items) {
        const existing = e.getDoc(spaceId, it.col, it.doc.id);
        ensure(existing ? 'update' : 'create', it.col, existing);
        if (it.col === 'transactions' && !existing && !canCreateTransaction(role, (it.doc as Transaction).type)) throw new ActionError('permission');
      }
      if (opts.check !== false) items = [...complementsOrThrow(e.getData(spaceId), items, opts.choices ?? [], opts.purpose ?? 'spend'), ...items];
      const before = e.getData(spaceId);
      e.writeMany(spaceId, items);
      const txs = items.filter((i) => i.col === 'transactions');
      if (txs.length) {
        const prev = txs.map((i) => before.transactions.find((x) => x.id === i.doc.id)).filter((x): x is Transaction => !!x && !x.deleted);
        notifyCoachWrite(spaceId, touchedByWrite([...prev, ...txs.map((i) => e.getDoc(spaceId, 'transactions', i.doc.id) as Transaction)], e.getData(spaceId).envelopes));
      }
    },
    [ctx, ensure, role],
  );

  // ─── Opérations ───────────────────────────────────────────────────

  /**
   * Aucun compte n'est obligatoire pour commencer : sans compte actif, une
   * opération est rattachée à un compte « Espèces » créé automatiquement.
   */
  const ensureCashAccount = useCallback(
    (currency: string): string => {
      const d = data();
      // Cercle fermé : le compte où l'on dépense est toujours un compte courant (jamais l'épargne).
      const usable = d.accounts.find((a) => a.active && !a.deleted && !a.isSavings && a.currency === currency);
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

  /** Lot d'une réserve qui paie avec l'argent qui y est adossé (§5.3) ; le reste suit le §6. */
  const reserveItems = useCallback(
    (tx: Transaction, reserveId: string): PlanItem[] => {
      if (!canUseReserve(role)) throw new ActionError('permission');
      const d = data();
      const g = d.goals.find((x) => x.id === reserveId && !x.deleted && isReserve(x) && x.status === 'active' && x.currency === tx.currency);
      if (!g) throw new ActionError('validation', { errors: ['reserve.unavailable'] });
      if (!reserveEligible(tx.categoryId, tx.subcategoryId)) throw new ActionError('validation', { errors: ['reserve.category'] });
      return planReserveUse(d, tx, g.id, tx.currency, newId).items;
    },
    [role, data],
  );

  /** Modification d'une opération déjà enregistrée : ses opérations liées suivent. */
  const saveEdited = useCallback(
    (draft: Draft<Transaction> & { id: string }, d: SpaceData): Transaction => {
    const errors = validateTransaction(draft, d.accounts);
    if (errors.length) throw new ActionError('validation', { errors });
    const tx = save<Transaction>('transactions', draft);
    const payment = d.debtPayments.find((p) => p.transactionId === tx.id);
    if (payment && (payment.amount !== tx.amount || payment.date !== tx.date)) save<DebtPayment>('debtPayments', { ...payment, amount: tx.amount, date: tx.date });
    const te = d.tontineEntries.find((x) => !x.deleted && x.transactionId === tx.id);
    if (te && (te.amount !== tx.amount || te.date !== tx.date)) save<TontineEntry>('tontineEntries', { ...te, amount: tx.amount, date: tx.date });
    const contribution = d.goalContributions.find((c) => c.transferId === tx.id);
    if (contribution) {
      // Part complète : suit le montant ; part partielle (versement 1.8) : gardée, plafonnée.
      const before = d.transactions.find((x) => x.id === tx.id)?.amount ?? null;
      const amount = linkedPartAfterEdit(contribution.amount, before, tx.amount);
      if (amount !== contribution.amount || contribution.date !== tx.date) save<GoalContribution>('goalContributions', { ...contribution, amount, date: tx.date });
    }
    // Utilisation de réserve : recalculée sur le nouveau montant (avec l'argent adossé),
    // retirée si l'opération n'est plus une dépense famille ou cérémonie.
    const use = d.goalContributions.find((c) => !c.deleted && c.linkedTransactionId === tx.id);
    // Cotisation payée par un objectif (mouvement dans le cercle) : l'objectif baisse du nouveau montant.
    if (use && isTontineContribution(tx)) {
      if (use.amount !== -tx.amount || use.date !== tx.date) save<GoalContribution>('goalContributions', { ...use, amount: -tx.amount, date: tx.date, accountId: tx.accountId });
    } else if (use) {
      dropReserveUse(tx.id);
      if (tx.type === 'expense' && reserveEligible(tx.categoryId, tx.subcategoryId)) {
        try {
          writeItems(reserveItems(tx, use.goalId), { check: false });
        } catch {
          // Réserve supprimée ou fermée entre-temps : la dépense reste sur le budget du mois.
        }
      }
    }
    return tx;
  },
    [save, dropReserveUse, writeItems, reserveItems],
  );

  /**
   * Toute opération. Argent disponible v2 (§6.3) — DERNIER REMPART : une nouvelle sortie qui
   * rendrait un compte négatif est refusée (`noMoney`, `shortfall`), contrôlée AVANT
   * `ensureCashAccount` (un compte inexistant est un « Espèces » virtuel à 0 : on ne crée pas
   * un compte pour refuser ensuite). Une nouvelle opération s'écrit en UN lot avec ce qui
   * l'accompagne : frais d'un transfert (`fee`), utilisation d'une réserve (`reserveId`),
   * écritures liées (`linked`, ex. la part d'un objectif libérée).
   */
  const saveTransaction = useCallback(
    (input: Draft<Transaction>, opts: { reserveId?: string | null; fee?: number; linked?: (tx: Transaction) => PlanItem[]; choices?: SourceChoice[]; purpose?: 'spend' | 'set_aside' } = {}): Transaction => {
      let d = data();
      // 1.8 : `legacyCategoryId` n'existe que dans la VUE des calculs (alias) : jamais enregistré.
      // Argent disponible v2 : `nature` est un champ de VUE (withLedgerView), jamais enregistré.
      const { legacyCategoryId: _view, nature: _nature, ...clean } = input as Draft<Transaction> & { legacyCategoryId?: unknown };
      void _view;
      void _nature;
      let draft: Draft<Transaction> = clean;
      // Cercle fermé (2026-10-14) : une DÉPENSE n'est jamais prise sur un compte d'épargne
      // (une cotisation de tontine, si : mouvement dans le cercle). Elle est enregistrée sur un
      // compte courant. Une ANCIENNE dépense déjà sur l'épargne et dont le compte ne change pas
      // reste telle quelle (aucune donnée modifiée).
      const previousTx = draft.id ? d.transactions.find((x) => x.id === draft.id) : undefined;
      const keepsLegacy = !!previousTx && previousTx.type === 'expense' && previousTx.accountId === draft.accountId;
      if (!keepsLegacy && draft.type === 'expense' && d.accounts.some((a) => a.id === draft.accountId && a.isSavings) && !isTontineContribution(draft)) {
        draft = { ...draft, accountId: defaultSpendingAccountId(d.accounts, null, draft.currency) ?? '' };
      }
      // Même devise : le montant reçu est le montant envoyé (§3.4).
      const to = draft.type === 'transfer' ? d.accounts.find((a) => a.id === draft.toAccountId) : undefined;
      const sameCurrency = !!to && to.currency === draft.currency;
      const shaped: Draft<Transaction> = {
        ...draft,
        toAccountId: draft.type === 'transfer' ? draft.toAccountId : null,
        toAmount: draft.type === 'transfer' ? (sameCurrency && draft.toAmount === draft.amount ? null : (draft.toAmount ?? null)) : null,
        categoryId: draft.type === 'transfer' ? null : (draft.categoryId ?? null),
        envelopeId: draft.type === 'expense' ? (draft.envelopeId ?? null) : null,
      };

      // Modification : contrôle de la différence, puis l'ancien chemin (opérations liées).
      if (draft.id && previousTx) {
        const comp = complementsOrThrow(d, [{ col: 'transactions', doc: { ...previousTx, ...shaped, id: draft.id } as Transaction }], opts.choices ?? [], opts.purpose ?? 'spend');
        if (comp.length) writeItems(comp, { check: false });
        return saveEdited(shaped as Draft<Transaction> & { id: string }, comp.length ? data() : d);
      }

      // Nouvelle opération : le lot complet, contrôlé avant tout compte créé.
      if (!canCreateTransaction(role, draft.type)) throw new ActionError('permission');
      const txId = draft.id ?? newId(PREFIX.transactions);
      const lot = (accountId: string): PlanItem[] => {
        const base = { ...shaped, accountId } as Transaction;
        const main = shaped.type === 'transfer' ? planTransferWithFee(base, opts.fee ?? 0, newId, data().categories).map((it, i) => (i === 0 ? { ...it, doc: { ...it.doc, id: txId } } : it)) : [{ col: 'transactions' as const, doc: { ...base, id: txId, createdAt: 0, updatedAt: 0, createdBy: '' } as Transaction }];
        if (shaped.type === 'transfer' && main[1]) main[1] = { ...main[1], doc: { ...main[1].doc, linkedTransactionId: txId } as Transaction };
        const tx = main[0].doc as Transaction;
        const reserve = opts.reserveId && shaped.type === 'expense' ? reserveItems(tx, opts.reserveId) : [];
        return [...main, ...reserve, ...(opts.linked ? opts.linked(tx) : [])];
      };
      let lotItems = lot(draft.accountId);
      const comp = complementsOrThrow(d, lotItems, opts.choices ?? [], opts.purpose ?? 'spend');
      // Aucun compte (revenu, correction) : « Espèces » est créé, APRÈS le contrôle.
      if (!d.accounts.some((a) => a.id === draft.accountId && !a.deleted) && draft.type !== 'transfer') {
        draft = { ...draft, accountId: ensureCashAccount(draft.currency) };
        d = data();
        lotItems = lot(draft.accountId);
      }
      const errors = validateTransaction({ ...shaped, accountId: draft.accountId }, d.accounts);
      if (errors.length) throw new ActionError('validation', { errors });
      const isFirst = !d.transactions.some((t) => t.type === draft.type);
      writeItems([...comp, ...lotItems], { check: false });
      const tx = data().transactions.find((x) => x.id === txId) as Transaction;
      if (isFirst && draft.type !== 'transfer') analytics.track(draft.type === 'expense' ? 'first_expense' : 'first_income');
      return tx;
    },
    [data, role, ensureCashAccount, writeItems, reserveItems, saveEdited],
  );

  /**
   * Sorties et leur complément choisi sur la feuille (§6.3), en un lot : plusieurs comptes à
   * compléter se choisissent l'un après l'autre (`choices` dans l'ordre), sources recalculées.
   */
  const saveWithComplements = useCallback(
    (lines: Draft<Transaction>[], choices: SourceChoice[], purpose: 'spend' | 'set_aside' = 'spend'): string[] => {
      const { currency } = ctx();
      const r = planSpendWithComplements({ data: data(), currency: currency as CurrencyCode, today: today(), lines: lines.map((l) => ({ ...l, id: l.id ?? newId(PREFIX.transactions) })), choices, newId, purpose });
      if ('error' in r) {
        if (r.error === 'noMoney') throw new ActionError('noMoney', { errors: ['money.none'] });
        throw new ActionError('shortfall', { errors: ['money.shortfall'], accountId: r.accountId, missing: 'missing' in r ? r.missing : undefined });
      }
      writeItems(r.items);
      return r.items.filter((i) => i.col === 'transactions').map((i) => i.doc.id);
    },
    [ctx, data, writeItems],
  );

  /** Opération déjà enregistrée → prise sur une réserve (carte de confirmation, formulaire). */
  const takeFromReserve = useCallback(
    (transactionId: string, reserveId: string) => {
      const tx = data().transactions.find((x) => x.id === transactionId && !x.deleted);
      if (!tx) throw new ActionError('validation', { errors: ['reserve.unavailable'] });
      dropReserveUse(tx.id);
      const items = reserveItems(tx, reserveId);
      writeItems(items, { check: false });
      const fromReserve = items.filter((i) => i.col === 'goalContributions').reduce((n, i) => n - (i.doc as GoalContribution).amount, 0);
      return { fromReserve, complement: tx.amount - fromReserve };
    },
    [data, dropReserveUse, reserveItems, writeItems],
  );

  // ─── Comptes ──────────────────────────────────────────────────────

  /**
   * Création ou modification d'un compte. Argent disponible v2 (§3) : l'ouverture est une
   * écriture DATÉE avec sa provenance (`openingDate`, `openingNote`), figée dès la première
   * opération ; aucun compte ne change de devise ou de famille, ni n'est désactivé, avec un solde.
   */
  const saveAccount = useCallback(
    (draft: Draft<Account>): Account => {
      if (!draft.name.trim()) throw new ActionError('validation');
      const d = data();
      const isSavings = draft.type === 'savings' || draft.isSavings;
      const before = draft.id ? d.accounts.find((a) => a.id === draft.id && !a.deleted) : undefined;
      if (before) {
        const err = accountChangeError(before, { ...draft, isSavings }, d, today());
        if (err) throw new ActionError('validation', { errors: [err] });
      } else limit('accounts', d.accounts.length);
      const openingDate = draft.openingBalance ? (draft.openingDate ?? before?.openingDate ?? today()) : (draft.openingDate ?? null);
      return save<Account>('accounts', { ...draft, isSavings, openingDate, openingNote: draft.openingNote ?? before?.openingNote ?? null, overdraftLimit: draft.overdraftLimit ?? before?.overdraftLimit ?? null });
    },
    [data, limit, save],
  );

  /** Supprimer : seulement sans opération ET avec une ouverture à 0 (§3.3) ; sinon on désactive d'abord. */
  const deleteAccount = useCallback(
    (id: string): 'deleted' | 'blocked' => {
      const d = data();
      const account = d.accounts.find((a) => a.id === id && !a.deleted);
      if (account && !canDeleteAccount(account, d.transactions)) return 'blocked';
      remove('accounts', id);
      return 'deleted';
    },
    [data, remove],
  );

  /** « Corriger le solde » (§3.2) sur tout compte : ajustement de l'écart, motif obligatoire ; l'ouverture n'est jamais réécrite. */
  const correctBalance = useCallback(
    (input: { accountId: string; actual: number; date: string; reason: string }): Transaction | null => {
      const r = planBalanceCorrection(data(), input.accountId, input.actual, input.date, input.reason, newId);
      if ('error' in r) throw new ActionError('validation', { errors: [r.error] });
      writeItems(r.items, { check: false });
      return data().transactions.find((x) => x.id === r.items[0].doc.id) ?? null;
    },
    [data, writeItems],
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

  /**
   * 1.8 — Supprimer une catégorie selon son cas (core/categoryOps : deleteMode) :
   * jamais utilisée → supprimée ; système → masquée (identifiants stables) ;
   * utilisée → refus (l'écran propose la fusion ou la désactivation).
   */
  const deleteCategory = useCallback(
    (id: string): 'deleted' | 'hidden' | 'in_use' => {
      const d = data();
      const c = d.categories.find((x) => x.id === id && !x.deleted);
      if (!c) return 'deleted';
      const mode = deleteMode(c, d);
      if (mode === 'merge_or_disable') return 'in_use';
      if (mode === 'hide') {
        save<Category>('categories', { ...c, disabled: true });
        return 'hidden';
      }
      // Ses sous-catégories (jamais utilisées non plus) partent avec elle.
      for (const ch of d.categories.filter((x) => x.parentId === id && !x.deleted)) remove('categories', ch.id);
      remove('categories', id);
      return 'deleted';
    },
    [data, save, remove],
  );

  /** Désactiver (absente des choix, gardée dans l'historique) / réactiver. */
  const setCategoryDisabled = useCallback(
    (id: string, disabled: boolean) => {
      const c = data().categories.find((x) => x.id === id && !x.deleted);
      if (c) save<Category>('categories', { ...c, disabled: disabled ? true : false });
    },
    [data, save],
  );

  /**
   * « Déplacer ses opérations vers… » : écrit le plan de `planMerge`
   * (opérations, récurrences, enveloppes, sous-catégories, mots de saisie), puis
   * supprime la source si elle est personnelle (masquée si système). Les droits
   * sont vérifiés AVANT toute écriture : rien de partiel.
   */
  const mergeCategories = useCallback(
    (fromId: string, toId: string): number => {
      const d = data();
      const plan = planMerge(fromId, toId, d);
      if (!plan) throw new ActionError('validation', { errors: ['category.merge'] });
      const { engine: e, spaceId } = ctx();
      for (const t of plan.transactions) ensure('update', 'transactions', e.getDoc(spaceId, 'transactions', t.id));
      for (const r of plan.recurring) ensure('update', 'recurring', e.getDoc(spaceId, 'recurring', r.id));
      for (const env of plan.envelopes) ensure('update', 'envelopes', e.getDoc(spaceId, 'envelopes', env.id));
      ensure('update', 'categories');
      for (const t of plan.transactions) save<Transaction>('transactions', t);
      for (const r of plan.recurring) save<RecurringRule>('recurring', r);
      for (const env of plan.envelopes) save<Envelope>('envelopes', env);
      for (const c of plan.children) save<Category>('categories', c);
      save<Category>('categories', plan.target);
      if (plan.source.system) save<Category>('categories', plan.source);
      else remove('categories', plan.source.id);
      return plan.transactions.length;
    },
    [data, ctx, ensure, save, remove],
  );

  /**
   * 1.8 — Apprentissage (sur l'appareil, déterministe) : après une correction sur
   * la carte de confirmation, le mot rejoint la catégorie choisie et quitte les
   * autres. Effaçable depuis l'écran Catégories.
   */
  const learnCategoryWord = useCallback(
    (word: string, categoryId: string) => {
      if (!can(role, 'update', 'categories')) return 0;
      const changes = learnWord(data().categories, word, categoryId);
      for (const c of changes) save<Category>('categories', c);
      return changes.length;
    },
    [data, save, role],
  );

  /** Nouvel ordre (glisser-déposer) : seules les catégories déplacées sont écrites. */
  const reorderCategories = useCallback(
    (changes: { id: string; order: number }[]) => {
      const d = data();
      for (const ch of changes) {
        const c = d.categories.find((x) => x.id === ch.id && !x.deleted);
        if (c && c.order !== ch.order) save<Category>('categories', { ...c, order: ch.order });
      }
    },
    [data, save],
  );

  /** « Rétablir par défaut » : libellé, emoji, couleur d'origine ; à nouveau proposée. */
  const restoreCategory = useCallback(
    (id: string) => {
      const c = data().categories.find((x) => x.id === id && !x.deleted);
      if (c?.system) save<Category>('categories', restoreDefaults(c, currentCatalog()));
    },
    [data, save],
  );

  /**
   * 1.8 — « Nouvelles catégories disponibles » : écrit le plan préparé par
   * `planCatalogUpdate` (ajouts et mises à niveau ; JAMAIS de suppression,
   * aucune opération réécrite). Confirmation obligatoire côté écran.
   */
  const applyCatalogUpdate = useCallback(
    (plan: { add: Category[]; patch: Category[] }) => {
      ensure('update', 'categories');
      for (const c of [...plan.add, ...plan.patch]) save<Category>('categories', c);
      return plan.add.length + plan.patch.length;
    },
    [save, ensure],
  );

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
      // §5.2 / §13 : un montant initial est de l'épargne HORS COMPTES (jamais dans le disponible).
      const initialSource = draft.initialAmount > 0 ? (draft.initialSource ?? 'outside') : (draft.initialSource ?? null);
      const goal = save<Goal>('goals', { ...draft, initialSource, rank, history: [] });
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

  /**
   * Archiver ou abandonner une poche demande un solde 0 (§5.1) : sinon `goal.notEmpty`, et
   * `closePocket` dit où va l'argent. « Terminé » garde l'argent compté (il reste adossé).
   */
  const setGoalStatus = useCallback(
    (id: string, status: GoalStatus) => {
      const { currency } = ctx();
      if ((status === 'archived' || status === 'abandoned') && (goalBacking(data(), currency as CurrencyCode).get(id)?.total ?? 0) > 0) throw new ActionError('validation', { errors: ['goal.notEmpty'] });
      return updateGoal(id, { status });
    },
    [ctx, data, updateGoal],
  );

  /** Fermer une poche en disant où va son argent : « Remettre dans mon disponible » ou « Garder sur l'épargne » (§5.1). */
  const closePocket = useCallback(
    (id: string, status: Extract<GoalStatus, 'archived' | 'abandoned' | 'completed'>, destination: 'available' | 'savings') => {
      const { currency } = ctx();
      const d = data();
      const goal = d.goals.find((g) => g.id === id && !g.deleted);
      if (!goal) throw new ActionError('validation', { errors: ['goal.inactive'] });
      const plan = pocketClosure(d, id, currency as CurrencyCode);
      const date = today();
      const drafts = plan.drafts(destination, date);
      writeItems([
        ...drafts.transactions.map((t) => ({ col: 'transactions' as const, doc: { ...t, currency: goal.currency, toAmount: null, categoryId: null, subcategoryId: null, envelopeId: null, payee: goal.name, note: null, goalId: goal.id, createdAt: 0, updatedAt: 0, createdBy: '' } as Transaction })),
        ...drafts.contributions.map((c) => ({ col: 'goalContributions' as const, doc: { accountId: null, transferId: null, note: null, ...c, id: newId(PREFIX.goalContributions), createdAt: 0, updatedAt: 0, createdBy: '' } as GoalContribution })),
      ]);
      updateGoal(id, { status });
      return plan.outside;
    },
    [ctx, data, writeItems, updateGoal],
  );

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
   * Contribution à un objectif. Argent disponible v2 (§5.1-5.2) : chaque franc est ADOSSÉ —
   * transfert vers le compte d'épargne de l'objectif (`moveTo`), sinon mise de côté sur un
   * compte courant ou affectation d'un compte d'épargne : un compte est obligatoire. Contrôlée
   * comme toute sortie (le transfert et la contribution s'écrivent en un lot).
   */
  const contributeToGoal = useCallback(
    (input: { goalId: string; amount: number; date: string; accountId: string | null; note?: string | null; moveTo?: string | null; withdraw?: boolean; choices?: SourceChoice[] }) => {
      const d = data();
      const goal = d.goals.find((g) => g.id === input.goalId);
      if (!goal || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      if (goal.status !== 'active' && goal.status !== 'paused') throw new ActionError('validation', { errors: ['goal.inactive'] });
      // Un retrait ne peut pas dépasser ce qui est mis de côté pour cet objectif.
      if (input.withdraw && input.amount > goalSaved(goal, d.goalContributions)) throw new ActionError('validation', { errors: ['goal.withdrawTooMuch'] });
      if (!input.accountId) throw new ActionError('validation', { errors: ['account.missing'] });
      const amount = input.withdraw ? -input.amount : input.amount;
      const contribution = (transferId: string | null): PlanItem => ({
        col: 'goalContributions',
        doc: { goalId: goal.id, amount, date: input.date, accountId: input.accountId, transferId, note: input.note ?? null, id: newId(PREFIX.goalContributions), createdAt: 0, updatedAt: 0, createdBy: '' } as GoalContribution,
      });
      if (input.moveTo && input.moveTo !== input.accountId) {
        const from = input.withdraw ? input.moveTo : input.accountId;
        const to = input.withdraw ? input.accountId : input.moveTo;
        let linked: PlanItem | null = null;
        saveTransaction({ type: 'transfer', amount: input.amount, currency: goal.currency, date: input.date, accountId: from, toAccountId: to, goalId: goal.id, payee: goal.name, note: input.note ?? null }, { linked: (tx) => [(linked = contribution(tx.id))], choices: input.choices, purpose: 'set_aside' });
        return linked!.doc as GoalContribution;
      }
      const item = contribution(null);
      writeItems([item], { choices: input.choices, purpose: 'set_aside' });
      return item.doc as GoalContribution;
    },
    [data, saveTransaction, writeItems],
  );

  // ─── Épargne (1.8) : verser, retirer, ajuster ───────────────────────

  /**
   * Verser sur un compte d'épargne : TRANSFERT depuis un de mes comptes, ou
   * AJUSTEMENT DE SOLDE si l'argent y est déjà (ni revenu ni dépense). Part
   * affectée à un objectif : contribution LIÉE au mouvement (`transferId`),
   * donc jamais comptée deux fois. Contrôles avant toute écriture.
   */
  const depositToSavings = useCallback(
    (input: DepositInput & { choices?: SourceChoice[] }): Transaction => {
      const d = data();
      const errors: TxError[] = validateDeposit(input, d);
      if (errors.length) throw new ActionError('validation', { errors });
      const sav = d.accounts.find((a) => a.id === input.savingsAccountId)!;
      const goal = input.goal ? d.goals.find((g) => g.id === input.goal!.goalId) : undefined;
      const linked = (tx: Transaction): PlanItem[] =>
        goal && input.goal ? [{ col: 'goalContributions', doc: { goalId: goal.id, amount: input.goal.amount, date: input.date, accountId: sav.id, transferId: tx.id, note: null, id: newId(PREFIX.goalContributions), createdAt: 0, updatedAt: 0, createdBy: '' } as GoalContribution }] : [];
      return input.fromAccountId
        ? saveTransaction({ type: 'transfer', amount: input.amount, currency: sav.currency, date: input.date, accountId: input.fromAccountId, toAccountId: sav.id, goalId: goal?.id ?? null, payee: null, note: null }, { linked, choices: input.choices, purpose: 'set_aside' })
        : saveTransaction({ type: 'adjustment', direction: 'in', amount: input.amount, currency: sav.currency, date: input.date, accountId: sav.id, toAccountId: null, categoryId: null, payee: null, note: null }, { linked });
    },
    [data, saveTransaction],
  );

  /**
   * Retirer d'un compte d'épargne : transfert vers un compte courant, ou
   * dépense directe (catégorie). Jamais plus que le solde ; une part retirée
   * d'un objectif jamais plus que ce qui y est affecté (`goal.withdrawTooMuch`).
   */
  const withdrawFromSavings = useCallback(
    (input: WithdrawInput & { subcategoryId?: string | null; viaAccountId?: string | null; choices?: SourceChoice[] }): Transaction => {
      const d = data();
      const errors: TxError[] = [...validateWithdraw(input, d)];
      if (!input.toAccountId && !input.categoryId) errors.push('category.missing');
      if (errors.length) throw new ActionError('validation', { errors });
      const sav = d.accounts.find((a) => a.id === input.savingsAccountId)!;
      const goal = input.goal ? d.goals.find((g) => g.id === input.goal!.goalId) : undefined;
      // Cercle fermé : l'épargne ne paie jamais une dépense. « Pour une dépense » = un RETRAIT
      // visible vers un compte courant, puis la dépense sur ce compte (deux opérations).
      const via = input.toAccountId ?? (input.viaAccountId && d.accounts.some((a) => a.id === input.viaAccountId && a.active && !a.deleted && !a.isSavings) ? input.viaAccountId : ensureCashAccount(sav.currency));
      // Un seul lot : retrait (part de l'objectif libérée avec lui) puis, s'il y a lieu, la dépense.
      return saveTransaction(
        { type: 'transfer', amount: input.amount, currency: sav.currency, date: input.date, accountId: sav.id, toAccountId: via, goalId: goal?.id ?? null, payee: null, note: null },
        {
          linked: (tx) => [
            ...(goal && input.goal ? [{ col: 'goalContributions' as const, doc: { goalId: goal.id, amount: -input.goal.amount, date: input.date, accountId: sav.id, transferId: tx.id, note: null, id: newId(PREFIX.goalContributions), createdAt: 0, updatedAt: 0, createdBy: '' } as GoalContribution }] : []),
            ...(!input.toAccountId
              ? [{ col: 'transactions' as const, doc: { type: 'expense', amount: input.amount, currency: sav.currency, date: input.date, accountId: via, toAccountId: null, toAmount: null, categoryId: input.categoryId ?? null, subcategoryId: input.subcategoryId ?? null, envelopeId: null, payee: null, note: null, id: newId(PREFIX.transactions), createdAt: 0, updatedAt: 0, createdBy: '' } as Transaction }]
              : []),
          ],
          choices: input.choices,
        },
      );
    },
    [data, saveTransaction, ensureCashAccount],
  );

  /** Ajuster le solde : l'écart entre le solde réel et le solde calculé (ni revenu ni dépense). */
  const adjustSavingsBalance = useCallback(
    (input: { accountId: string; date: string; direction: 'in' | 'out'; amount: number; reason?: string | null }): Transaction => {
      const acc = data().accounts.find((a) => a.id === input.accountId && !a.deleted);
      if (!acc || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      return save<Transaction>('transactions', { type: 'adjustment', direction: input.direction, amount: input.amount, currency: acc.currency, date: input.date, accountId: acc.id, toAccountId: null, categoryId: null, payee: null, note: null, reason: input.reason ?? null });
    },
    [data, save],
  );

  // ─── Dettes ───────────────────────────────────────────────────────

  /**
   * Dette ou créance. Argent disponible v2 (§5.5) : à la création, l'emprunt reçu ou le prêt
   * accordé est une VRAIE opération liée sur le compte choisi (`accountId`), écrite avec la
   * dette ; sans compte, la dette est enregistrée seule (dette d'avant l'application).
   */
  const saveDebt = useCallback(
    (draft: Draft<Debt>, opts: { accountId?: string | null; date?: string; choices?: SourceChoice[] } = {}) => {
      if (draft.id || !opts.accountId) return save<Debt>('debts', draft);
      const id = newId(PREFIX.debts);
      const debtDoc = { ...draft, id, createdAt: 0, updatedAt: 0, createdBy: '' } as Debt;
      writeItems([{ col: 'debts', doc: debtDoc }, ...planDebtOpening(debtDoc, { accountId: opts.accountId, date: opts.date ?? today() }, newId)], { choices: opts.choices });
      return data().debts.find((x) => x.id === id) as Debt;
    },
    [save, writeItems, data],
  );

  /** Une dette qui a des remboursements ne se supprime pas : on la clôture (E47). */
  const deleteDebt = useCallback(
    (id: string) => {
      if (!canDeleteDebt(id, data().debtPayments)) throw new ActionError('validation', { errors: ['debt.hasPayments'] });
      remove('debts', id);
    },
    [data, remove],
  );

  /**
   * Clôturer (§5.5) : avec un reste, « Dette remise » (je dois) ou « Créance abandonnée » (on me
   * doit), datée — ligne « Remises et pertes », ni revenu ni dépense, aucun argent ne bouge.
   */
  const closeDebt = useCallback(
    (id: string, reason?: 'forgiven' | 'written_off') => {
      const d = data();
      const debt = d.debts.find((x) => x.id === id && !x.deleted);
      if (!debt) return;
      const remaining = debtStatus(debt, d.debtPayments).remaining;
      const closedReason = remaining > 0 ? (reason ?? (debt.direction === 'i_owe' ? 'forgiven' : 'written_off')) : null;
      save<Debt>('debts', { ...debt, status: 'closed', closedReason, closedAt: today() });
    },
    [data, save],
  );

  /**
   * Remboursement = capital + intérêts (saisis, 0 par défaut) : opérations liées et
   * remboursement du capital en UN lot. Pas de mouvement sans compte, sauf « Hors de mes
   * comptes » choisi explicitement (`offAccounts`).
   */
  const recordDebtPayment = useCallback(
    (input: { debtId: string; amount: number; interest?: number; date: string; accountId: string | null; offAccounts?: boolean; note?: string | null; label: string; choices?: SourceChoice[] }) => {
      const d = data();
      const debt = d.debts.find((x) => x.id === input.debtId);
      if (!debt || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      const r = planDebtRepayment(debt, { total: input.amount, interest: input.interest ?? 0, accountId: input.accountId, offAccounts: input.offAccounts, date: input.date, label: input.label, note: input.note ?? null }, d.categories, newId);
      if ('error' in r) throw new ActionError('validation', { errors: [r.error] });
      writeItems(r.items, { choices: input.choices });
      const paymentId = r.items.find((i) => i.col === 'debtPayments')?.doc.id;
      return data().debtPayments.find((p) => p.id === paymentId) ?? null;
    },
    [data, writeItems],
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
      // Argent disponible v2 (§5.4) : la clôture est CONFIRMÉE par la personne, et datée.
      const closedAt = draft.status === 'finished' ? (existing?.status === 'finished' ? (existing.closedAt ?? draft.closedAt ?? null) : today()) : null;
      return save<Tontine>('tontines', { ...draft, closedAt });
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
  /**
   * Tontine partagée (étape 3) : « J'ai payé » + accord de la personne → la
   * cotisation devient une opération réelle DANS SON PROPRE ESPACE, avec
   * EXACTEMENT la même catégorie que le carnet (`tontineContributionCategory`),
   * sur le compte QU'ELLE A CHOISI. Aucun compte n'est jamais créé ici
   * (fondateur, 2026-10-14) : sans compte valide, rien n'est enregistré.
   */
  /**
   * Cercle fermé : une cotisation se paie depuis un compte courant, un compte d'épargne ou un
   * objectif (réserve comprise). Payée par un objectif, l'objectif baisse d'autant (utilisation
   * liée à l'opération, supprimée avec elle). Renvoie le compte à utiliser et l'objectif.
   */
  const tontinePayment = useCallback(
    (source: TontineSource, amount: number, currency: string) => {
      const d = data();
      try {
        return planTontinePayment({ source, amount, accounts: d.accounts.filter((a) => a.currency === currency), goals: d.goals, contributions: d.goalContributions, defaultAccountId: defaultSpendingAccountId(d.accounts, null, currency) });
      } catch (e) {
        throw new ActionError('validation', { errors: [String((e as Error).message) as TxError] });
      }
    },
    [data],
  );
  /** Cotisation payée par un objectif : la part de l'objectif libérée DANS LE MÊME LOT que la cotisation. */
  const goalFunding = (goalId: string | null) => (tx: Transaction): PlanItem[] =>
    goalId ? [{ col: 'goalContributions', doc: { goalId, amount: -tx.amount, date: tx.date, accountId: tx.accountId, transferId: null, linkedTransactionId: tx.id, note: null, id: newId(PREFIX.goalContributions), createdAt: 0, updatedAt: 0, createdBy: '' } as GoalContribution }] : [];

  const recordTontineGroupContribution = useCallback(
    (input: { groupId?: string; groupName: string; amount: number; currency: CurrencyCode; date: string; accountId?: string; source?: TontineSource; choices?: SourceChoice[] }) => {
      const d = data();
      if (!isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      const source: TontineSource | null = input.source ?? (input.accountId ? { kind: 'account', accountId: input.accountId } : null);
      if (!source) throw new ActionError('validation', { errors: ['account.missing'] });
      if (source.kind === 'account' && !d.accounts.some((a) => a.id === source.accountId && a.active && !a.deleted && a.currency === input.currency)) throw new ActionError('validation', { errors: ['account.missing'] });
      const plan = tontinePayment(source, input.amount, input.currency);
      return saveTransaction(
        {
          type: 'expense',
          amount: input.amount,
          currency: input.currency,
          date: input.date,
          accountId: plan.accountId,
          ...tontineContributionCategory(d.categories),
          // Lien avec la tontine partagée : une cotisation (de l'épargne) dans tous les pays.
          tontineId: input.groupId ?? null,
          payee: input.groupName,
          note: null,
        },
        { linked: goalFunding(plan.fundingGoalId), choices: input.choices, purpose: 'set_aside' },
      );
    },
    [data, saveTransaction, tontinePayment],
  );

  /**
   * Tontine partagée : « J'ai reçu la cagnotte » — une entrée réelle LIÉE à la tontine (D5 : un retour
   * d'épargne, plus une avance du groupe s'il y a lieu ; jamais un revenu), sur le compte choisi.
   */
  const recordTontineGroupPayout = useCallback(
    (input: { groupId: string; groupName: string; amount: number; currency: CurrencyCode; date: string; accountId: string }) => {
      if (!isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      return saveTransaction({ type: 'income', amount: input.amount, currency: input.currency, date: input.date, accountId: input.accountId, categoryId: categoryOr('inc_tontine', 'inc_other'), subcategoryId: null, tontineId: input.groupId, payee: input.groupName, note: null });
    },
    [saveTransaction, categoryOr],
  );

  const recordTontine = useCallback(
    (input: { tontineId: string; period: number; kind: 'contribution' | 'payout'; amount: number; date: string; accountId?: string | null; source?: TontineSource | null; note?: string | null; choices?: SourceChoice[] }) => {
      const d = data();
      const t = d.tontines.find((x) => x.id === input.tontineId && !x.deleted);
      if (!t || !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      const contribution = input.kind === 'contribution';
      // Cotisation payée depuis une source choisie (compte courant, épargne, objectif) : cercle fermé.
      const plan = contribution && input.source ? tontinePayment(input.source, input.amount, t.currency) : null;
      const tx = saveTransaction(
        {
        type: contribution ? 'expense' : 'income',
        amount: input.amount,
        currency: t.currency,
        date: input.date,
        // Source choisie, sinon compte choisi, sinon celui de la tontine, sinon un compte courant (« Espèces » créé si besoin).
        // Aucun compte : « Espèces » est créé par `saveTransaction`, APRÈS le contrôle (§6.1).
        accountId: plan?.accountId ?? input.accountId ?? (t.accountId && d.accounts.some((x) => x.id === t.accountId && x.active && !x.deleted) ? t.accountId : (defaultSpendingAccountId(d.accounts, null, t.currency) ?? '')),
        // Cotisation : catégorie retrouvée PAR IDENTIFIANT (parent actuel de la sous-catégorie « Tontine »).
        ...(contribution ? tontineContributionCategory(d.categories) : { categoryId: categoryOr('inc_tontine', 'inc_other'), subcategoryId: null }),
        // Cotisation : lien avec le carnet (de l'épargne dans tous les pays). La cagnotte reçue reste un revenu.
        // Argent disponible v2 (D5) : la cagnotte est liée à la tontine — un retour, jamais un revenu.
        tontineId: t.id,
        payee: t.name,
        note: input.note ?? null,
        },
        { linked: goalFunding(plan?.fundingGoalId ?? null), choices: input.choices, purpose: 'set_aside' },
      );
      // Une échéance reportée (entrée « planned ») devient l'entrée payée.
      const previous = d.tontineEntries.find((e) => !e.deleted && e.tontineId === t.id && e.kind === input.kind && e.period === input.period && !e.transactionId);
      return save<TontineEntry>('tontineEntries', { ...(previous ? { id: previous.id } : {}), tontineId: t.id, kind: input.kind, period: input.period, amount: input.amount, date: input.date, transactionId: tx.id, status: 'done', note: null });
    },
    [data, saveTransaction, categoryOr, save, tontinePayment],
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
   * « Votre argent disponible aujourd'hui » (§12.1) : crée les OUVERTURES datées, avec leur
   * provenance. Un compte qui a déjà des opérations ne réécrit jamais son ouverture : l'écart
   * devient une correction de solde (motif : la provenance, sinon « Argent que j'avais déjà »).
   * Seuls l'administrateur et le conjoint renseignent l'argent de l'espace (§6.5).
   */
  const declareOpenings = useCallback(
    (input: { lines: { accountId: string | null; amount: number }[]; note: string; date: string }) => {
      if (role !== 'admin' && role !== 'partner') throw new ActionError('permission');
      const { currency } = ctx();
      for (const line of input.lines) {
        if (!(line.amount > 0)) continue;
        const d = data();
        const accountId = line.accountId && d.accounts.some((a) => a.id === line.accountId && !a.deleted) ? line.accountId : ensureCashAccount(currency);
        const account = data().accounts.find((a) => a.id === accountId)!;
        const used = d.transactions.some((x) => !x.deleted && (x.accountId === accountId || x.toAccountId === accountId));
        if (!used) {
          save<Account>('accounts', { ...account, openingBalance: line.amount, openingDate: input.date, openingNote: input.note.trim() || null });
          continue;
        }
        const r = planBalanceCorrection(data(), accountId, line.amount, input.date, input.note.trim() || t('money.opening.reason'), newId);
        if ('items' in r) writeItems(r.items, { check: false });
      }
    },
    [role, ctx, data, ensureCashAccount, save, writeItems, t],
  );

  /** « Pas due » (À régulariser, §7.2) : l'échéance (et les plus anciennes, déjà traitées) n'est plus attendue. */
  const skipRecurringOccurrence = useCallback(
    (ruleId: string, occurrence: string) => {
      const rule = data().recurring.find((r) => r.id === ruleId && !r.deleted);
      if (!rule) return;
      if (!rule.lastGenerated || rule.lastGenerated < occurrence) save<RecurringRule>('recurring', { ...rule, lastGenerated: occurrence });
    },
    [data, save],
  );

  /**
   * « Je la dois encore » (À régulariser, §7.2) : l'échéance redevient un ENGAGEMENT — une dette
   * « je dois » du montant, due aujourd'hui (dans E), sans mouvement d'argent.
   */
  const oweRecurringOccurrence = useCallback(
    (ruleId: string, occurrence: string) => {
      const rule = data().recurring.find((r) => r.id === ruleId && !r.deleted);
      if (!rule) return;
      const date = today();
      save<Debt>('debts', { direction: 'i_owe', kind: 'personal', counterparty: rule.label.slice(0, 120) || '—', principal: rule.amount, currency: rule.currency, startDate: occurrence, dueDate: date, installment: rule.amount, dueDay: null, rate: null, note: null, status: 'active' });
      skipRecurringOccurrence(ruleId, occurrence);
    },
    [data, save, skipRecurringOccurrence],
  );

  /** « Pas due » pour une cotisation de tontine ancienne : l'échéance est marquée faite, sans argent. */
  const markTontineNotDue = useCallback(
    (tontineId: string, period: number, date: string) => {
      const previous = data().tontineEntries.find((e) => !e.deleted && e.tontineId === tontineId && e.kind === 'contribution' && e.period === period);
      save<TontineEntry>('tontineEntries', { ...(previous ? { id: previous.id } : {}), tontineId, kind: 'contribution', period, amount: 0, date, transactionId: null, status: 'done', note: null });
    },
    [data, save],
  );

  /**
   * Argent disponible v2 (§8, D7) : une récurrence n'est JAMAIS enregistrée seule. Gardée pour
   * le démarrage (Bootstrap) : elle ne crée plus aucune opération. Les échéances se confirment
   * d'un geste (`confirmRecurring`, cartes de `recurringToConfirm`).
   */
  const runRecurring = useCallback(() => 0, []);

  /**
   * « Payé ? » / « Reçu ? » : l'échéance devient une opération avec l'identifiant DÉTERMINISTE
   * de l'échéance (deux téléphones → un seul loyer), contrôlée comme toute sortie. Récurrence
   * convertie en tontine : la confirmation EST la cotisation de la période.
   */
  const confirmRecurring = useCallback(
    (input: { ruleId: string; occurrence: string; amount?: number; accountId?: string; date?: string; choices?: SourceChoice[] }) => {
      const d = data();
      const rule = d.recurring.find((r) => r.id === input.ruleId && !r.deleted);
      if (!rule) throw new ActionError('validation', { errors: ['amount.invalid'] });
      if (input.amount !== undefined && !isValidAmount(input.amount)) throw new ActionError('validation', { errors: ['amount.invalid'] });
      const items = planRecurringConfirmation(d, rule, input.occurrence, { amount: input.amount, accountId: input.accountId, date: input.date ?? today() }, newId);
      const errors = validateTransaction(items[0].doc as Transaction, d.accounts);
      if (errors.length) throw new ActionError('validation', { errors });
      writeItems(items, { choices: input.choices });
      return items[0].doc.id;
    },
    [data, writeItems],
  );

  return useMemo(
    () => ({
      save,
      remove,
      saveTransaction,
      saveWithComplements,
      correctBalance,
      closePocket,
      deleteDebt,
      closeDebt,
      confirmRecurring,
      declareOpenings,
      skipRecurringOccurrence,
      oweRecurringOccurrence,
      markTontineNotDue,
      takeFromReserve,
      dropReserveUse,
      saveAccount,
      applyCatalogUpdate,
      deleteCategory,
      setCategoryDisabled,
      mergeCategories,
      reorderCategories,
      restoreCategory,
      learnCategoryWord,
      depositToSavings,
      withdrawFromSavings,
      adjustSavingsBalance,
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
      recordTontineGroupContribution,
      recordTontineGroupPayout,
      postponeTontine,
      convertRecurringToTontine,
    }),
    [save, remove, saveWithComplements, correctBalance, closePocket, deleteDebt, closeDebt, confirmRecurring, declareOpenings, skipRecurringOccurrence, oweRecurringOccurrence, markTontineNotDue, applyCatalogUpdate, deleteCategory, setCategoryDisabled, mergeCategories, reorderCategories, restoreCategory, learnCategoryWord, depositToSavings, withdrawFromSavings, adjustSavingsBalance, saveTransaction, takeFromReserve, dropReserveUse, saveAccount, deleteAccount, saveEnvelope, applyBudget, saveCategory, createGoal, updateGoal, setGoalStatus, reorderGoals, contributeToGoal, saveDebt, recordDebtPayment, saveAsset, saveRecurring, runRecurring, ensureCashAccount, saveTontine, recordTontine, recordTontineGroupContribution, recordTontineGroupPayout, postponeTontine, convertRecurringToTontine],
  );
}

export type Actions = ReturnType<typeof useActions>;
