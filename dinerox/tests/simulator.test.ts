import { describe, expect, it } from 'vitest';
import { compareAmounts, simulateContribution } from '../src/core/simulator';
import { emptySpaceData, type GoalContribution, type SpaceData } from '../src/core/types';
import { envelope, goal, tx } from './helpers';

const contrib = (p: Partial<GoalContribution>): GoalContribution => ({ id: p.id ?? `gc${Math.random()}`, createdAt: 1, updatedAt: 1, createdBy: 'u1', goalId: 'res', amount: 0, date: '2026-09-02', ...p });
const reserve = goal({ id: 'res', kind: 'reserve', name: 'Réserve famille', categoryId: 'family', targetAmount: 200_000, monthlyContribution: null, targetDate: null });
const income = tx({ id: 'inc', type: 'income', amount: 300_000, accountId: 'a', date: '2026-10-01', categoryId: 'inc_salary' });
const base = (over: Partial<SpaceData> = {}): SpaceData => ({ ...emptySpaceData(), transactions: [income], ...over });
// 15 octobre → 17 jours jusqu'au 31.
const today = '2026-10-15';

describe('simulateur « Puis-je contribuer ? »', () => {
  it('trois montants, sans réserve : reste par jour calculé par le code, rien n’est enregistré', () => {
    const data = base();
    const rows = compareAmounts({ data, currency: 'XOF', today, reserveId: null }, [30_000, 20_000, 10_000]);
    expect(rows.map((r) => (r.after.status === 'ok' ? r.after.perDay : -1))).toEqual([Math.floor(270_000 / 17), Math.floor(280_000 / 17), Math.floor(290_000 / 17)]);
    expect(data.transactions).toHaveLength(1);
  });

  it('réserve suffisante : solde après contribution, reste par jour inchangé', () => {
    const data = base({ goals: [reserve], goalContributions: [contrib({ amount: 50_000 })] });
    const s = simulateContribution({ data, currency: 'XOF', today, amount: 30_000 });
    expect(s.reserve).toMatchObject({ before: 50_000, after: 20_000, fromReserve: 30_000, complement: 0 });
    expect(s.after.status === 'ok' && s.before.status === 'ok' && s.after.perDay).toBe(s.before.status === 'ok' ? s.before.perDay : -1);
    expect(s.shortfall).toBeNull();
  });

  it('réserve insuffisante : complément sur le budget du mois, enveloppe touchée signalée', () => {
    const fam = envelope({ id: 'fam', name: 'Famille', monthlyBudget: 20_000, categoryIds: ['cat_social'] });
    const data = base({ goals: [reserve], goalContributions: [contrib({ amount: 10_000 })], envelopes: [fam] });
    const s = simulateContribution({ data, currency: 'XOF', today, amount: 30_000 });
    expect(s.reserve).toMatchObject({ before: 10_000, after: 0, fromReserve: 10_000, complement: 20_000 });
    expect(s.after.status === 'ok' && s.after.available).toBe(280_000);
    // Seul le complément (20 000) pèse sur l'enveloppe : 100 % → « entièrement utilisée ».
    expect(s.envelopes).toEqual([{ envelopeId: 'fam', name: 'Famille', before: 'ok', after: 'reached', remainingAfter: 0 }]);
  });

  it('sans réserve choisie (null) : tout passe sur le budget du mois', () => {
    const data = base({ goals: [reserve], goalContributions: [contrib({ amount: 50_000 })] });
    const s = simulateContribution({ data, currency: 'XOF', today, amount: 34_000, reserveId: null });
    expect(s.reserve).toBeNull();
    expect(s.before.status === 'ok' && s.after.status === 'ok' && s.before.perDay - s.after.perDay).toBe(2_000);
  });

  it('fin de mois : dernier jour, tout le disponible sur un seul jour', () => {
    const s = simulateContribution({ data: base(), currency: 'XOF', today: '2026-10-31', amount: 100_000, reserveId: null });
    expect(s.after.status === 'ok' && [s.after.daysLeft, s.after.perDay]).toEqual([1, 200_000]);
  });

  it('disponible négatif : ce qui manquerait et les mises de côté prévues non couvertes, sans « par jour »', () => {
    const moto = goal({ id: 'moto', targetAmount: 1_000_000, monthlyContribution: 50_000 });
    const s = simulateContribution({ data: base({ goals: [moto] }), currency: 'XOF', today, amount: 280_000, reserveId: null });
    expect(s.after.status).toBe('deficit');
    expect(s.shortfall).toEqual({ amount: 30_000, plannedSetAside: 50_000 });
  });
});

describe('voix et phrase : « Si je donne… » ouvre le simulateur', () => {
  it('question hypothétique reconnue, avec ou sans point d’interrogation (transcription vocale)', async () => {
    const { parseIntent } = await import('../src/core/ai/parser');
    const { parseEntryText } = await import('../src/core/entry/parse');
    for (const s of ['Si je donne 30 000 pour les funérailles, il me reste combien ?', 'si je donne 30000 pour les funérailles il me reste combien']) {
      const i = parseIntent(s, '2026-10-15');
      expect(i.kind === 'question' && [i.topic, i.amount]).toEqual(['contribution_sim', 30_000]);
      const e = parseEntryText(s, { today: '2026-10-15', currency: 'XOF', accounts: [], categories: [], defaultAccountId: null });
      expect(e.kind).toBe('question');
    }
    // Une dépense ordinaire reste une opération à confirmer.
    expect(parseEntryText('Funérailles 30 000', { today: '2026-10-15', currency: 'XOF', accounts: [], categories: [], defaultAccountId: null }).kind).toBe('entries');
  });
});
