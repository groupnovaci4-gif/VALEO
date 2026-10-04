import { describe, expect, it } from 'vitest';
import { allocateCapacity, applyGoalChanges, canTransition, computeGoalPlan, monthsToSave, shouldCelebrate } from '../src/core/goals';
import { resolveGoalCategories, suggestGoalCategory } from '../src/core/goalCategories';
import { goal } from './helpers';

const NOW = '2026-10-04';

describe('plan d objectif — exemples de la spécification', () => {
  it('8 M, 1,5 M dispo, déc. 2028 → 26 mois, 250 000/mois', () => {
    const p = computeGoalPlan({ targetAmount: 8_000_000, saved: 1_500_000, targetDate: '2028-12-31' }, NOW);
    expect(p.remaining).toBe(6_500_000);
    expect(p.monthsToTarget).toBe(26);
    expect(p.requiredMonthly).toBe(250_000);
  });
  it('à 200 000/mois → 33 mois, écart 50 000', () => {
    const p = computeGoalPlan({ targetAmount: 8_000_000, saved: 1_500_000, targetDate: '2028-12-31', monthlyContribution: 200_000 }, NOW);
    expect(p.monthsAtPace).toBe(33);
    expect(p.monthlyGap).toBe(50_000);
  });
  it('sans date : 5 M à 100 000/mois → 50 mois', () => {
    const p = computeGoalPlan({ targetAmount: 5_000_000, saved: 0, monthlyContribution: 100_000 }, NOW);
    expect(p.requiredMonthly).toBeNull();
    expect(p.monthsAtPace).toBe(50);
    expect(monthsToSave(5_000_000, 100_000)).toBe(50);
  });
  it('1,2 M, 400 000 épargnés, 8 mois → 100 000/mois', () => {
    const p = computeGoalPlan({ targetAmount: 1_200_000, saved: 400_000, targetDate: '2027-06-04' }, NOW);
    expect(p.monthsToTarget).toBe(8);
    expect(p.requiredMonthly).toBe(100_000);
    expect(p.requiredWeekly).toBe(23_500);
  });
  it('progression 44 %', () => {
    expect(computeGoalPlan({ targetAmount: 8_000_000, saved: 3_500_000 }, NOW).percent).toBe(44);
    expect(computeGoalPlan({ targetAmount: 1000, saved: 999 }, NOW).percent).toBe(99);
  });
});

describe('cas limites', () => {
  it('objectif dépassé : 100 %, reste 0', () => {
    const p = computeGoalPlan({ targetAmount: 100, saved: 150 }, NOW, 1);
    expect(p).toMatchObject({ percent: 100, remaining: 0, reached: true, monthsAtPace: 0 });
  });
  it('date passée → en retard, tout le reste à payer maintenant', () => {
    const p = computeGoalPlan({ targetAmount: 1000, saved: 0, targetDate: '2026-01-01' }, NOW, 1);
    expect(p.overdue).toBe(true);
    expect(p.requiredMonthly).toBe(1000);
  });
  it('cible 0 : pas de division par zéro', () => {
    const p = computeGoalPlan({ targetAmount: 0, saved: 0 }, NOW);
    expect(p.percent).toBe(0);
    expect(p.reached).toBe(false);
  });
  it('contribution 0 → pas de rythme', () => {
    expect(computeGoalPlan({ targetAmount: 1000, saved: 0, monthlyContribution: 0 }, NOW).monthsAtPace).toBeNull();
    expect(monthsToSave(1000, 0)).toBeNull();
  });
  it('objectif partagé : somme des contributions prévues', () => {
    const p = computeGoalPlan({ targetAmount: 25_000_000, saved: 0, planned: [{ label: 'P1', monthly: 150_000 }, { label: 'P2', monthly: 100_000 }] }, NOW);
    expect(p.pace).toBe(250_000);
    expect(p.monthsAtPace).toBe(100);
  });
});

describe('priorités et répartition', () => {
  it('finance d abord l objectif prioritaire', () => {
    const terrain = goal({ id: 'terrain', rank: 1, targetAmount: 5_000_000, targetDate: '2027-10-04' });
    const voiture = goal({ id: 'voiture', rank: 2, targetAmount: 8_000_000, targetDate: '2028-12-31' });
    const lines = allocateCapacity(500_000, [voiture, terrain], [], NOW);
    expect(lines[0].goalId).toBe('terrain');
    expect(lines[0].amount).toBe(417_000);
    expect(lines[1].amount).toBe(83_000);
  });
});

describe('cycle de vie & historique', () => {
  it('trace les changements', () => {
    const g = goal({ targetAmount: 100, priority: 'normal' });
    const next = applyGoalChanges(g, { targetAmount: 200, priority: 'urgent' }, 'u1', 42);
    expect(next.history).toHaveLength(2);
    expect(next.history[0]).toMatchObject({ field: 'targetAmount', from: 100, to: 200, at: 42 });
  });
  it('transitions autorisées', () => {
    expect(canTransition('active', 'paused')).toBe(true);
    expect(canTransition('archived', 'completed')).toBe(false);
    expect(() => applyGoalChanges(goal({ status: 'archived' }), { status: 'completed' }, 'u', 1)).toThrow();
  });
  it('célébration à 100 %', () => {
    const g = goal({ targetAmount: 1000, initialAmount: 1000 });
    expect(shouldCelebrate(g, [])).toBe(true);
    expect(shouldCelebrate({ ...g, status: 'completed' }, [])).toBe(false);
  });
});

describe('catégories d objectifs', () => {
  it('suggère Professionnel pour une machine de transformation de cacao', () => {
    const s = suggestGoalCategory('Acheter une machine de transformation de cacao');
    expect(s?.category.id).toBe('professional');
    expect(s?.template?.id).toBe('buy_machine');
  });
  it('suggère Véhicule pour un taxi, Immobilier pour 2 hectares', () => {
    expect(suggestGoalCategory('Acheter un taxi')?.category.id).toBe('vehicle');
    expect(suggestGoalCategory('Acheter 2 hectares de terrain')?.category.id).toBe('real_estate');
    expect(suggestGoalCategory('Construire la maison de mes parents')?.category.id).toBe('real_estate');
  });
  it('aucune suggestion → objectif personnalisé', () => {
    expect(suggestGoalCategory('zzz')).toBeNull();
  });
  it('registre extensible : ajout, surcharge, désactivation', () => {
    const cats = resolveGoalCategories([
      { id: 'health', label: { fr: 'Santé', en: 'Health' }, icon: '🩺', order: 8 },
      { id: 'vehicle', order: 50 },
      { id: 'family', active: false },
    ]);
    expect(cats.find((c) => c.id === 'health')).toBeTruthy();
    expect(cats.find((c) => c.id === 'family')).toBeUndefined();
    expect(cats[cats.length - 1].id).toBe('vehicle');
  });
});
