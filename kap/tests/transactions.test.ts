import { describe, expect, it } from 'vitest';
import { validateTransaction, filterTransactions } from '../src/core/transactions';
import { dueOccurrences, materialize, recurringTxId } from '../src/core/recurring';
import { account, tx } from './helpers';
import type { RecurringRule } from '../src/core/types';

const cash = account({ id: 'cash' });
const wave = account({ id: 'wave' });
const eur = account({ id: 'eur', currency: 'EUR' });
const off = account({ id: 'off', active: false });

describe('validation', () => {
  const ok = { type: 'expense' as const, amount: 5000, date: '2026-10-04', accountId: 'cash', currency: 'XOF' };
  it('accepte une dépense valide', () => expect(validateTransaction(ok, [cash])).toEqual([]));
  it('montant 0 ou négatif refusé', () => {
    expect(validateTransaction({ ...ok, amount: 0 }, [cash])).toContain('amount.invalid');
    expect(validateTransaction({ ...ok, amount: -5 }, [cash])).toContain('amount.invalid');
  });
  it('date invalide', () => expect(validateTransaction({ ...ok, date: '2026-02-30' }, [cash])).toContain('date.invalid'));
  it('compte inactif ou inconnu', () => {
    expect(validateTransaction({ ...ok, accountId: 'off' }, [off])).toContain('account.inactive');
    expect(validateTransaction({ ...ok, accountId: 'nope' }, [cash])).toContain('account.missing');
  });
  it('transfert vers le même compte refusé', () => {
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'cash' }, [cash])).toContain('transfer.sameAccount');
  });
  it('transfert sans destination refusé', () => {
    expect(validateTransaction({ ...ok, type: 'transfer' }, [cash])).toContain('transfer.missingTarget');
  });
  it('transfert valide', () => expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'wave' }, [cash, wave])).toEqual([]));
  it('transfert entre devises : montant reçu obligatoire', () => {
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'eur' }, [cash, eur])).toContain('transfer.currencyMismatch');
    expect(validateTransaction({ ...ok, type: 'transfer', toAccountId: 'eur', toAmount: 760 }, [cash, eur])).toEqual([]);
  });
  it('devise de l opération ≠ devise du compte refusée', () => {
    expect(validateTransaction({ ...ok, currency: 'EUR' }, [cash])).toContain('currency.mismatch');
  });
});

describe('filtres', () => {
  it('filtre par type, compte (y compris destination) et texte', () => {
    const list = [
      tx({ type: 'expense', amount: 1, accountId: 'cash', payee: 'Maquis Chez Tantie' }),
      tx({ type: 'transfer', amount: 1, accountId: 'cash', toAccountId: 'wave' }),
      tx({ type: 'income', amount: 1, accountId: 'wave', deleted: true }),
    ];
    expect(filterTransactions(list, { accountId: 'wave' })).toHaveLength(1);
    expect(filterTransactions(list, { search: 'maquis' })).toHaveLength(1);
    expect(filterTransactions(list, { type: 'income' })).toHaveLength(0);
  });
});

describe('récurrences', () => {
  const rule: RecurringRule = {
    id: 'r1', type: 'income', label: 'Salaire', amount: 450_000, currency: 'XOF', accountId: 'cash',
    frequency: 'monthly', startDate: '2026-07-25', active: true, lastGenerated: null, createdAt: 1, updatedAt: 1, createdBy: 'u',
  };
  it('génère les échéances dues, pas les futures', () => {
    expect(dueOccurrences(rule, '2026-10-04')).toEqual(['2026-07-25', '2026-08-25', '2026-09-25']);
  });
  it('ne regénère pas une échéance déjà produite', () => {
    expect(dueOccurrences({ ...rule, lastGenerated: '2026-08-25' }, '2026-10-04')).toEqual(['2026-09-25']);
  });
  it('règle inactive → rien ; plafond', () => {
    expect(dueOccurrences({ ...rule, active: false }, '2026-10-04')).toEqual([]);
    expect(dueOccurrences({ ...rule, startDate: '2000-01-01' }, '2026-10-04', 5)).toHaveLength(5);
  });
  it('fin de mois : le 31 reste le 31', () => {
    expect(dueOccurrences({ ...rule, startDate: '2026-01-31' }, '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('identifiant déterministe → pas de doublon entre appareils', () => {
    const a = materialize(rule, '2026-09-25', { now: 1, uid: 'u' });
    const b = materialize(rule, '2026-09-25', { now: 2, uid: 'v' });
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(recurringTxId('r1', '2026-09-25'));
  });
});

describe('règle commencée dans le passé', () => {
  it('pas de génération rétroactive', async () => {
    const { lastOccurrenceBefore } = await import('../src/core/recurring');
    expect(lastOccurrenceBefore({ frequency: 'monthly', startDate: '2026-01-25' }, '2026-10-04')).toBe('2026-09-25');
    expect(lastOccurrenceBefore({ frequency: 'monthly', startDate: '2026-12-25' }, '2026-10-04')).toBeNull();
  });
});
