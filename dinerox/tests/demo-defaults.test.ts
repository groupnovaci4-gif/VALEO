import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../src/core/demo';
import { buildInitialStructure } from '../src/core/defaults';
import { accountBalances } from '../src/core/balance';
import { envelopeStatuses } from '../src/core/budget';
import { positionOf } from '../src/core/position';
import { withLedgerView } from '../src/core/nature';

describe('données de démonstration', () => {
  const d = buildDemoData({ now: 1, uid: 'u', today: '2026-10-20', label: (k) => k });
  it('identifiants préfixés demo_ (séparés des vraies données)', () => {
    for (const list of Object.values(d)) for (const x of list as { id: string }[]) expect(x.id.startsWith('demo_') || x.id.startsWith('cat_') || x.id.startsWith('sub_') || x.id.startsWith('inc_')).toBe(true);
  });
  it('soldes cohérents et budget réaliste', () => {
    const b = accountBalances(d.accounts, d.transactions);
    expect(b.demo_sav).toBeGreaterThan(300_000);
    const s = envelopeStatuses(d.envelopes, d.transactions, [], '2026-10', 'XOF');
    expect(s.find((x) => x.envelope.id === 'demo_env_home')!.spent).toBe(140_000);
  });
  // Argent disponible v2 (§6.4) : un compte sous zéro s'affiche « à régulariser » ; la démo n'en montre aucun.
  it('aucun compte sous zéro, quel que soit le jour du mois', () => {
    for (const today of ['2026-10-01', '2026-10-11', '2026-10-20', '2026-10-31'] as const) {
      const demo = withLedgerView(buildDemoData({ now: 1, uid: 'u', today, label: (k) => k }));
      expect(positionOf(demo, 'XOF', today).negatives, today).toEqual([]);
    }
  });
});

describe('structure initiale de l onboarding', () => {
  let i = 0;
  const s = buildInitialStructure(
    { firstName: 'Awa', currency: 'XOF', monthlyIncome: 450_000, incomeFrequency: 'monthly', payDay: 25, mainExpenses: [], goals: ['buy_moto', 'emergency_fund'], budgetMethod: 'envelopes', accounts: ['acc.cash', 'acc.wave', 'acc.bank'] },
    { now: 1, uid: 'u', date: '2026-10-04', id: (p) => `${p}${++i}`, label: (k) => k },
  );
  // Argent disponible v2 (E10, D1, D7, §9) : le revenu déclaré n'est jamais de l'argent ;
  // enveloppes à 0, aucune récurrence de salaire à l'inscription.
  it('crée comptes, enveloppes À ZÉRO et objectifs ; aucune récurrence de salaire (E10)', () => {
    expect(s.accounts).toHaveLength(3);
    expect(s.envelopes!.length).toBeGreaterThan(0);
    expect(s.envelopes!.every((e) => e.monthlyBudget === 0)).toBe(true);
    expect(s.recurring).toHaveLength(0);
    expect(s.goals!.map((g) => g.templateId)).toEqual(['buy_moto', 'emergency_fund']);
    expect(s.categories!.length).toBeGreaterThan(14);
  });
  it('sans revenu : enveloppes à zéro, pas de récurrence', () => {
    const z = buildInitialStructure(
      { firstName: '', currency: 'XOF', monthlyIncome: 0, incomeFrequency: 'irregular', mainExpenses: [], goals: [], budgetMethod: 'custom', accounts: [] },
      { now: 1, uid: 'u', id: (p) => `${p}${++i}`, label: (k) => k },
    );
    expect(z.recurring).toHaveLength(0);
    expect(z.accounts).toHaveLength(1);
  });
});

describe('démo : réserve famille, obligations et rentrée (1.6)', () => {
  it('une réserve d’exemple, deux soutiens réguliers et la rentrée scolaire', async () => {
    const { isReserve, isSeason, reserveBalance, reserveUseOf } = await import('../src/core/reserve');
    const { familyObligations } = await import('../src/core/obligations');
    const d = buildDemoData({ now: 1, uid: 'u', today: '2026-10-20', label: (k) => k });
    const reserves = d.goals.filter(isReserve);
    expect(reserves).toHaveLength(1);
    expect(reserveBalance(reserves[0], d.goalContributions)).toBe(80_000);
    expect(reserveUseOf('demo_tx_ceremony', d.goalContributions)?.amount).toBe(-20_000);
    expect(familyObligations(d, 'XOF').map((r) => r.label)).toEqual(['Maman', 'Scolarité neveu']);
    const school = d.goals.filter(isSeason);
    expect(school.map((g) => [g.templateId, g.targetAmount])).toEqual([['school_start', 120_000]]);
  });
});
