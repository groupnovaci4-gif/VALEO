import { describe, expect, it } from 'vitest';
import { allOnTime, buildSchedule, collectorTotals, netPosition, potOf, scheduleState, tontineDueThisMonth, tontinePositions, tontineReminders, turnShares, upcomingDue } from '../src/core/tontine';
import type { Tontine, TontineEntry } from '../src/core/types';

const tontine = (p: Partial<Tontine>): Tontine => ({
  id: p.id ?? 't1',
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'u',
  type: 'rotating',
  name: 'Tontine du bureau',
  currency: 'XOF',
  amountPerShare: 10_000,
  sharesHeld: 1,
  frequency: 'monthly',
  startDate: '2026-01-05',
  membersCount: 10,
  myTurns: [6],
  status: 'active',
  ...p,
});
let n = 0;
const entry = (p: Partial<TontineEntry>): TontineEntry => ({ id: `e${++n}`, createdAt: 1, updatedAt: 1, createdBy: 'u', tontineId: 't1', kind: 'contribution', period: 1, amount: 10_000, date: '2026-01-05', status: 'done', ...p });
const paidUpTo = (t: Tontine, last: number) => buildSchedule(t).filter((s) => s.period <= last).map((s) => entry({ tontineId: t.id, period: s.period, amount: s.contribution, date: s.date }));

describe('buildSchedule', () => {
  it('tournante 10 membres × 10 000 mensuel : 10 tours, cagnotte 100 000, « Vous » au tour 6', () => {
    const s = buildSchedule(tontine({}));
    expect(s).toHaveLength(10);
    expect(s.map((x) => x.date).slice(0, 3)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    expect(s.every((x) => x.contribution === 10_000 && x.pot === 100_000)).toBe(true);
    expect(s.filter((x) => x.mine).map((x) => [x.turn, x.payout])).toEqual([[6, 100_000]]);
  });

  it('2 mains : cotisation double, deux tours entiers', () => {
    const s = buildSchedule(tontine({ sharesHeld: 2, myTurns: [3, 9] }));
    expect(s[0].contribution).toBe(20_000);
    expect(s.filter((x) => x.mine).map((x) => [x.turn, x.payout])).toEqual([[3, 100_000], [9, 100_000]]);
  });

  it('demi-main : demi-cotisation, moitié de la cagnotte du tour partagé', () => {
    const s = buildSchedule(tontine({ sharesHeld: 0.5, myTurns: [4] }));
    expect(s[0].contribution).toBe(5_000);
    expect(s.filter((x) => x.mine).map((x) => [x.turn, x.payout])).toEqual([[4, 50_000]]);
    expect(Object.fromEntries(turnShares({ myTurns: [2, 7], sharesHeld: 1.5 }))).toEqual({ 2: 1, 7: 0.5 });
  });

  it('hebdomadaire et journalière', () => {
    expect(buildSchedule(tontine({ frequency: 'weekly', membersCount: 3 })).map((x) => x.date)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
    expect(buildSchedule(tontine({ frequency: 'daily', membersCount: 3 })).map((x) => x.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(buildSchedule(tontine({ frequency: 'biweekly', membersCount: 2 })).map((x) => x.date)).toEqual(['2026-01-05', '2026-01-19']);
    expect(buildSchedule(tontine({ frequency: 'custom', customDays: 10, membersCount: 2 })).map((x) => x.date)).toEqual(['2026-01-05', '2026-01-15']);
  });

  it('fin de mois courte : départ le 31 janvier → 28 février, puis 31 mars', () => {
    expect(buildSchedule(tontine({ startDate: '2026-01-31', membersCount: 3 })).map((x) => x.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('cagnotte avec frais d’organisateur : montant saisi', () => {
    const t = tontine({ potAmount: 95_000, organizerFee: 5_000 });
    expect(potOf(t)).toBe(95_000);
    expect(buildSchedule(t).find((x) => x.mine)?.payout).toBe(95_000);
  });

  it('collecteur : 1 000 par jour sur 31 jours, commission saisie 1 000 → 30 000 rendus (3,2 %)', () => {
    const t = tontine({ type: 'collector', amountPerShare: 1_000, frequency: 'daily', startDate: '2026-03-01', cycleDays: 31, collectorCommission: 1_000, membersCount: null, myTurns: [] });
    const s = buildSchedule(t);
    expect(s).toHaveLength(31);
    expect(s[30]).toMatchObject({ date: '2026-03-31', mine: true, payout: 30_000 });
    expect(collectorTotals(t)).toEqual({ total: 31_000, commission: 1_000, returned: 30_000, count: 31, percent: 3.2 });
  });

  it('cotisation fixe sans tour : aucune cagnotte, échéances jusqu’à l’horizon', () => {
    const t = tontine({ type: 'fixed_contribution', amountPerShare: 5_000, membersCount: null, myTurns: [] });
    const s = buildSchedule(t, { until: '2026-04-30' });
    expect(s.map((x) => x.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05']);
    expect(s.every((x) => !x.mine && x.payout === 0 && x.pot === null)).toBe(true);
  });
});

describe('position nette', () => {
  const t = tontine({});
  it('avant mon tour : épargne (versé, recevra la cagnotte au tour 6)', () => {
    const p = netPosition(t, paidUpTo(t, 3), '2026-03-20');
    expect(p).toMatchObject({ type: 'rotating', phase: 'before', paid: 30_000, received: 0, net: 30_000, next: { turn: 6, date: '2026-06-05', amount: 100_000 } });
  });

  it('le jour de mon tour, cagnotte pas encore reçue : toujours « avant »', () => {
    const p = netPosition(t, paidUpTo(t, 6), '2026-06-05');
    expect(p).toMatchObject({ phase: 'before', paid: 60_000, net: 60_000 });
  });

  it('après mon tour : crédit sans intérêt (reste à verser)', () => {
    const entries = [...paidUpTo(t, 6), entry({ kind: 'payout', period: 6, amount: 100_000, date: '2026-06-05' })];
    const p = netPosition(t, entries, '2026-06-06');
    expect(p).toMatchObject({ phase: 'after', received: 100_000, net: -40_000, remainingToPay: 40_000, remainingCount: 4, next: null });
  });

  it('fin de cycle : position nette = 0 (hors frais)', () => {
    const all = [...paidUpTo(t, 10), entry({ kind: 'payout', period: 6, amount: 100_000 })];
    expect(netPosition(t, all, '2026-11-01')).toMatchObject({ phase: 'finished', net: 0, remainingCount: 0 });
    const withFee = tontine({ potAmount: 95_000 });
    const all2 = [...paidUpTo(withFee, 10), entry({ kind: 'payout', period: 6, amount: 95_000 })];
    expect(netPosition(withFee, all2, '2026-11-01')).toMatchObject({ phase: 'finished', net: 5_000 });
  });

  it('collecteur : versé, commission, attendu en fin de cycle', () => {
    const c = tontine({ type: 'collector', amountPerShare: 1_000, frequency: 'daily', startDate: '2026-03-01', cycleDays: 31, collectorCommission: 1_000, membersCount: null, myTurns: [] });
    expect(netPosition(c, [entry({ amount: 1_000 }), entry({ period: 2, amount: 1_000 })], '2026-03-03')).toEqual({ type: 'collector', paid: 2_000, commission: 1_000, expected: 30_000, date: '2026-03-31', received: false, percent: 3.2 });
  });
});

describe('retards, reste par jour, rappels, patrimoine', () => {
  const t = tontine({});
  it('échéance passée sans cotisation → late ; reportée → postponed puis late', () => {
    const s = scheduleState(t, paidUpTo(t, 1), '2026-02-10');
    expect([s[0].status, s[1].status, s[2].status]).toEqual(['done', 'late', 'due']);
    const postponed = scheduleState(t, [...paidUpTo(t, 1), entry({ period: 2, status: 'planned', date: '2026-02-15' })], '2026-02-10');
    expect([postponed[1].status, postponed[1].dueDate]).toEqual(['postponed', '2026-02-15']);
    expect(scheduleState(t, [...paidUpTo(t, 1), entry({ period: 2, status: 'planned', date: '2026-02-15' })], '2026-02-16')[1].status).toBe('late');
  });

  it('reste par jour : cotisations du mois non versées déduites, cagnotte attendue jamais comptée', () => {
    const base = { tontines: [t], tontineEntries: [] as TontineEntry[], recurring: [] };
    expect(tontineDueThisMonth(base, 'XOF', '2026-06-01')).toBe(10_000);
    expect(tontineDueThisMonth({ ...base, tontineEntries: paidUpTo(t, 6) }, 'XOF', '2026-06-01')).toBe(0);
    // Récurrence d'origine encore active : elle compte déjà la cotisation (pas de double comptage).
    const converted = tontine({ linkedRecurringId: 'rec' });
    expect(tontineDueThisMonth({ tontines: [converted], tontineEntries: [], recurring: [{ id: 'rec', active: true }] as never }, 'XOF', '2026-06-01')).toBe(0);
    expect(tontineDueThisMonth({ tontines: [converted], tontineEntries: [], recurring: [{ id: 'rec', active: false }] as never }, 'XOF', '2026-06-01')).toBe(10_000);
  });

  it('rappels la veille et le jour même ; accueil : échéance dans 3 jours', () => {
    expect(tontineReminders({ tontines: [t], tontineEntries: [] }, '2026-06-01', { days: 10 })).toEqual([
      { tontineId: 't1', period: 6, date: '2026-06-04', when: 'eve' },
      { tontineId: 't1', period: 6, date: '2026-06-05', when: 'day' },
    ]);
    expect(upcomingDue({ tontines: [t], tontineEntries: paidUpTo(t, 5) }, '2026-06-02', 3).map((x) => x.item.period)).toEqual([6]);
    expect(upcomingDue({ tontines: [t], tontineEntries: paidUpTo(t, 5) }, '2026-06-01', 3)).toEqual([]);
  });

  it('patrimoine : créance avant mon tour, dette après', () => {
    expect(tontinePositions({ tontines: [t], tontineEntries: paidUpTo(t, 3) }, 'XOF', '2026-03-20')).toEqual({ receivable: 30_000, liability: 0 });
    const after = [...paidUpTo(t, 6), entry({ kind: 'payout', period: 6, amount: 100_000 })];
    expect(tontinePositions({ tontines: [t], tontineEntries: after }, 'XOF', '2026-06-06')).toEqual({ receivable: 0, liability: 40_000 });
  });

  it('toutes les cotisations du mois à l’heure (≥ 1), une en retard → non', () => {
    expect(allOnTime({ tontines: [t], tontineEntries: paidUpTo(t, 3) }, '2026-03', 'XOF')).toBe(true);
    expect(allOnTime({ tontines: [t], tontineEntries: [entry({ period: 3, date: '2026-03-08' })] }, '2026-03', 'XOF')).toBe(false);
    expect(allOnTime({ tontines: [], tontineEntries: [] }, '2026-03', 'XOF')).toBe(false);
  });
});

describe('saisie et conversion', () => {
  it('validation : cohérence seulement (mains, tours, cycle), aucune valeur imposée', async () => {
    const { validateTontine } = await import('../src/core/tontine');
    expect(validateTontine(tontine({}))).toEqual([]);
    expect(validateTontine(tontine({ name: ' ', amountPerShare: 0 }))).toEqual(['name', 'amount']);
    expect(validateTontine(tontine({ sharesHeld: 2, myTurns: [6] }))).toEqual(['turns']);
    expect(validateTontine(tontine({ sharesHeld: 0.5, myTurns: [4] }))).toEqual([]);
    expect(validateTontine(tontine({ sharesHeld: 0.3 }))).toContain('shares');
    expect(validateTontine(tontine({ membersCount: 1, myTurns: [1] }))).toContain('members');
    expect(validateTontine(tontine({ myTurns: [11] }))).toEqual(['turns']);
    expect(validateTontine(tontine({ type: 'collector', cycleDays: null, myTurns: [] }))).toEqual(['cycle']);
    expect(validateTontine(tontine({ type: 'fixed_contribution', membersCount: null, myTurns: [] }))).toEqual([]);
    expect(validateTontine(tontine({ frequency: 'custom', customDays: null }))).toEqual(['customDays']);
  });

  it('conversion d’une récurrence de tontine : brouillon prérempli, récurrence intacte, proposée une seule fois', async () => {
    const { convertibleRecurring, tontineFromRecurring } = await import('../src/core/tontine');
    const rule = { id: 'rec', createdAt: 1, updatedAt: 1, createdBy: 'u', type: 'expense' as const, label: 'Tontine', amount: 10_000, currency: 'XOF' as const, accountId: 'cash', categoryId: 'cat_informal', frequency: 'weekly' as const, startDate: '2026-10-07', active: true };
    const frozen = JSON.stringify(rule);
    const d = tontineFromRecurring(rule);
    expect(d).toMatchObject({ name: 'Tontine', amountPerShare: 10_000, frequency: 'weekly', startDate: '2026-10-07', accountId: 'cash', linkedRecurringId: 'rec', status: 'active' });
    expect(JSON.stringify(rule)).toBe(frozen);
    expect(convertibleRecurring({ recurring: [rule, { ...rule, id: 'rent', categoryId: 'cat_housing' }], tontines: [] }).map((r) => r.id)).toEqual(['rec']);
    expect(convertibleRecurring({ recurring: [rule], tontines: [tontine({ linkedRecurringId: 'rec' })] })).toEqual([]);
  });

  it('démo : tontine du bureau, cotisations liées à des opérations réelles, récurrence convertible conservée', async () => {
    const { buildDemoData } = await import('../src/core/demo');
    const { convertibleRecurring } = await import('../src/core/tontine');
    const d = buildDemoData({ now: 1, uid: 'u', today: '2026-10-20', label: (k) => k });
    expect(d.tontines.map((x) => [x.name, x.membersCount, x.myTurns])).toEqual([['Tontine du bureau', 10, [6]]]);
    expect(d.tontineEntries.length).toBe(3);
    for (const e of d.tontineEntries) expect(d.transactions.find((x) => x.id === e.transactionId)?.amount).toBe(10_000);
    expect(convertibleRecurring(d).map((r) => r.id)).toEqual(['demo_rec_tontine']);
  });
});

describe('intégrations : reste par jour, calendrier, patrimoine', () => {
  const t = tontine({ startDate: '2026-10-20', membersCount: 3, myTurns: [3] });
  it('reste par jour : cotisation du mois déduite, cagnotte attendue non comptée', async () => {
    const { dailyAllowance } = await import('../src/core/dailyAllowance');
    const income = { id: 'i', createdAt: 1, updatedAt: 1, createdBy: 'u', type: 'income' as const, amount: 170_000, currency: 'XOF' as const, date: '2026-10-01', accountId: 'a' };
    const base = { transactions: [income], recurring: [], goals: [], goalContributions: [] };
    const without = dailyAllowance({ data: base, currency: 'XOF', today: '2026-10-15' });
    const withT = dailyAllowance({ data: { ...base, tontines: [t], tontineEntries: [] }, currency: 'XOF', today: '2026-10-15' });
    expect(withT.status === 'ok' && [withT.upcomingTontines, withT.available]).toEqual([10_000, 160_000]);
    expect(without.status === 'ok' && without.available).toBe(170_000);
    // Le tour où je reçois tombe dans le mois : la cagnotte n'est pas comptée tant qu'elle n'est pas reçue.
    const mine = tontine({ startDate: '2026-10-20', membersCount: 2, myTurns: [1] });
    const r = dailyAllowance({ data: { ...base, tontines: [mine], tontineEntries: [] }, currency: 'XOF', today: '2026-10-15' });
    expect(r.status === 'ok' && r.available).toBe(160_000);
  });
  it('calendrier : cotisations « Tontine » et cagnotte « Cagnotte de tontine », sans doublon avec la récurrence d’origine', async () => {
    const { financialCalendar } = await import('../src/core/calendar');
    const ev = financialCalendar({ recurring: [], debts: [], debtPayments: [], goals: [], goalContributions: [], tontines: [t], tontineEntries: [] }, '2026-10-15', 90);
    expect(ev.map((e) => [e.kind, e.date, e.amount])).toEqual([['tontine', '2026-10-20', 10_000], ['tontine', '2026-11-20', 10_000], ['tontine', '2026-12-20', 10_000], ['tontine_payout', '2026-12-20', 30_000]]);
    const linked = { ...t, linkedRecurringId: 'rec' };
    expect(financialCalendar({ recurring: [{ id: 'rec', createdAt: 1, updatedAt: 1, createdBy: 'u', type: 'expense', label: 'Tontine', amount: 10_000, currency: 'XOF', accountId: 'a', categoryId: 'cat_informal', frequency: 'monthly', startDate: '2026-10-20', active: true }], debts: [], debtPayments: [], goals: [], goalContributions: [], tontines: [linked], tontineEntries: [] }, '2026-10-15', 90).filter((e) => e.id.startsWith('ton'))).toEqual([]);
  });
  it('patrimoine : la position nette s’ajoute aux créances ou aux dettes', async () => {
    const { netWorth } = await import('../src/core/networth');
    expect(netWorth([], [], [], [], [], 'XOF', { receivable: 30_000, liability: 0 })).toMatchObject({ receivables: 30_000, net: 30_000 });
    expect(netWorth([], [], [], [], [], 'XOF', { receivable: 0, liability: 40_000 })).toMatchObject({ liabilities: 40_000, net: -40_000 });
    expect(netWorth([], [], [], [], [], 'XOF')).toMatchObject({ net: 0 });
  });
});
