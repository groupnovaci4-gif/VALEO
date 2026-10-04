import type { Account, Envelope, Goal, Transaction } from '../src/core/types';

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
