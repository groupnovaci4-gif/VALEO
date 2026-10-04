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
