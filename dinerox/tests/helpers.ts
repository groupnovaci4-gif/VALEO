import type { Account, Debt, DebtPayment, Envelope, Goal, GoalContribution, RecurringRule, SpaceData, Tontine, TontineEntry, Transaction } from '../src/core/types';
import { emptySpaceData } from '../src/core/types';

let n = 0;
const base = () => ({ createdAt: 1, updatedAt: 1, createdBy: 'u1' });

export function account(p: Partial<Account> = {}): Account {
  return {
    ...base(),
    id: p.id ?? `acc${++n}`,
    name: 'Compte',
    type: 'cash',
    provider: 'none',
    currency: 'XOF',
    openingBalance: 0,
    color: '#000',
    icon: 'cash',
    active: true,
    isSavings: false,
    order: 0,
    ...p,
  };
}

export function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId'>): Transaction {
  return { ...base(), id: p.id ?? `tx${++n}`, currency: 'XOF', date: '2026-10-04', ...p };
}

export function envelope(p: Partial<Envelope> = {}): Envelope {
  return { ...base(), id: p.id ?? `env${++n}`, name: 'Env', icon: 'x', color: '#000', monthlyBudget: 0, categoryIds: [], order: 0, active: true, ...p };
}

export function goal(p: Partial<Goal> = {}): Goal {
  return {
    ...base(),
    id: p.id ?? `goal${++n}`,
    name: 'Objectif',
    categoryId: 'vehicle',
    type: 'purchase',
    icon: '🚗',
    currency: 'XOF',
    targetAmount: 0,
    initialAmount: 0,
    priority: 'normal',
    rank: 1,
    scope: 'personal',
    status: 'active',
    history: [],
    ...p,
  };
}

// ─── Argent disponible (v2) : constructeurs de données d'un espace ─────


export function space(p: Partial<SpaceData> = {}): SpaceData {
  return { ...emptySpaceData(), ...p };
}

export function contribution(p: Partial<GoalContribution> & Pick<GoalContribution, 'goalId' | 'amount'>): GoalContribution {
  return { ...base(), id: p.id ?? `gc${++n}`, date: '2026-10-04', ...p };
}

export function rule(p: Partial<RecurringRule> & Pick<RecurringRule, 'amount' | 'accountId'>): RecurringRule {
  return { ...base(), id: p.id ?? `rule${++n}`, type: 'expense', label: 'Règle', currency: 'XOF', frequency: 'monthly', startDate: '2026-01-01', active: true, ...p };
}

export function tontine(p: Partial<Tontine> = {}): Tontine {
  return {
    ...base(),
    id: p.id ?? `ton${++n}`,
    type: 'rotating',
    name: 'Tontine',
    currency: 'XOF',
    amountPerShare: 10_000,
    sharesHeld: 1,
    frequency: 'monthly',
    startDate: '2026-01-05',
    membersCount: 10,
    myTurns: [6],
    status: 'active',
    ...p,
  };
}

export function tentry(p: Partial<TontineEntry> & Pick<TontineEntry, 'tontineId' | 'kind' | 'period' | 'amount'>): TontineEntry {
  return { ...base(), id: p.id ?? `te${++n}`, date: '2026-10-04', status: 'done', ...p };
}

export function debt(p: Partial<Debt> = {}): Debt {
  return { ...base(), id: p.id ?? `debt${++n}`, direction: 'i_owe', kind: 'bank', counterparty: 'Banque', principal: 100_000, currency: 'XOF', startDate: '2026-01-01', status: 'active', ...p };
}

export function payment(p: Partial<DebtPayment> & Pick<DebtPayment, 'debtId' | 'amount'>): DebtPayment {
  return { ...base(), id: p.id ?? `dp${++n}`, date: '2026-10-04', ...p };
}
