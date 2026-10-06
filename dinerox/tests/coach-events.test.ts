/** Phase 2 — moteur d'événements et politique anti-sur-alerte. */
import { describe, expect, it } from 'vitest';
import { SEVERITY_PRIORITY, detectPositiveEvents, fromInsights, fromRecommendations, monthRespected, type CoachEvent, type CoachSeverity } from '../src/core/coach/events';
import { EMPTY_DELIVERY, planDelivery, type DeliveryState } from '../src/core/coach/policy';
import { DEFAULT_COACH_PREFS, coachPrefs } from '../src/core/coach/prefs';
import { emptySpaceData, type CoachPrefs, type NotificationPrefs } from '../src/core/types';
import type { Insight } from '../src/core/insights';
import { account, envelope, goal, tx } from './helpers';

const NOTIF: NotificationPrefs = { budgetAlerts: true, goalProgress: true, incomeReceived: true, unusualSpending: true, savingsReminder: true, debtDue: true, weeklySummary: true, monthlySummary: true };
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 10, 9);
let n = 0;
const e = (severity: CoachSeverity, kind = `k${++n}`, p: Partial<CoachEvent> = {}): CoachEvent => ({ id: `id_${++n}`, kind, severity, priority: SEVERITY_PRIORITY[severity], spaceId: 's', period: '2026-10', textKey: 'x', params: {}, pref: null, createdAt: T0, ...p });
const plan = (events: CoachEvent[], o: { state?: DeliveryState; now?: number; today?: string; trigger?: 'write' | 'open'; prefs?: Partial<CoachPrefs>; notifications?: Partial<NotificationPrefs>; session?: boolean; foreground?: boolean } = {}) =>
  planDelivery({
    events,
    state: o.state ?? EMPTY_DELIVERY,
    now: o.now ?? T0,
    today: o.today ?? '2026-10-10',
    trigger: o.trigger ?? 'open',
    prefs: { ...DEFAULT_COACH_PREFS, ...o.prefs },
    notifications: { ...NOTIF, ...o.notifications },
    sessionVoiceUsed: o.session ?? false,
    foreground: o.foreground ?? true,
  });

describe('politique de diffusion', () => {
  it('priorité : critical > warning > celebration > advice > info', () => {
    const r = plan([e('info'), e('advice'), e('celebration'), e('warning'), e('critical')], { prefs: { frequency: 'active' } });
    expect(r.show.map((x) => x.severity)).toEqual(['critical', 'warning', 'celebration', 'advice', 'info']);
  });
  it('à l’ouverture : regroupement en un seul résumé, limité selon la fréquence', () => {
    const evs = [e('warning'), e('info'), e('advice'), e('celebration'), e('info')];
    expect(plan(evs).show).toHaveLength(3);
    expect(plan(evs).summary).toBe(true);
    expect(plan(evs, { prefs: { frequency: 'discreet' } }).show).toHaveLength(1);
    expect(plan([e('warning')]).summary).toBe(false);
  });
  it('déduplication : un événement déjà diffusé ne revient jamais (état persisté = redémarrage)', () => {
    const x = e('warning');
    const first = plan([x]);
    // Simule un redémarrage : seul l'état sérialisé survit.
    const restored = JSON.parse(JSON.stringify(first.state)) as DeliveryState;
    expect(plan([x], { state: restored, now: T0 + 48 * H, today: '2026-10-12' }).show).toHaveLength(0);
  });
  it('délai par type (12 h en fréquence normale), sauf dépassement et réaction immédiate', () => {
    const s = plan([e('warning', 'goal_near')]).state;
    expect(plan([e('warning', 'goal_near')], { state: s, now: T0 + 2 * H }).show).toHaveLength(0);
    expect(plan([e('warning', 'goal_near')], { state: s, now: T0 + 13 * H }).show).toHaveLength(1);
    expect(plan([e('critical', 'goal_near')], { state: s, now: T0 + 1 * H }).show).toHaveLength(1);
    expect(plan([e('warning', 'goal_near')], { state: s, now: T0 + 1 * H, trigger: 'write' }).show).toHaveLength(1);
  });
  it('voix : par défaut seulement dépassements et félicitations', () => {
    expect(plan([e('warning')]).voice).toBeNull();
    expect(plan([e('critical')]).voice?.severity).toBe('critical');
    expect(plan([e('celebration')]).voice?.severity).toBe('celebration');
    expect(plan([e('warning')], { prefs: { voice: 'all' } }).voice?.severity).toBe('warning');
    expect(plan([e('critical')], { prefs: { voice: 'off' } }).voice).toBeNull();
  });
  it('voix : 1 par ouverture, 3 par jour hors dépassement, 1 félicitation par jour', () => {
    const all = { prefs: { voice: 'all' as const } };
    expect(plan([e('warning')], { ...all, session: true }).voice).toBeNull();
    let state = EMPTY_DELIVERY;
    const spoken: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const r = plan([e('warning')], { ...all, state, now: T0 + i * H });
      spoken.push(!!r.voice);
      state = r.state;
    }
    expect(spoken).toEqual([true, true, true, false, false]);
    // Un dépassement est toujours lu, même plafond atteint.
    expect(plan([e('critical')], { ...all, state, session: true }).voice).not.toBeNull();
    // Lendemain : compteurs remis à zéro.
    expect(plan([e('warning')], { ...all, state, today: '2026-10-11', now: T0 + 30 * H }).voice).not.toBeNull();
    const c1 = plan([e('celebration')]);
    expect(plan([e('celebration')], { state: c1.state, now: T0 + H }).voice).toBeNull();
  });
  it('hors premier plan ou mode silencieux : ni voix ni son', () => {
    expect(plan([e('critical')], { foreground: false })).toMatchObject({ voice: null, sound: null });
    expect(plan([e('critical')], { prefs: { silent: true } })).toMatchObject({ voice: null, sound: null });
    expect(plan([e('critical')]).sound).toBe('alarm');
    expect(plan([e('celebration')]).sound).toBe('success');
    expect(plan([e('critical')], { prefs: { soundVolume: 0 } }).sound).toBeNull();
  });
  it('préférences existantes : budgetAlerts coupé ⇒ aucune alerte de budget', () => {
    expect(plan([e('warning', 'envelope_warning', { pref: 'budgetAlerts' })], { notifications: { budgetAlerts: false } }).show).toHaveLength(0);
  });
  it('« seulement les dépassements » et coach désactivé', () => {
    expect(plan([e('warning'), e('critical')], { prefs: { criticalOnly: true } }).show.map((x) => x.severity)).toEqual(['critical']);
    expect(plan([e('warning', 'goal_near')], { prefs: { enabled: false } }).show).toHaveLength(0);
    expect(plan([e('warning', 'envelope_warning')], { prefs: { enabled: false }, trigger: 'write' })).toMatchObject({ voice: null, sound: null });
  });
  it('préférences : migration douce d’un profil antérieur', () => {
    expect(coachPrefs(undefined)).toEqual(DEFAULT_COACH_PREFS);
    expect(coachPrefs({ coach: { voice: 'off' } as never })).toMatchObject({ voice: 'off', speakAmounts: false, enabled: true });
    expect(coachPrefs({ coach: { soundVolume: 7 } as never }).soundVolume).toBe(1);
  });
});

describe('sources d’événements', () => {
  it('constats → événements (seuils de budget exclus : gérés par les alertes de budget)', () => {
    const ins = (kind: Insight['kind'], id = kind): Insight => ({ id, kind, severity: 'warning', params: {}, weight: 50 });
    const evs = fromInsights([ins('envelope_threshold'), ins('goal_reached'), ins('debt_due'), ins('recurring_payment')], 's', '2026-10', T0);
    expect(evs.map((x) => [x.kind, x.severity, x.pref])).toEqual([
      ['goal_reached', 'celebration', 'goalProgress'],
      ['debt_due', 'warning', 'debtDue'],
    ]);
  });
  it('recommandations → conseils mensuels (identifiant stable dans le mois)', () => {
    const r = fromRecommendations([{ id: 'r', kind: 'capacity_negative', severity: 'danger', params: {}, source: 'user', weight: 90 }, { id: 'n', kind: 'no_data', severity: 'info', params: {}, source: 'user', weight: 1 }], 's', '2026-10', T0);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'rec_capacity_negative_2026-10', severity: 'advice', textKey: 'intel.rec.capacity_negative' });
  });
  it('mois respecté : jamais avec moins de 10 opérations (anti-triche)', () => {
    const food = envelope({ id: 'food', monthlyBudget: 100_000, categoryIds: ['cat_food'] });
    const nine = Array.from({ length: 9 }, (_, i) => tx({ type: 'expense', amount: 1_000, accountId: 'a', categoryId: 'cat_food', date: `2026-09-${String(i + 1).padStart(2, '0')}` }));
    const data = { ...emptySpaceData(), envelopes: [food], transactions: nine };
    expect(monthRespected(data, '2026-09', 'XOF')).toBe(false);
    const ten = { ...data, transactions: [...nine, tx({ type: 'income', amount: 200_000, accountId: 'a', date: '2026-09-28' })] };
    expect(monthRespected(ten, '2026-09', 'XOF')).toBe(true);
    expect(detectPositiveEvents(ten, 'XOF', '2026-10-05', 's', T0).map((x) => x.id)).toContain('pos_month_respected_2026-09');
    const over = { ...ten, transactions: [...ten.transactions, tx({ type: 'expense', amount: 95_000, accountId: 'a', categoryId: 'cat_food', date: '2026-09-29' })] };
    expect(monthRespected(over, '2026-09', 'XOF')).toBe(false);
  });
  it('épargne régulière (3 mois), fonds d’urgence renforcé', () => {
    const sav = account({ id: 'sav', isSavings: true });
    const fund = goal({ id: 'fund', templateId: 'emergency_fund', targetAmount: 500_000 } as never);
    const months = ['2026-07-15', '2026-08-15', '2026-09-15'];
    const data = {
      ...emptySpaceData(),
      accounts: [account({ id: 'a' }), sav],
      goals: [fund],
      transactions: months.map((d) => tx({ type: 'transfer', amount: 20_000, accountId: 'a', toAccountId: 'sav', date: d })),
      goalContributions: [{ id: 'c', goalId: 'fund', amount: 10_000, date: '2026-10-03', createdAt: 1, updatedAt: 1, createdBy: 'u' }],
    };
    const ids = detectPositiveEvents(data as never, 'XOF', '2026-10-05', 's', T0).map((x) => x.kind);
    expect(ids).toEqual(expect.arrayContaining(['savings_regular', 'emergency_fund_up']));
  });
  it('dette soldée ce mois-ci et échéance payée à temps', () => {
    const debt = { id: 'd', direction: 'i_owe', kind: 'personal', counterparty: 'Tonton', principal: 100_000, currency: 'XOF', startDate: '2026-01-01', status: 'active', createdAt: 1, updatedAt: 1, createdBy: 'u' };
    const pay = (amount: number, date: string) => ({ id: `p${date}`, debtId: 'd', amount, date, createdAt: 1, updatedAt: 1, createdBy: 'u' });
    const settled = { ...emptySpaceData(), debts: [debt], debtPayments: [pay(60_000, '2026-09-01'), pay(40_000, '2026-10-02')] };
    expect(detectPositiveEvents(settled as never, 'XOF', '2026-10-05', 's', T0).map((x) => x.kind)).toContain('debt_settled');
    const onTime = { ...emptySpaceData(), debts: [{ ...debt, installment: 20_000, dueDay: 10 }], debtPayments: [pay(20_000, '2026-10-04')] };
    expect(detectPositiveEvents(onTime as never, 'XOF', '2026-10-05', 's', T0).map((x) => x.kind)).toContain('installment_on_time');
  });
});
