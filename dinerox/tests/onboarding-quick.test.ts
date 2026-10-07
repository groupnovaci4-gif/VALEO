/** Lot A, phase 1 — démarrage rapide : charges en récurrences, aperçu du reste par jour. */
import { describe, expect, it } from 'vitest';
import { firstDueDate, quickChargeRules, quickPreview } from '../src/core/onboardingQuick';

const meta = { accountId: 'acc1', currency: 'XOF' as const, today: '2026-10-10', now: 5, uid: 'u1', label: (s: string) => `L:${s}`, id: (i: number) => `rec_q${i}` };

describe('démarrage rapide', () => {
  it('échéance : ce mois-ci si le jour n’est pas passé, sinon le mois suivant ; jamais rétroactive', () => {
    expect(firstDueDate(25, '2026-10-10')).toBe('2026-10-25');
    expect(firstDueDate(5, '2026-10-10')).toBe('2026-11-05');
    expect(firstDueDate(10, '2026-10-10')).toBe('2026-10-10');
    expect(firstDueDate(31, '2026-10-10')).toBe('2026-10-28'); // borné au 28 (tous les mois)
    expect(firstDueDate(null, '2026-10-10')).toBe('2026-11-01');
  });

  it('au plus trois charges, montants renseignés uniquement, catégorie = parent de la sous-catégorie', () => {
    const rules = quickChargeRules(
      [
        { subcategoryId: 'sub_housing_rent', amount: 100_000, day: 25 },
        { subcategoryId: 'sub_housing_electricity', amount: null, day: 5 },
        { subcategoryId: 'sub_informal_tontine', amount: 10_000, day: 15 },
        { subcategoryId: 'sub_comm_airtime', amount: 5_000, day: 1 },
        { subcategoryId: 'sub_food_market', amount: 30_000, day: 1 },
      ],
      meta,
    );
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => [r.categoryId, r.amount, r.startDate, r.type, r.frequency])).toEqual([
      ['cat_housing', 100_000, '2026-10-25', 'expense', 'monthly'],
      ['cat_informal', 10_000, '2026-10-15', 'expense', 'monthly'],
      ['cat_communication', 5_000, '2026-11-01', 'expense', 'monthly'],
    ]);
    expect(rules[0]).toMatchObject({ id: 'rec_q0', accountId: 'acc1', label: 'L:sub_housing_rent', active: true, lastGenerated: null, createdBy: 'u1' });
  });

  it('aperçu : revenu déclaré − charges à venir ce mois-ci, par jour restant', () => {
    const r = quickPreview({ monthlyIncome: 250_000, charges: [{ subcategoryId: 'sub_housing_rent', amount: 100_000, day: 25 }, { subcategoryId: 'sub_comm_airtime', amount: 5_000, day: 1 }], currency: 'XOF', today: '2026-10-10' });
    // Loyer du 25 à venir ; crédit du 1er : échéance au mois prochain.
    expect(r.status === 'ok' && r.available).toBe(150_000);
    expect(r.status === 'ok' && r.perDay).toBe(Math.floor(150_000 / 22));
  });

  it('aperçu sans revenu : invitation, aucun chiffre', () => {
    expect(quickPreview({ monthlyIncome: null, charges: [], currency: 'XOF', today: '2026-10-10' }).status).toBe('needs_income');
  });
});
