import { describe, expect, it } from 'vitest';
import { localPayoutPhrases, matchTontine, tontineIntent } from '../src/core/tontineEntry';
import { parseEntryText } from '../src/core/entry/parse';
import type { Tontine } from '../src/core/types';

const tontine = (p: Partial<Tontine>): Tontine => ({
  id: p.id ?? 't1', createdAt: 1, updatedAt: 1, createdBy: 'u', type: 'rotating', name: 'Tontine du bureau', currency: 'XOF',
  amountPerShare: 10_000, sharesHeld: 1, frequency: 'monthly', startDate: '2026-01-05', membersCount: 10, myTurns: [6], status: 'active', ...p,
});
const office = tontine({});
const market = tontine({ id: 't2', name: 'Tontine du marché', amountPerShare: 5_000, frequency: 'weekly', startDate: '2026-10-02', membersCount: 8, myTurns: [8] });
const today = '2026-10-15';

describe('saisie : tontines', () => {
  it('intention : cotiser ou recevoir (formulations standard), sinon rien', () => {
    expect(tontineIntent('Tontine 10 000')).toBe('contribution');
    expect(tontineIntent("J'ai cotisé ma tontine du bureau")).toBe('contribution');
    expect(tontineIntent("J'ai reçu la tontine")).toBe('payout');
    expect(tontineIntent("J'ai touché la cagnotte")).toBe('payout');
    expect(tontineIntent('Taxi 2 000')).toBeNull();
  });

  it('expressions locales : inactives tant que le fondateur ne les valide pas', () => {
    expect(localPayoutPhrases()).toEqual([]);
    expect(tontineIntent("J'ai bouffé la tontine")).toBe('contribution');
    const validated = { tontinePayout: [{ phrase: 'j ai bouffe la tontine', actif: true }] };
    expect(tontineIntent("J'ai bouffé la tontine", validated)).toBe('payout');
  });

  it('rapprochement par nom, puis par montant, puis par échéance la plus proche', () => {
    // Bureau à jour jusqu'à septembre (prochaine : 5 octobre) ; marché en retard depuis le 2 octobre.
    const paid = Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, createdAt: 1, updatedAt: 1, createdBy: 'u', tontineId: 't1', kind: 'contribution' as const, period: i + 1, amount: 10_000, date: '2026-09-01', status: 'done' as const }));
    const base = { tontines: [office, market], entries: paid, today };
    expect(matchTontine({ ...base, text: "J'ai cotisé ma tontine du bureau", amount: null, kind: 'contribution' })).toMatchObject({ by: 'name', tontine: { id: 't1' } });
    expect(matchTontine({ ...base, text: 'Tontine 5 000', amount: 5_000, kind: 'contribution' })).toMatchObject({ by: 'amount', tontine: { id: 't2' } });
    // Échéance la plus proche : le marché (hebdomadaire, en retard depuis le 2 octobre).
    expect(matchTontine({ ...base, text: 'Tontine', amount: null, kind: 'contribution' })).toMatchObject({ by: 'due', tontine: { id: 't2' } });
    // Cagnotte : la prochaine que je dois recevoir.
    expect(matchTontine({ ...base, text: "J'ai reçu la tontine", amount: null, kind: 'payout' })).toMatchObject({ kind: 'payout', tontine: { id: 't1' }, item: { period: 6, payout: 100_000 } });
    expect(matchTontine({ ...base, tontines: [], text: 'Tontine', amount: null, kind: 'contribution' })).toBeNull();
  });

  it('le parseur range déjà « Tontine 10 000 » en dépense « Tontine » (non-régression)', () => {
    const r = parseEntryText('Tontine 10 000', { today, currency: 'XOF', accounts: [], categories: [{ id: 'cat_informal', createdAt: 1, updatedAt: 1, createdBy: 'u', kind: 'expense', name: 'Tontines', icon: 'x', color: '#000', order: 0 }], defaultAccountId: null });
    expect(r.kind === 'entries' && [r.items[0].type, r.items[0].amount, r.items[0].categoryId]).toEqual(['expense', 10_000, 'cat_informal']);
  });
});

describe('carte de confirmation : tontine proposée', () => {
  const ctx = { tontines: [office], entries: [], today, defaultAccountId: 'om', payoutCategory: 'inc_tontine', contributionCategory: 'cat_informal' };
  const draft = (p = {}) => ({ type: 'expense' as const, amount: 10_000, categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine', accountId: 'om', date: today, payee: null, uncertain: [] as ('type' | 'amount' | 'category' | 'account')[], source: 'Tontine 10 000', ...p });
  it('« Tontine 10 000 » : ligne liée à l’échéance de la tontine', async () => {
    const { applyTontine } = await import('../src/core/tontineEntry');
    expect(applyTontine([draft()], { ...ctx, text: 'Tontine 10 000' })?.[0]).toMatchObject({ type: 'expense', amount: 10_000, payee: 'Tontine du bureau', tontine: { id: 't1', kind: 'contribution' } });
  });
  it('« J’ai reçu la tontine » sans montant : revenu de la cagnotte attendue, sens et catégorie déduits de la tontine', async () => {
    const { applyTontine } = await import('../src/core/tontineEntry');
    expect(applyTontine([], { ...ctx, text: "J'ai reçu la tontine" })?.[0]).toMatchObject({ type: 'income', amount: 100_000, categoryId: 'inc_tontine', tontine: { id: 't1', period: 6, kind: 'payout' } });
  });
  it('sans tontine suivie ou phrase ordinaire : rien ne change', async () => {
    const { applyTontine } = await import('../src/core/tontineEntry');
    expect(applyTontine([draft()], { ...ctx, tontines: [], text: 'Tontine 10 000' })).toBeNull();
    expect(applyTontine([draft({ categoryId: 'cat_transport' })], { ...ctx, text: 'Taxi 2 000' })).toBeNull();
  });
});
