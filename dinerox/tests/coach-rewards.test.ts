/** Phase 4 — récompenses : catalogue, anti-triche, idempotence, séries. */
import { describe, expect, it } from 'vitest';
import { REWARDS, evaluateRewards, monthToEvaluate, rewardProgress, type RewardRecord } from '../src/core/coach/rewards';
import { emptySpaceData, type SpaceData } from '../src/core/types';
import { account, envelope, goal, tx } from './helpers';

const food = envelope({ id: 'food', monthlyBudget: 100_000, categoryIds: ['cat_food'] });
const sav = account({ id: 'sav', isSavings: true });
/** Mois avec `n` dépenses de 1 000 en nourriture (+ éventuel dépassement, + éventuelle épargne). */
function month(m: string, n: number, o: { over?: boolean; save?: boolean } = {}) {
  const t = Array.from({ length: n }, (_, i) => tx({ type: 'expense', amount: 1_000, accountId: 'a', categoryId: 'cat_food', date: `${m}-${String((i % 27) + 1).padStart(2, '0')}` }));
  if (o.over) t.push(tx({ type: 'expense', amount: 200_000, accountId: 'a', categoryId: 'cat_food', date: `${m}-28` }));
  if (o.save) t.push(tx({ type: 'transfer', amount: 20_000, accountId: 'a', toAccountId: 'sav', date: `${m}-15` }));
  return t;
}
const data = (transactions = month('2026-09', 12), extra: Partial<SpaceData> = {}): SpaceData => ({ ...emptySpaceData(), envelopes: [food], accounts: [account({ id: 'a' }), sav], transactions, ...extra });
const ids = (r: RewardRecord[]) => r.map((x) => `${x.rewardId}:${x.period}`).sort();

describe('récompenses', () => {
  it('catalogue : chaque entrée a ses clés i18n FR/EN', async () => {
    const { fr } = await import('../src/i18n/fr');
    const { en } = await import('../src/i18n/en');
    for (const r of REWARDS) for (const k of [r.nameKey, r.descKey, r.messageKey]) {
      expect(fr[k as keyof typeof fr], k).toBeTypeOf('string');
      expect(en[k as keyof typeof en], k).toBeTypeOf('string');
    }
  });
  it('mois respecté avec ≥ 10 opérations : maître du budget attribué', () => {
    expect(ids(evaluateRewards({ data: data(), currency: 'XOF', month: '2026-09', history: [] }, 1))).toEqual(['budget_master:2026-09']);
  });
  it('anti-triche : mois avec moins de 10 opérations → rien (mois vide aussi)', () => {
    expect(evaluateRewards({ data: data(month('2026-09', 9)), currency: 'XOF', month: '2026-09', history: [] }, 1)).toEqual([]);
    expect(evaluateRewards({ data: data([]), currency: 'XOF', month: '2026-09', history: [] }, 1)).toEqual([]);
  });
  it('non remplie : budget dépassé → pas de récompense, progression partielle', () => {
    const d = data(month('2026-09', 12, { over: true }));
    expect(evaluateRewards({ data: d, currency: 'XOF', month: '2026-09', history: [] }, 1)).toEqual([]);
    expect(rewardProgress({ data: d, currency: 'XOF', month: '2026-09', history: [] }).budget_master).toBe(0);
  });
  it('progression du mois en cours (rien d’attribué avant la clôture)', () => {
    const p = rewardProgress({ data: data(month('2026-10', 5)), currency: 'XOF', month: '2026-10', history: [] });
    expect(p.budget_master).toBe(0.5);
    expect(monthToEvaluate('2026-10-01')).toBe('2026-09');
  });
  it('jamais deux fois la même récompense pour la même période', () => {
    const first = evaluateRewards({ data: data(), currency: 'XOF', month: '2026-09', history: [] }, 1);
    expect(evaluateRewards({ data: data(), currency: 'XOF', month: '2026-09', history: first }, 2)).toEqual([]);
  });
  it('épargne + budget : épargnant régulier et excellent comportement', () => {
    const r = evaluateRewards({ data: data(month('2026-09', 12, { save: true })), currency: 'XOF', month: '2026-09', history: [] }, 1);
    expect(ids(r)).toEqual(['budget_master:2026-09', 'excellent:2026-09', 'regular_saver:2026-09']);
  });
  it('série : discipline après 3 mois consécutifs tenus', () => {
    const all = [...month('2026-07', 12), ...month('2026-08', 12), ...month('2026-09', 12)];
    let history: RewardRecord[] = [];
    for (const m of ['2026-07', '2026-08', '2026-09']) history = [...history, ...evaluateRewards({ data: data(all), currency: 'XOF', month: m, history }, 1)];
    expect(history.filter((r) => r.rewardId === 'discipline').map((r) => r.period)).toEqual(['2026-09']);
    // Série rompue : août dépassé → pas de discipline en septembre.
    const broken = [...month('2026-07', 12), ...month('2026-08', 12, { over: true }), ...month('2026-09', 12)];
    let h2: RewardRecord[] = [];
    for (const m of ['2026-07', '2026-08', '2026-09']) h2 = [...h2, ...evaluateRewards({ data: data(broken), currency: 'XOF', month: m, history: h2 }, 1)];
    expect(h2.some((r) => r.rewardId === 'discipline')).toBe(false);
  });
  it('objectif atteint : une fois par objectif ; objectif créé « déjà rempli » refusé (triche)', () => {
    const g = goal({ id: 'moto', targetAmount: 100_000, initialAmount: 40_000 });
    const c = { id: 'c1', goalId: 'moto', amount: 60_000, date: '2026-09-10', createdAt: 1, updatedAt: 1, createdBy: 'u' };
    const r = evaluateRewards({ data: data(month('2026-09', 3), { goals: [g], goalContributions: [c] }), currency: 'XOF', month: '2026-09', history: [] }, 1);
    expect(ids(r)).toEqual(['goal_achieved:moto']);
    expect(evaluateRewards({ data: data(month('2026-09', 3), { goals: [g], goalContributions: [c] }), currency: 'XOF', month: '2026-10', history: r }, 2)).toEqual([]);
    const cheat = goal({ id: 'triche', targetAmount: 100_000, initialAmount: 100_000 });
    expect(evaluateRewards({ data: data(month('2026-09', 3), { goals: [cheat] }), currency: 'XOF', month: '2026-09', history: [] }, 1)).toEqual([]);
  });
  it('fonds d’urgence : seules les contributions comptent', () => {
    const fund = goal({ id: 'fund', templateId: 'emergency_fund', targetAmount: 300_000, initialAmount: 300_000 } as never);
    expect(evaluateRewards({ data: data(month('2026-09', 3), { goals: [fund] }), currency: 'XOF', month: '2026-09', history: [] }, 1)).toEqual([]);
    const c = { id: 'c', goalId: 'fund', amount: 100_000, date: '2026-09-10', createdAt: 1, updatedAt: 1, createdBy: 'u' };
    const fresh = { ...fund, initialAmount: 0 };
    expect(ids(evaluateRewards({ data: data(month('2026-09', 3), { goals: [fresh], goalContributions: [c] }), currency: 'XOF', month: '2026-09', history: [] }, 1))).toEqual(['emergency_fund:fund']);
  });
});
