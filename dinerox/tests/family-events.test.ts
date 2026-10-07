import { describe, expect, it } from 'vitest';
import { familyEvents } from '../src/core/coach/familyEvents';
import { voiceMessage } from '../src/core/coach/voice';
import { buildFinanceSummary } from '../src/core/ai/summary';
import { fr } from '../src/i18n/fr';
import { emptySpaceData, type GoalContribution, type RecurringRule, type SpaceData } from '../src/core/types';
import { goal } from './helpers';

const contrib = (p: Partial<GoalContribution>): GoalContribution => ({ id: p.id ?? `gc${Math.random()}`, createdAt: 1, updatedAt: 1, createdBy: 'u1', goalId: 'res', amount: 0, date: '2026-09-02', ...p });
const reserve = goal({ id: 'res', kind: 'reserve', name: 'Réserve famille', categoryId: 'family', targetAmount: 200_000, monthlyContribution: 20_000, targetDate: null });
const mum: RecurringRule = { id: 'mum', createdAt: 1, updatedAt: 1, createdBy: 'u1', type: 'expense', label: 'Maman Akissi', amount: 20_000, currency: 'XOF', accountId: 'a', categoryId: 'cat_family', frequency: 'monthly', startDate: '2026-01-16', active: true };
// Moment fort personnel au nom sensible : ne doit jamais être lu ni affiché par le coach.
const funeral = goal({ id: 'fun', categoryId: 'seasons', templateId: 'personal', name: 'Funérailles de Papa Kouadio', targetAmount: 300_000, targetDate: '2026-11-10', createdAt: new Date('2026-09-10T12:00:00').getTime() });
const data = (over: Partial<SpaceData>): SpaceData => ({ ...emptySpaceData(), ...over });
const label = (id: string | null | undefined) => (id === 'tabaski' ? 'Tabaski' : 'votre moment fort');
const run = (d: SpaceData, today = '2026-10-15') => familyEvents(d, 'XOF', today, 'u1', 0, { firstName: 'Awa', seasonLabel: label });
const render = (key: string, params: Record<string, string | number>) => ((fr as Record<string, string>)[key] ?? '').replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));

describe('coach : réserve famille, moments forts, obligations', () => {
  it('reserve_low : solde sous 25 % du plafond (une fois par mois)', () => {
    const e = run(data({ goals: [reserve], goalContributions: [contrib({ amount: 40_000 })] }));
    expect(e.map((x) => [x.kind, x.id])).toEqual([['reserve_low', 'reserve_low_res_2026-10']]);
    expect(run(data({ goals: [reserve], goalContributions: [contrib({ amount: 60_000 })] }))).toEqual([]);
  });

  it('reserve_refilled : plafond atteint ce mois-ci → célébration, une par remplissage', () => {
    const e = run(data({ goals: [reserve], goalContributions: [contrib({ amount: 180_000 }), contrib({ id: 'last', amount: 20_000, date: '2026-10-03' })] }));
    expect(e.map((x) => [x.kind, x.severity, x.id])).toEqual([['reserve_refilled', 'celebration', 'reserve_full_res_last']]);
    expect(render(e[0].textKey, e[0].params)).toBe('Bravo Awa, votre réserve famille est complète. Vous êtes prêt pour les imprévus.');
    // Complète depuis un mois précédent : pas de nouvelle célébration.
    expect(run(data({ goals: [reserve], goalContributions: [contrib({ amount: 200_000 })] }))).toEqual([]);
  });

  it('season_upcoming : à J-30 avec épargne en retard', () => {
    const e = run(data({ goals: [funeral] }), '2026-10-15');
    expect(e.map((x) => x.kind)).toEqual(['season_upcoming']);
    expect(e[0].params).toMatchObject({ event: 'votre moment fort', days: 26, remaining: 300_000 });
    // À jour de son épargne : rien.
    expect(run(data({ goals: [funeral], goalContributions: [contrib({ goalId: 'fun', amount: 250_000 })] }), '2026-10-15')).toEqual([]);
  });

  it('obligation_due : soutien régulier à verser demain', () => {
    const e = run(data({ recurring: [mum] }), '2026-10-15');
    expect(e.map((x) => [x.kind, x.id])).toEqual([['obligation_due', 'obligation_due_mum_2026-10-16']]);
  });

  it('confidentialité : aucun message (affiché ou vocal) ne cite un bénéficiaire ni un défunt', () => {
    const all = run(data({ goals: [reserve, funeral], recurring: [mum], goalContributions: [contrib({ amount: 10_000 })] }), '2026-10-15');
    expect(all.length).toBe(3);
    for (const e of all) {
      expect(JSON.stringify(e.params)).not.toMatch(/Maman|Akissi|Papa|Kouadio|Funérailles/);
      for (const speakAmounts of [false, true]) {
        const v = voiceMessage(e, speakAmounts, (k) => k in fr);
        const spoken = render(v.key, v.params);
        expect(spoken).not.toMatch(/Maman|Akissi|Papa|Kouadio|Funérailles|décès|défunt/i);
        expect(spoken.length).toBeGreaterThan(10);
      }
      // Sans accord, aucun montant n'est prononcé.
      expect(render(voiceMessage(e, false, (k) => k in fr).key, e.params)).not.toMatch(/\d/);
    }
  });

  it('résumé envoyé à l’IA : aucun bénéficiaire, aucun nom de réserve ou de moment fort saisi', () => {
    const d = data({ goals: [reserve, funeral], recurring: [mum], transactions: [{ id: 't', createdAt: 1, updatedAt: 1, createdBy: 'u1', type: 'expense', amount: 20_000, currency: 'XOF', date: '2026-10-05', accountId: 'a', categoryId: 'cat_family', payee: 'Maman Akissi', note: 'pour Papa Kouadio' }] });
    const s = JSON.stringify(buildFinanceSummary(d, 'XOF', '2026-10-15', (id) => id));
    expect(s).not.toMatch(/Maman|Akissi|Papa|Kouadio|Funérailles/);
  });
});
