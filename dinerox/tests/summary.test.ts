import { describe, expect, it } from 'vitest';
import { buildFinanceSummary } from '../src/core/ai/summary';
import { emptySpaceData } from '../src/core/types';
import { account, tx } from './helpers';

describe('résumé envoyé à l IA', () => {
  it('ne contient ni bénéficiaire ni note', () => {
    const data = emptySpaceData();
    data.accounts = [account({ id: 'c' })];
    data.transactions = [tx({ type: 'expense', amount: 5000, accountId: 'c', payee: 'Dr Kouassi', note: 'tel 0707070707', categoryId: 'cat_health' })];
    const json = JSON.stringify(buildFinanceSummary(data, 'XOF', '2026-10-04', (id) => id));
    expect(json).not.toContain('Kouassi');
    expect(json).not.toContain('0707');
    expect(json).toContain('cat_health');
  });
});
