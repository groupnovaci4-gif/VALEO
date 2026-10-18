/**
 * Lots d'écritures — argent disponible v2, étape 2 (docs/argent-disponible.md §3, §5, §6, §8).
 * Module PUR (testé : tests/argent-ecritures.test.ts).
 *
 * Chaque fonction décrit un LOT (documents à écrire ensemble) ou un refus ; `useActions`
 * l'enregistre d'un bloc avec `writeMany` : tout ou rien. L'horodatage et l'auteur sont posés
 * par le moteur (jamais ici). Identifiants : déterministes quand deux téléphones doivent
 * écrire le MÊME document (confirmation d'une récurrence, complément), sinon `newId`.
 */
import { accountBalances } from './balance';
import { accountChangeRules } from './accountRules';
import { debtPaymentAccountError, splitRepayment } from './debts';
import { monthKey, type ISODate } from './dates';
import { accountPositions, balancesAt } from './position';
import { recurringTxId } from './recurring';
import { moneyTracked } from './savingsCircle';
import { canDebit, complementDrafts, reserveCover, spendPlan, type SpendSource } from './spendPlan';
import { buildSchedule } from './tontine';
import type { CurrencyCode } from './money';
import type { Account, Category, CollectionName, Debt, DebtPayment, GoalContribution, RecurringRule, SpaceData, SyncedDoc, TontineEntry, Transaction } from './types';

export type PlanItem = { col: CollectionName; doc: SyncedDoc };
export type NewId = (prefix: string) => string;

/** Champs posés par le moteur à l'écriture (`writeMany`) : jamais horodaté ici. */
const META = { createdAt: 0, updatedAt: 0, createdBy: '' } as const;

/** Une opération complète à partir d'un brouillon. */
export type TxInput = Pick<Transaction, 'type' | 'amount' | 'currency' | 'date' | 'accountId'> & Partial<Omit<Transaction, 'type' | 'amount' | 'currency' | 'date' | 'accountId'>>;
function txDoc(input: TxInput, id: string): Transaction {
  return {
    toAccountId: null,
    toAmount: null,
    categoryId: null,
    subcategoryId: null,
    envelopeId: null,
    payee: null,
    note: null,
    ...input,
    ...META,
    id,
  } as Transaction;
}
const item = (col: CollectionName, doc: SyncedDoc): PlanItem => ({ col, doc });

/** Données après un lot (tests, recalcul des sources entre deux compléments). */
export function applyItems<D extends SpaceData>(d: D, items: PlanItem[]): D {
  const out = { ...d } as D;
  for (const { col, doc } of items) {
    const list = (out[col] as SyncedDoc[]).filter((x) => x.id !== doc.id);
    (out as Record<string, unknown>)[col] = [...list, doc];
  }
  return out;
}

// ─── Dernier rempart (§6.3) ──────────────────────────────────────────

export type OutflowError = { code: 'noMoney' } | { code: 'shortfall'; accountId: string | null; missing: number };

/**
 * Une nouvelle sortie (dépense, transfert) rendrait-elle un compte négatif ? Contrôle fait
 * AVANT `ensureCashAccount` (un compte inexistant est un « Espèces » virtuel à 0). Un revenu,
 * une correction ou une suppression ne sont jamais bloqués ici (§6.4). Modification : une
 * sortie qui n'augmente pas (même compte, montant ≤, pas plus tôt) n'est jamais refusée.
 */
export function outflowError(d: Pick<SpaceData, 'accounts' | 'transactions' | 'goals' | 'goalContributions'>, draft: TxInput & { id?: string }, today: ISODate): OutflowError | null {
  if (draft.type !== 'expense' && draft.type !== 'transfer') return null;
  const prev = draft.id ? d.transactions.find((t) => t.id === draft.id && !t.deleted) : undefined;
  if (prev && prev.type === draft.type && prev.accountId === draft.accountId && draft.amount <= prev.amount && draft.date >= prev.date) return null;
  if (!moneyTracked(d.accounts, d.transactions, draft.currency)) return { code: 'noMoney' };
  const exists = d.accounts.some((a) => a.id === draft.accountId && !a.deleted);
  const r = canDebit(d, { accountId: exists ? draft.accountId : null, amount: draft.amount, date: draft.date, replaces: draft.id }, draft.currency, today);
  return r.ok ? null : { code: 'shortfall', accountId: exists ? draft.accountId : null, missing: r.missing };
}

/**
 * Contrôle d'un LOT (§6.1, §6.3) : accepté s'il ne crée ni n'aggrave un solde négatif sur un
 * compte qu'il débite, à la date de chaque sortie et à toutes les dates suivantes. Un lot qui
 * libère de l'argent dans le même geste (part d'un objectif, réserve, complément) est jugé avec
 * elle. Un compte déjà négatif (deux téléphones, E40) : la nouvelle sortie doit couvrir le
 * montant ET le déficit. Aucun argent renseigné et une sortie d'un compte courant : `noMoney`.
 */
export function batchOutflowError(d: SpaceData, items: PlanItem[], today: ISODate): OutflowError | null {
  const byId = new Map(d.accounts.map((a) => [a.id, a]));
  const debited = new Map<string, ISODate>();
  const note = (accountId: string, date: ISODate) => debited.set(accountId, debited.has(accountId) && debited.get(accountId)! < date ? debited.get(accountId)! : date);
  let currency: CurrencyCode | null = null;
  for (const { col, doc } of items) {
    if (col === 'transactions') {
      const t = doc as Transaction;
      if (t.deleted || (t.type !== 'expense' && t.type !== 'transfer')) continue;
      const prev = d.transactions.find((x) => x.id === t.id && !x.deleted);
      // Modification qui n'augmente pas la sortie : jamais refusée.
      if (prev && prev.type === t.type && prev.accountId === t.accountId && t.amount <= prev.amount && t.date >= prev.date) continue;
      currency = currency ?? t.currency;
      note(t.accountId, t.date);
    } else if (col === 'goalContributions') {
      const c = doc as GoalContribution;
      if (!c.deleted && c.amount > 0 && !c.transferId && c.accountId) note(c.accountId, c.date);
    }
  }
  if (!debited.size) return null;
  const after = applyItems(d, items);
  for (const [accountId, date] of debited) {
    const account = byId.get(accountId);
    const cur = account?.currency ?? currency ?? d.accounts[0]?.currency ?? 'XOF';
    if ((!account || !account.isSavings) && !moneyTracked(d.accounts, d.transactions, cur)) return { code: 'noMoney' };
    if (!account) {
      // Compte encore inexistant : un « Espèces » virtuel à 0.
      const out = items.filter((i) => i.col === 'transactions' && (i.doc as Transaction).accountId === accountId && ((i.doc as Transaction).type === 'expense' || (i.doc as Transaction).type === 'transfer'));
      return { code: 'shortfall', accountId: null, missing: out.reduce((n, i) => n + (i.doc as Transaction).amount, 0) };
    }
    const dates = new Set<ISODate>([date]);
    if (today > date) dates.add(today);
    for (const t of after.transactions) if (!t.deleted && t.date > date) dates.add(t.date);
    for (const c of after.goalContributions) if (!c.deleted && c.date > date) dates.add(c.date);
    let missing = 0;
    for (const dd of dates) {
      const before = accountPositions(d, cur, dd)[accountId]?.debitable ?? 0;
      const now = accountPositions(after, cur, dd)[accountId]?.debitable ?? 0;
      if (now < 0 && now < before) missing = Math.max(missing, Math.ceil(-now));
    }
    if (missing > 0) return { code: 'shortfall', accountId, missing };
  }
  return null;
}

// ─── Complément + sortie (§6.3) ──────────────────────────────────────

export type SourceChoice =
  | { kind: 'set_aside'; goalId: string; accountId: string }
  | { kind: 'account' | 'savings'; accountId: string }
  | { kind: 'goal'; goalId: string; accountId: string };

const sameSource = (s: SpendSource, c: SourceChoice) =>
  s.kind === c.kind && 'accountId' in s && s.accountId === c.accountId && (!('goalId' in c) || ('goalId' in s && s.goalId === c.goalId));

/** Écritures d'un complément (devise du compte qui paie). */
function complementItems(source: SpendSource, missing: number, payingAccountId: string, date: ISODate, currency: CurrencyCode, newId: NewId): PlanItem[] {
  const drafts = complementDrafts(source, missing, payingAccountId, date);
  return [
    ...drafts.transactions.map((t) => item('transactions', txDoc({ ...t, currency, toAmount: null }, t.id))),
    ...drafts.contributions.map((c) => item('goalContributions', { note: null, accountId: null, transferId: null, ...c, ...META, id: newId('gc_') } as GoalContribution)),
  ];
}

/**
 * Sortie(s) et complément(s) en un seul lot. Plusieurs comptes à compléter : l'un après
 * l'autre, les sources RECALCULÉES après chaque choix — la même source n'est jamais promise
 * deux fois (`stale`). `needsChoice` : le compte qui attend encore un complément.
 */
export function planSpendWithComplements(input: {
  data: SpaceData;
  currency: CurrencyCode;
  today: ISODate;
  lines: (TxInput & { id?: string })[];
  choices: SourceChoice[];
  newId: NewId;
  purpose?: 'spend' | 'set_aside';
}): { items: PlanItem[] } | { error: 'noMoney' } | { error: 'needsChoice'; accountId: string | null; missing: number } | { error: 'stale'; accountId: string | null } {
  let work = input.data;
  const items: PlanItem[] = [];
  const spendLines = input.lines.filter((l) => l.type === 'expense' || l.type === 'transfer').map((l) => ({ accountId: l.accountId || null, amount: l.amount, date: l.date, replaces: l.id ?? null }));
  let next = 0;
  for (let guard = 0; guard <= input.lines.length + input.choices.length; guard++) {
    const plan = spendPlan({ data: work, currency: input.currency, today: input.today, lines: spendLines, purpose: input.purpose });
    if (plan.status === 'no_money') return { error: 'noMoney' };
    if (plan.status === 'ok') break;
    const s = plan.shortfalls[0];
    const choice = input.choices[next++];
    if (!choice) return { error: 'needsChoice', accountId: s.accountId, missing: s.missing };
    const source = s.sources.find((x) => sameSource(x, choice));
    if (!source || !s.accountId) return { error: 'stale', accountId: s.accountId };
    const add = complementItems(source, s.missing, s.accountId, input.lines[0]?.date ?? input.today, input.currency, input.newId);
    items.push(...add);
    work = applyItems(work, add);
  }
  for (const l of input.lines) items.push(item('transactions', txDoc(l, l.id ?? input.newId('tx_'))));
  return { items };
}

// ─── Transfert + frais (§3.4) ────────────────────────────────────────

/** Transfert et frais liés (dépense de nature `frais`), supprimés ensemble. Frais 0 : le transfert seul. */
export function planTransferWithFee(draft: TxInput & { id?: string }, fee: number, newId: NewId): PlanItem[] {
  const transfer = txDoc({ ...draft, toAmount: draft.toAmount ?? null }, draft.id ?? newId('tx_'));
  const out = [item('transactions', transfer)];
  if (fee > 0) {
    out.push(item('transactions', txDoc({ type: 'expense', amount: fee, currency: draft.currency, date: draft.date, accountId: draft.accountId, categoryId: 'cat_other', linkedTransactionId: transfer.id }, newId('tx_'))));
  }
  return out;
}

// ─── Dettes (§5.5) ───────────────────────────────────────────────────

/** Emprunt reçu (entrée liée) ou prêt accordé (sortie liée) sur un compte : jamais un revenu ni une dépense. */
export function planDebtOpening(debt: Pick<Debt, 'id' | 'direction' | 'principal' | 'currency' | 'counterparty'>, input: { accountId: string; date: ISODate }, newId: NewId): PlanItem[] {
  const received = debt.direction === 'i_owe';
  return [
    item(
      'transactions',
      txDoc({ type: received ? 'income' : 'expense', amount: debt.principal, currency: debt.currency, date: input.date, accountId: input.accountId, categoryId: received ? 'inc_other' : 'cat_other', debtId: debt.id, payee: debt.counterparty }, newId('tx_')),
    ),
  ];
}

/** Catégorie des intérêts : la sous-catégorie « Intérêts » si elle existe chez la personne, sinon « Dettes ». */
function interestCategory(categories: Pick<Category, 'id' | 'parentId' | 'deleted'>[]): { categoryId: string; subcategoryId: string | null } {
  const sub = categories.find((c) => c.id === 'sub_debts_interest' && !c.deleted && c.parentId);
  return sub ? { categoryId: sub.parentId as string, subcategoryId: sub.id } : { categoryId: 'cat_debts', subcategoryId: null };
}

/**
 * Remboursement M = capital + intérêts (saisis, 0 par défaut) : opération du capital liée à
 * la dette, intérêts en opération liée, remboursement du CAPITAL. Sans compte : refusé, sauf
 * « Hors de mes comptes » choisi explicitement (aucune opération, visible).
 */
export function planDebtRepayment(
  debt: Pick<Debt, 'id' | 'direction' | 'currency' | 'counterparty'>,
  input: { total: number; interest: number; accountId: string | null; offAccounts?: boolean; date: ISODate; label: string; note?: string | null },
  categories: Pick<Category, 'id' | 'parentId' | 'deleted'>[],
  newId: NewId,
): { items: PlanItem[] } | { error: 'amount.invalid' | 'debt.interest' | 'account.missing' } {
  const split = splitRepayment(input.total, input.interest);
  if (!split) return { error: input.interest > input.total ? 'debt.interest' : 'amount.invalid' };
  if (debtPaymentAccountError({ accountId: input.accountId, offAccounts: input.offAccounts ?? null })) return { error: 'account.missing' };
  const items: PlanItem[] = [];
  let transactionId: string | null = null;
  if (input.accountId) {
    const owe = debt.direction === 'i_owe';
    const capital = txDoc(
      { type: owe ? 'expense' : 'income', amount: split.capital, currency: debt.currency, date: input.date, accountId: input.accountId, categoryId: owe ? 'cat_debts' : 'inc_other', debtId: debt.id, payee: debt.counterparty, note: input.note ?? input.label },
      newId('tx_'),
    );
    transactionId = capital.id;
    if (split.capital > 0) items.push(item('transactions', capital));
    else transactionId = null;
    if (split.interest > 0) {
      const cat = owe ? interestCategory(categories) : { categoryId: 'inc_other', subcategoryId: null };
      items.push(item('transactions', txDoc({ type: owe ? 'expense' : 'income', amount: split.interest, currency: debt.currency, date: input.date, accountId: input.accountId, ...cat, linkedTransactionId: transactionId, payee: debt.counterparty }, newId('tx_'))));
    }
  }
  if (split.capital > 0) {
    items.push(item('debtPayments', { debtId: debt.id, amount: split.capital, date: input.date, accountId: input.accountId, transactionId, note: input.note ?? null, offAccounts: input.accountId ? null : true, ...META, id: newId('dp_') } as DebtPayment));
  }
  return { items };
}

// ─── Récurrences (§8, D7) ────────────────────────────────────────────

/**
 * Confirmation d'une échéance (« payé ? », « reçu ? ») : l'opération porte l'identifiant
 * DÉTERMINISTE de l'échéance. Récurrence convertie en tontine : la confirmation EST la
 * cotisation de la période (opération liée + entrée du carnet), jamais deux paiements.
 */
export function planRecurringConfirmation(
  d: Pick<SpaceData, 'tontines' | 'tontineEntries'>,
  rule: RecurringRule,
  occurrence: ISODate,
  input: { amount?: number; accountId?: string; date?: ISODate },
  newId: NewId,
): PlanItem[] {
  void newId;
  const id = recurringTxId(rule.id, occurrence);
  const date = input.date ?? occurrence;
  const tontine = rule.type === 'expense' ? d.tontines.find((t) => !t.deleted && t.linkedRecurringId === rule.id && t.status !== 'finished') : undefined;
  const tx = txDoc(
    {
      type: rule.type,
      amount: input.amount ?? rule.amount,
      currency: rule.currency,
      date,
      accountId: input.accountId ?? rule.accountId,
      categoryId: rule.categoryId ?? null,
      subcategoryId: rule.subcategoryId ?? null,
      envelopeId: rule.type === 'expense' ? (rule.envelopeId ?? null) : null,
      payee: rule.label,
      recurringId: rule.id,
      tontineId: tontine?.id ?? null,
    },
    id,
  );
  const out = [item('transactions', tx)];
  if (tontine) {
    const schedule = buildSchedule(tontine, { until: occurrence > date ? occurrence : date });
    const slot = schedule.find((s) => monthKey(s.date) === monthKey(occurrence)) ?? schedule.filter((s) => s.date <= occurrence).pop() ?? schedule[0];
    const period = slot?.period ?? 1;
    const previous = d.tontineEntries.find((e) => !e.deleted && e.tontineId === tontine.id && e.kind === 'contribution' && e.period === period && !e.transactionId);
    out.push(item('tontineEntries', { tontineId: tontine.id, kind: 'contribution', period, amount: tx.amount, date, transactionId: tx.id, status: 'done', note: null, ...META, id: previous?.id ?? `tne_${id}` } as TontineEntry));
  }
  return out;
}

// ─── Comptes (§3) ────────────────────────────────────────────────────

export type AccountChangeError = 'account.notEmpty' | 'account.currencyLocked' | 'account.openingLocked';

/**
 * Garde-fous du cycle de vie (§3.3) et ouverture figée (§3.1) : rien ne change de devise,
 * de famille (courant ↔ épargne) ni n'est désactivé avec un solde ; l'ouverture ne se
 * réécrit plus dès la première opération (« Corriger le solde » à la place).
 */
export function accountChangeError(before: Account, draft: Pick<Account, 'currency' | 'isSavings' | 'active' | 'openingBalance'> & Partial<Account>, d: Pick<SpaceData, 'transactions'>, today: ISODate): AccountChangeError | null {
  void today;
  const balance = accountBalances([before], d.transactions)[before.id] ?? 0;
  return accountChangeRules(before, draft, balance, d.transactions);
}

/** « Corriger le solde » (§3.2) : l'ajustement de l'écart, avec un motif obligatoire ; l'ouverture n'est jamais réécrite. */
export function planBalanceCorrection(
  d: Pick<SpaceData, 'accounts' | 'transactions'>,
  accountId: string,
  actual: number,
  date: ISODate,
  reason: string,
  newId: NewId,
): { items: PlanItem[] } | { error: 'account.missing' | 'correction.none' | 'correction.reason' | 'amount.invalid' } {
  const account = d.accounts.find((a) => a.id === accountId && !a.deleted);
  if (!account) return { error: 'account.missing' };
  if (!Number.isInteger(actual)) return { error: 'amount.invalid' };
  const current = balancesAt(d.accounts, d.transactions, date)[accountId] ?? 0;
  if (current === actual) return { error: 'correction.none' };
  if (!reason.trim()) return { error: 'correction.reason' };
  const direction = actual > current ? 'in' : 'out';
  return { items: [item('transactions', txDoc({ type: 'adjustment', direction, amount: Math.abs(actual - current), currency: account.currency, date, accountId, reason: reason.trim() }, newId('tx_')))] };
}

// ─── Réserve (§5.3) ──────────────────────────────────────────────────

/**
 * Utilisation d'une réserve sur une dépense : elle ne paie qu'avec l'argent ADOSSÉ. Part mise
 * de côté sur le compte qui paie : la mise de côté prend fin ; part sur un autre compte :
 * transfert lié vers le compte qui paie, puis utilisation. La part hors comptes ne paie rien.
 */
export function planReserveUse(d: SpaceData, tx: Pick<Transaction, 'id' | 'amount' | 'accountId' | 'date' | 'currency'>, reserveId: string, currency: CurrencyCode, newId: NewId): { covered: number; uncovered: number; items: PlanItem[] } {
  const cover = reserveCover(d, reserveId, tx.amount, tx.accountId, currency);
  const items: PlanItem[] = [];
  const contribution = (amount: number, accountId: string, transferId: string | null) =>
    item('goalContributions', { goalId: reserveId, amount: -amount, date: tx.date, accountId, transferId, linkedTransactionId: tx.id, note: null, ...META, id: newId('gc_') } as GoalContribution);
  if (cover.sameAccount > 0) items.push(contribution(cover.sameAccount, tx.accountId, null));
  for (const part of [...cover.savings, ...cover.otherAccounts]) {
    const transfer = txDoc({ type: 'transfer', amount: part.amount, currency, date: tx.date, accountId: part.accountId, toAccountId: tx.accountId, goalId: reserveId }, newId('tx_'));
    items.push(item('transactions', transfer), contribution(part.amount, part.accountId, transfer.id));
  }
  return { covered: cover.covered, uncovered: cover.uncovered, items };
}
