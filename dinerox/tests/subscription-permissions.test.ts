import { describe, expect, it } from 'vitest';
import { effectivePlan, hasFeature, minimumPlanFor, withinLimit, defaultSubscription } from '../src/core/subscription';
import { can, canChangeRole, canEditDoc, roleIn } from '../src/core/permissions';

describe('abonnements', () => {
  it('plan par défaut : gratuit', () => {
    expect(effectivePlan(null)).toBe('free');
    expect(effectivePlan(defaultSubscription())).toBe('free');
  });
  it('un abonnement expiré ou annulé retombe sur gratuit', () => {
    expect(effectivePlan({ plan: 'plus', status: 'active', provider: 'stripe', expiresAt: 1000, updatedAt: 0 }, 2000)).toBe('free');
    expect(effectivePlan({ plan: 'family', status: 'canceled', provider: 'stripe', updatedAt: 0 })).toBe('free');
    expect(effectivePlan({ plan: 'family', status: 'active', provider: 'stripe', expiresAt: 5000, updatedAt: 0 }, 2000)).toBe('family');
  });
  it('plan inconnu → gratuit', () => {
    expect(effectivePlan({ plan: 'gold' as never, status: 'active', provider: 'manual', updatedAt: 0 })).toBe('free');
  });
  it('droits par niveau', () => {
    expect(hasFeature('free', 'ai_assistant')).toBe(false);
    expect(hasFeature('plus', 'ai_assistant')).toBe(true);
    expect(hasFeature('plus', 'net_worth')).toBe(false);
    expect(hasFeature('family', 'net_worth')).toBe(true);
    expect(minimumPlanFor('family')).toBe('plus');
    expect(minimumPlanFor('net_worth')).toBe('family');
  });
  it('objectifs limités en gratuit', () => {
    expect(withinLimit('free', 'goals', 1)).toBe(true);
    expect(withinLimit('free', 'goals', 2)).toBe(false);
    expect(withinLimit('family', 'goals', 10_000)).toBe(true);
  });
});

describe('permissions familiales (miroir des règles Firestore)', () => {
  it('admin et conjoint : accès complet aux données', () => {
    expect(can('admin', 'delete', 'debts')).toBe(true);
    expect(can('partner', 'update', 'goals')).toBe(true);
  });
  it('enfant : lecture limitée, pas de dettes ni patrimoine', () => {
    expect(can('child', 'read', 'transactions')).toBe(true);
    expect(can('child', 'read', 'debts')).toBe(false);
    expect(can('child', 'read', 'assets')).toBe(false);
    expect(can('child', 'create', 'transactions')).toBe(true);
    expect(can('child', 'create', 'envelopes')).toBe(false);
    expect(can('child', 'update', 'goals')).toBe(false);
  });
  it('enfant : ne modifie que ses propres opérations', () => {
    expect(canEditDoc('child', 'transactions', 'kid', 'kid')).toBe(true);
    expect(canEditDoc('child', 'transactions', 'mom', 'kid')).toBe(false);
  });
  it('non-membre : rien', () => {
    expect(can(null, 'read', 'transactions')).toBe(false);
    expect(roleIn({ members: { a: 'admin' } }, 'b')).toBeNull();
  });
  it('un espace garde toujours un administrateur', () => {
    const s = { members: { a: 'admin' as const, b: 'partner' as const } };
    expect(canChangeRole(s, 'a', 'a', 'partner')).toBe(false);
    expect(canChangeRole(s, 'a', 'b', 'admin')).toBe(true);
    expect(canChangeRole(s, 'b', 'a', null)).toBe(false);
  });
});

describe('réserve famille et cérémonies : formules (1.6)', () => {
  it('prix inchangés : 0, 1 500 et 3 000 FCFA', async () => {
    const { PLANS } = await import('../src/core/subscription');
    expect([PLANS.free.priceXof, PLANS.plus.priceXof, PLANS.family.priceXof]).toEqual([0, 1500, 3000]);
  });
  it('droits existants inchangés (non-régression)', async () => {
    const { PLANS } = await import('../src/core/subscription');
    expect(PLANS.free.limits.goals).toBe(2);
    expect(PLANS.plus.limits.goals).toBe(20);
    for (const f of ['export'] as const) expect(hasFeature('free', f)).toBe(true);
    for (const f of ['ai_assistant', 'auto_budget', 'multiple_goals', 'advanced_insights', 'family', 'multiple_accounts', 'voice_premium', 'voice_entry_unlimited'] as const) {
      expect(hasFeature('free', f)).toBe(false);
      expect(hasFeature('plus', f)).toBe(true);
      expect(hasFeature('family', f)).toBe(true);
    }
    for (const f of ['family_advanced', 'net_worth', 'advanced_reports'] as const) expect([hasFeature('plus', f), hasFeature('family', f)]).toEqual([false, true]);
  });
  it('gratuit : 1 réserve, 3 simulations par mois, 1 moment fort', () => {
    expect(withinLimit('free', 'reserves', 0)).toBe(true);
    expect(withinLimit('free', 'reserves', 1)).toBe(false);
    expect(withinLimit('free', 'simulationsPerMonth', 2)).toBe(true);
    expect(withinLimit('free', 'simulationsPerMonth', 3)).toBe(false);
    expect(withinLimit('free', 'seasons', 0)).toBe(true);
    expect(withinLimit('free', 'seasons', 1)).toBe(false);
    for (const f of ['reserve_multiple', 'contribution_simulator', 'seasonal_planning', 'family_reserve'] as const) expect(hasFeature('free', f)).toBe(false);
  });
  it('Plus : réserves multiples, simulateur et moments forts sans limite ; pas de réserve familiale', () => {
    for (const f of ['reserve_multiple', 'contribution_simulator', 'seasonal_planning'] as const) expect(hasFeature('plus', f)).toBe(true);
    expect(hasFeature('plus', 'family_reserve')).toBe(false);
    expect(withinLimit('plus', 'reserves', 50)).toBe(true);
    expect(withinLimit('plus', 'simulationsPerMonth', 500)).toBe(true);
    expect(withinLimit('plus', 'seasons', 50)).toBe(true);
  });
  it('Famille : tout, dont la réserve partagée dans l’espace familial', () => {
    for (const f of ['reserve_multiple', 'contribution_simulator', 'seasonal_planning', 'family_reserve'] as const) expect(hasFeature('family', f)).toBe(true);
    expect(minimumPlanFor('family_reserve')).toBe('family');
    expect(minimumPlanFor('reserve_multiple')).toBe('plus');
  });
  it('utiliser une réserve : admin et conjoint, jamais l’enfant ; l’enfant peut apporter', async () => {
    const { canUseReserve } = await import('../src/core/permissions');
    expect(canUseReserve('admin')).toBe(true);
    expect(canUseReserve('partner')).toBe(true);
    expect(canUseReserve('child')).toBe(false);
    expect(canUseReserve(null)).toBe(false);
    expect(can('child', 'create', 'goalContributions')).toBe(true);
  });
});

describe('tontines : formules (1.7)', () => {
  it('gratuit : une tontine active ; Plus et Famille : illimité ; créer un groupe : Plus et Famille', async () => {
    const { FREE_TONTINES } = await import('../src/core/subscription');
    expect(FREE_TONTINES).toBe(1);
    expect(withinLimit('free', 'tontines', 0)).toBe(true);
    expect(withinLimit('free', 'tontines', 1)).toBe(false);
    expect(withinLimit('plus', 'tontines', 99)).toBe(true);
    expect([hasFeature('free', 'tontine_multiple'), hasFeature('plus', 'tontine_multiple'), hasFeature('family', 'tontine_multiple')]).toEqual([false, true, true]);
    expect([hasFeature('free', 'tontine_group_create'), hasFeature('plus', 'tontine_group_create'), hasFeature('family', 'tontine_group_create')]).toEqual([false, true, true]);
  });
  it('un enfant ne voit pas les tontines de l’espace familial', () => {
    expect(can('child', 'read', 'tontines')).toBe(false);
    expect(can('child', 'create', 'tontineEntries')).toBe(false);
    expect(can('partner', 'create', 'tontines')).toBe(true);
  });
});
