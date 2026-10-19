/**
 * Carte de validation d'une action comprise (docs/ia-comprend-tout.md §2.2, §3). Module PUR.
 *
 *  - `buildActionCard` : titre avec le verbe et le montant, « Depuis → vers », date, argent
 *    disponible après, champs à vérifier (surlignés) ; signale un montant qui dépasse ce que le
 *    compte peut payer (l'écran passe alors par la feuille de complément du §6, `useMoneyGuard`).
 *    Ne touche à rien : AUCUNE écriture avant « Valider ».
 *  - `runAction` : appelée seulement par « Valider ». Passe par l'écriture EXISTANTE de
 *    `useActions()` (contrôles, rôles, horodatage) et renvoie l'« Annuler » du toast (5 s).
 *  - `actionGate` : droits du rôle (`can`, `canCreateTransaction`, `canUseReserve`).
 */
import type { ActionIntent, ActionKind } from './intent';
import type { SourceChoice } from '../writePlans';
import { accountPositions, positionOf } from '../position';
import { recurringToConfirm } from '../recurringConfirm';
import { upcomingOccurrence } from '../recurring';
import { addMonths, type ISODate } from '../dates';
import { can, canCreateTransaction, canUseReserve } from '../permissions';
import type { CurrencyCode } from '../money';
import type { CollectionName, Role, SpaceData } from '../types';

export interface CardLine {
  key: string;
  params?: Record<string, string | number>;
}

export interface ActionCard {
  intent: ActionIntent;
  titleKey: string;
  titleParams: Record<string, string | number>;
  lines: CardLine[];
  /** Argent disponible après l'action (null : l'action ne le change pas). */
  availableAfter: number | null;
  /** Le montant dépasse ce que le compte peut payer : complément (§6.3) avant toute écriture. */
  shortfall: boolean;
  /** Champs à vérifier, surlignés (jamais devinés). */
  uncertain: ('amount' | 'from' | 'to' | 'ref')[];
}

export interface CardCtx {
  data: SpaceData;
  currency: CurrencyCode;
  today: ISODate;
}

/** Actions qui font SORTIR de l'argent d'un compte courant (contrôle du §6). */
const OUTFLOW: ReadonlySet<ActionKind> = new Set(['save', 'transfer', 'goal_contribute', 'debt_repayment', 'reserve_use']);

/** Effet sur l'argent disponible (D) : − sortie d'un compte courant, + entrée sur un compte courant. */
function deltaOnAvailable(i: ActionIntent, ctx: CardCtx): number | null {
  const amount = i.amount ?? 0;
  const isCurrent = (id?: string | null) => !!id && ctx.data.accounts.some((a) => a.id === id && !a.isSavings);
  switch (i.action) {
    case 'save':
    case 'debt_repayment':
      return -amount;
    case 'withdraw_savings':
      return isCurrent(i.to?.id) ? amount : 0;
    case 'transfer':
      return (isCurrent(i.to?.id) ? amount : 0) - (isCurrent(i.from?.id) ? amount : 0);
    case 'goal_contribute':
      return isCurrent(i.from?.id) ? -amount : 0;
    case 'debt_create':
      return i.direction === 'i_owe' ? amount : -amount;
    case 'recurring_confirm': {
      const r = ctx.data.recurring.find((x) => x.id === i.ref?.id);
      return r ? (r.type === 'income' ? r.amount : -r.amount) : null;
    }
    default:
      return null;
  }
}

export function buildActionCard(i: ActionIntent, ctx: CardCtx): ActionCard {
  const amount = i.amount ?? 0;
  const name = i.ref?.label ?? i.label ?? '';
  const rule = i.action === 'recurring_confirm' ? ctx.data.recurring.find((x) => x.id === i.ref?.id) : undefined;
  const title: Record<ActionKind, [string, Record<string, string | number>]> = {
    save: ['ia.card.save', { amount }],
    withdraw_savings: ['ia.card.withdraw', { amount }],
    transfer: ['ia.card.transfer', { amount }],
    goal_contribute: ['ia.card.goal', { amount, name }],
    goal_create: ['ia.card.goalCreate', { name, amount }],
    debt_repayment: ['ia.card.repay', { amount, name }],
    debt_create: [i.direction === 'i_owe' ? 'ia.card.borrow' : 'ia.card.lend', { amount, name }],
    recurring_confirm: [rule?.type === 'income' ? 'ia.card.recurringReceived' : 'ia.card.recurringPaid', { amount: rule?.amount ?? 0, name }],
    reserve_use: ['ia.card.reserveUse', { amount, name }],
    envelope_budget: ['ia.card.envelope', { amount, name }],
    recurring_create: ['ia.card.recurringCreate', { amount, name: i.label ?? '' }],
  };
  const [titleKey, titleParams] = title[i.action];
  const lines: CardLine[] = [];
  if (i.from && i.to) lines.push({ key: 'ia.card.fromTo', params: { from: i.from.label, to: i.to.label } });
  else if (i.from) lines.push({ key: 'ia.card.from', params: { from: i.from.label } });
  else if (i.to) lines.push({ key: 'ia.card.to', params: { to: i.to.label } });
  if (i.action === 'recurring_create' && i.dueDay) lines.push({ key: 'ia.card.dueDay', params: { day: i.dueDay } });
  if (i.categoryId && (i.action === 'reserve_use' || i.action === 'recurring_create')) lines.push({ key: 'ia.card.category', params: { category: i.subcategoryId ?? i.categoryId } });
  if (i.action !== 'envelope_budget' && i.action !== 'recurring_create' && i.action !== 'goal_create') lines.push({ key: 'ia.card.date', params: { date: i.date } });

  const delta = deltaOnAvailable(i, ctx);
  const available = positionOf(ctx.data, ctx.currency, ctx.today).available;
  const availableAfter = delta === null || delta === 0 ? null : available + delta;
  if (availableAfter !== null) lines.push({ key: 'ia.card.availableAfter', params: { availableAfter } });

  const debitable = i.from ? accountPositions(ctx.data, ctx.currency, ctx.today)[i.from.id]?.debitable : undefined;
  const fromCurrent = !!i.from && ctx.data.accounts.some((a) => a.id === i.from!.id && !a.isSavings);
  const shortfall = OUTFLOW.has(i.action) && fromCurrent && i.amount !== null && debitable !== undefined && i.amount > debitable;

  const uncertain: ActionCard['uncertain'] = [];
  if (i.amount === null && i.action !== 'recurring_confirm') uncertain.push('amount');
  if (needsRef(i.action) && !i.ref) uncertain.push('ref');
  return { intent: i, titleKey, titleParams, lines, availableAfter, shortfall, uncertain };
}

const needsRef = (a: ActionKind) => a === 'goal_contribute' || a === 'debt_repayment' || a === 'recurring_confirm' || a === 'reserve_use' || a === 'envelope_budget';

/** Ce dont `runAction` a besoin de `useActions()` (le vrai hook, ou un double dans les tests). */
export interface ActionPort {
  depositToSavings: (input: { savingsAccountId: string; fromAccountId: string | null; amount: number; date: string; goal: null; choices: SourceChoice[] }) => { id: string };
  withdrawFromSavings: (input: { savingsAccountId: string; toAccountId: string; amount: number; date: string; goal: null; choices: SourceChoice[] }) => { id: string };
  saveTransaction: (draft: never, opts: never) => { id: string };
  contributeToGoal: (input: { goalId: string; amount: number; date: string; accountId: string | null; choices: SourceChoice[] }) => { id: string };
  createGoal: (draft: never) => { id: string };
  recordDebtPayment: (input: { debtId: string; amount: number; date: string; accountId: string | null; label: string; choices: SourceChoice[] }) => { id: string } | null;
  saveDebt: (draft: never, opts: never) => { id: string };
  confirmRecurring: (input: { ruleId: string; occurrence: string; date: string; choices: SourceChoice[] }) => string;
  saveEnvelope: (draft: never) => { id: string };
  saveRecurring: (draft: never) => { id: string };
  remove: (col: CollectionName, id: string) => void;
  save: (col: CollectionName, draft: never) => unknown;
}

/** Prochaine date au jour `day` du mois (aujourd'hui compris). */
function nextDay(today: ISODate, day: number): ISODate {
  const d = String(Math.min(28, Math.max(1, day))).padStart(2, '0');
  const thisMonth = `${today.slice(0, 7)}-${d}` as ISODate;
  return thisMonth >= today ? thisMonth : (`${addMonths(today, 1).slice(0, 7)}-${d}` as ISODate);
}

/**
 * « Valider » : écrit par l'action existante (contrôles de `useActions`). `choices` : compléments
 * choisis sur la feuille du §6. Renvoie l'« Annuler » du toast (supprime ce qui vient d'être écrit,
 * ou remet l'enveloppe comme avant).
 */
export function runAction(i: ActionIntent, port: ActionPort, ctx: CardCtx, choices: SourceChoice[]): { undo: () => void } {
  const amount = i.amount;
  if (amount === null && i.action !== 'recurring_confirm') throw new Error('amount');
  const a = amount ?? 0;
  const removeUndo = (col: CollectionName, id: string | undefined | null) => ({ undo: () => (id ? port.remove(col, id) : undefined) });
  switch (i.action) {
    case 'save':
      return removeUndo('transactions', port.depositToSavings({ savingsAccountId: i.to!.id, fromAccountId: i.from?.id ?? null, amount: a, date: i.date, goal: null, choices }).id);
    case 'withdraw_savings':
      return removeUndo('transactions', port.withdrawFromSavings({ savingsAccountId: i.from!.id, toAccountId: i.to!.id, amount: a, date: i.date, goal: null, choices }).id);
    case 'transfer':
      return removeUndo('transactions', port.saveTransaction({ type: 'transfer', amount: a, currency: ctx.currency, date: i.date, accountId: i.from!.id, toAccountId: i.to!.id } as never, { choices } as never).id);
    case 'goal_contribute':
      return removeUndo('goalContributions', port.contributeToGoal({ goalId: i.ref!.id, amount: a, date: i.date, accountId: i.from?.id ?? null, choices }).id);
    case 'goal_create':
      return removeUndo(
        'goals',
        port.createGoal({ name: i.label ?? '', categoryId: 'custom', templateId: null, type: 'custom', icon: '🎯', currency: ctx.currency, targetAmount: a, initialAmount: 0, targetDate: null, priority: 'normal', rank: 0, accountId: null, monthlyContribution: null, scope: 'personal', status: 'active', history: [] } as never).id,
      );
    case 'debt_repayment':
      return removeUndo('debtPayments', port.recordDebtPayment({ debtId: i.ref!.id, amount: a, date: i.date, accountId: i.from?.id ?? null, label: i.ref!.label, choices })?.id);
    case 'debt_create': {
      const accountId = i.direction === 'i_owe' ? i.to?.id : i.from?.id;
      const draft = { direction: i.direction ?? 'i_owe', kind: 'personal', counterparty: i.label ?? '', principal: a, currency: ctx.currency, startDate: i.date, status: 'active' };
      return removeUndo('debts', port.saveDebt(draft as never, { accountId: accountId ?? null, date: i.date, choices } as never).id);
    }
    case 'recurring_confirm': {
      const rule = ctx.data.recurring.find((r) => r.id === i.ref?.id);
      if (!rule) throw new Error('recurring');
      const due = recurringToConfirm(ctx.data, ctx.today).find((c) => c.ruleId === rule.id)?.date ?? upcomingOccurrence(rule, ctx.today) ?? ctx.today;
      return removeUndo('transactions', port.confirmRecurring({ ruleId: rule.id, occurrence: due, date: i.date, choices }));
    }
    case 'reserve_use':
      return removeUndo(
        'transactions',
        port.saveTransaction({ type: 'expense', amount: a, currency: ctx.currency, date: i.date, accountId: i.from!.id, categoryId: i.categoryId ?? null, subcategoryId: i.subcategoryId ?? null, payee: null, note: null } as never, { reserveId: i.ref!.id, choices } as never).id,
      );
    case 'envelope_budget': {
      const before = ctx.data.envelopes.find((e) => e.id === i.ref!.id)!;
      port.saveEnvelope({ ...before, monthlyBudget: a } as never);
      return { undo: () => port.save('envelopes', before as never) };
    }
    case 'recurring_create':
      return removeUndo(
        'recurring',
        port.saveRecurring({ type: i.type ?? 'expense', label: i.label ?? '', amount: a, currency: ctx.currency, accountId: i.from!.id, categoryId: i.categoryId ?? null, subcategoryId: i.subcategoryId ?? null, frequency: 'monthly', startDate: i.dueDay ? nextDay(ctx.today, i.dueDay) : ctx.today, active: true } as never).id,
      );
  }
}

/** Droits du rôle : null si l'action est permise, sinon le message (clé i18n). */
export function actionGate(action: ActionKind, role: Role | null): string | null {
  const ok: Record<ActionKind, boolean> = {
    save: canCreateTransaction(role, 'transfer'),
    withdraw_savings: canCreateTransaction(role, 'transfer'),
    transfer: canCreateTransaction(role, 'transfer'),
    goal_contribute: can(role, 'create', 'goalContributions'),
    goal_create: can(role, 'create', 'goals'),
    debt_repayment: can(role, 'create', 'debtPayments'),
    debt_create: can(role, 'create', 'debts'),
    recurring_confirm: canCreateTransaction(role, 'expense') && can(role, 'read', 'recurring'),
    reserve_use: canUseReserve(role),
    envelope_budget: can(role, 'update', 'envelopes'),
    recurring_create: can(role, 'create', 'recurring'),
  };
  return ok[action] ? null : 'ia.a.roleLocked';
}
