/** Phase 6 — conseil du jour déterministe et minimisation des données envoyées à l'IA. */
import { describe, expect, it } from 'vitest';
import { adviceOfDay, reformulationQuestion } from '../src/core/coach/advice';
import { buildFinanceSummary } from '../src/core/ai/summary';
import type { Recommendation } from '../src/core/intelligence';
import { emptySpaceData } from '../src/core/types';
import { account, envelope, goal, tx } from './helpers';

const rec = (kind: Recommendation['kind'], weight: number, severity: Recommendation['severity'] = 'info'): Recommendation => ({ id: kind, kind, severity, params: {}, source: 'user', weight });

describe('conseil du jour', () => {
  const recs = [rec('capacity_positive', 60), rec('emergency_fund', 50), rec('family_share', 40), rec('fixed_ratio_ok', 99), rec('category_spike', 10)];
  it('stable dans la journée, rotation d’un jour à l’autre parmi les 3 plus importants', () => {
    expect(adviceOfDay(recs, '2026-10-07')).toEqual(adviceOfDay(recs, '2026-10-07'));
    const seen = new Set(['2026-10-07', '2026-10-08', '2026-10-09'].map((d) => adviceOfDay(recs, d)!.kind));
    expect(seen).toEqual(new Set(['capacity_positive', 'emergency_fund', 'family_share']));
  });
  it('un conseil urgent reste en tête ; « charges fixes correctes » n’est pas un conseil', () => {
    expect(adviceOfDay([...recs, rec('low_balance_risk', 95, 'danger')], '2026-10-08')!.kind).toBe('low_balance_risk');
    expect(adviceOfDay([rec('fixed_ratio_ok', 99)], '2026-10-08')).toBeNull();
    expect(adviceOfDay([], '2026-10-08')).toBeNull();
  });
  it('question à l’IA : 500 caractères maximum (limite serveur), conseil inclus', () => {
    const q = reformulationQuestion('x'.repeat(2000), 'fr');
    expect(q.length).toBeLessThanOrEqual(500);
    expect(reformulationQuestion('Épargnez 10 000 FCFA', 'en')).toContain('Épargnez 10 000 FCFA');
  });
});

describe('résumé envoyé à l’IA : minimisation (promesse du consentement)', () => {
  it('ni bénéficiaires, ni notes, ni coordonnées, ni nom de créancier', () => {
    const data = {
      ...emptySpaceData(),
      accounts: [account({ id: 'a', name: 'Compte Orange 0707070707' })],
      envelopes: [envelope({ id: 'food', name: 'Nourriture', monthlyBudget: 100_000, categoryIds: ['cat_food'] })],
      goals: [goal({ id: 'g', name: 'Moto', targetAmount: 500_000 })],
      transactions: [tx({ type: 'expense', amount: 5_000, accountId: 'a', categoryId: 'cat_food', payee: 'Maquis Chez Tantie', note: 'secret: code 1234', date: '2026-10-05' })],
      debts: [{ id: 'd', direction: 'i_owe', kind: 'personal', counterparty: 'Tonton Yao +2250102030405', principal: 50_000, currency: 'XOF', startDate: '2026-01-01', status: 'active', createdAt: 1, updatedAt: 1, createdBy: 'u' }],
    };
    const json = JSON.stringify(buildFinanceSummary(data as never, 'XOF', '2026-10-07', () => 'Nourriture'));
    for (const secret of ['Maquis', 'Tantie', 'secret', '1234', 'Tonton', '0102030405', '0707070707', 'Orange']) expect(json, secret).not.toContain(secret);
    expect(json).toContain('Nourriture');
  });
});
