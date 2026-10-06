/**
 * Coach financier : orchestrateur de diffusion.
 *
 *   données → moteur financier (core) → événements (core/coach/events)
 *          → politique (core/coach/policy) → ICI : présentation
 *
 * Deux déclencheurs :
 *  - `write` : une opération vient d'être enregistrée (signal de useActions) →
 *    réaction immédiate (alerte de budget à l'écran) ;
 *  - `open`  : ouverture ou retour au premier plan → les événements en
 *    attente sont regroupés en UN résumé (carte d'accueil).
 * Ce composant ne calcule aucun montant : il présente ce que le code a décidé.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp, useSpaceReady } from '@/store/app';
import { useCategoryLabels, useCurrency } from '@/hooks/useFinance';
import { useToast } from '@/components/ui';
import { hasKey, useI18n } from '@/i18n';
import { useFormatParams } from '@/hooks/useInsightText';
import { monthKey, today } from '@/core/dates';
import { envelopeStatuses } from '@/core/budget';
import { computeInsights } from '@/core/insights';
import { financialSnapshot, recommendations } from '@/core/intelligence';
import { moneyPosition } from '@/core/balance';
import { alertsAfterWrite, evaluateEnvelopeAlerts } from '@/core/coach/envelopeAlerts';
import { detectPositiveEvents, fromEnvelopeAlert, fromInsights, fromRecommendations, type CoachEvent } from '@/core/coach/events';
import { planDelivery, type CoachTrigger } from '@/core/coach/policy';
import { coachPrefs } from '@/core/coach/prefs';
import { addNotified, deliveryState, envelopeMemory, mergeDelivered, saveDeliveryState, saveEnvelopeMemory } from '@/services/coachMemory';
import { fetchDeliveredIds, recordCoachEvents } from '@/services/coachHistory';
import { presentCoachPlan, setCoachWriteHandler, type CoachWriteSignal } from './bus';
import { VoiceHost } from './VoiceHost';
import { RewardCelebration } from './RewardCelebration';
import { evaluateRewards, monthToEvaluate, rewardKey, REWARDS } from '@/core/coach/rewards';
import { loadRewards, saveRewards, type StoredReward } from '@/services/rewards';

interface CoachValue {
  /** Résumé en attente (ouverture) : affiché sur l'accueil jusqu'à « J'ai compris ». */
  summary: CoachEvent[];
  dismiss: () => void;
  /** Texte d'un événement (clé i18n + montants formatés). */
  text: (e: CoachEvent) => string;
  /** Récompenses obtenues (personnelles). */
  rewards: StoredReward[];
  /** Réévalue les récompenses maintenant (ex. objectif atteint) ; `overlay` : célébration animée. */
  checkRewards: (opts?: { overlay?: boolean }) => Promise<void>;
}

const CoachContext = createContext<CoachValue>({ summary: [], dismiss: () => undefined, text: () => '', rewards: [], checkRewards: async () => undefined });

export function useCoach(): CoachValue {
  return useContext(CoachContext);
}


export function CoachProvider({ children }: { children: React.ReactNode }) {
  const { engine, user, profile, mode, activeSpace } = useApp();
  const ready = useSpaceReady();
  const currency = useCurrency();
  const labels = useCategoryLabels();
  const toast = useToast();
  const { t } = useI18n();
  const fmt = useFormatParams();
  const [summary, setSummary] = useState<CoachEvent[]>([]);
  const [rewards, setRewards] = useState<StoredReward[]>([]);
  const [celebration, setCelebration] = useState<{ rewardId: string; message: string } | null>(null);
  const sessionVoiceUsed = useRef(false);
  const remoteMergedFor = useRef<string | null>(null);

  // Prénom absent : « Bravo  ! » → « Bravo ! » (formules neutres sans clé dédiée).
  const text = useCallback(
    (e: CoachEvent) => (hasKey(e.textKey) ? t(e.textKey, fmt(e.params, { monthDates: e.kind === 'goal_eta' })).replace(/ {2,}/g, ' ').replace(/ ,/g, ',').replace(/^ /, '') : ''),
    [t, fmt],
  );

  // Valeurs courantes lues par les gestionnaires asynchrones.
  const latest = useRef({ engine, uid: user?.uid ?? null, profile, mode, currency, label: labels.label, toast, text, spaceId: activeSpace?.id ?? null });
  useEffect(() => {
    latest.current = { engine, uid: user?.uid ?? null, profile, mode, currency, label: labels.label, toast, text, spaceId: activeSpace?.id ?? null };
  });

  /** Applique la politique puis présente : texte (toujours), son et voix (phase 3). */
  const deliver = useCallback(async (events: CoachEvent[], trigger: CoachTrigger) => {
    const { uid, profile: p, mode: m, toast: tst, text: txt } = latest.current;
    if (!uid || !events.length) return;
    const state = await deliveryState(uid);
    const plan = planDelivery({
      events,
      state,
      now: Date.now(),
      today: today(),
      trigger,
      prefs: coachPrefs(p?.preferences),
      notifications: p?.preferences.notifications ?? ({} as never),
      sessionVoiceUsed: sessionVoiceUsed.current,
      foreground: AppState.currentState === 'active' || AppState.currentState == null,
    });
    sessionVoiceUsed.current = plan.sessionVoiceUsed;
    await saveDeliveryState(uid, plan.state);
    if (!plan.show.length) return;
    const top = plan.show[0];
    if (trigger === 'write') {
      tst.show(txt(top), top.severity === 'critical' ? 'error' : top.severity === 'celebration' ? 'success' : 'warning');
    } else {
      setSummary(plan.show);
    }
    presentCoachPlan(plan, txt);
    // Les notifications système et les autres appareils ne répètent pas ce qui vient d'être dit.
    await addNotified(uid, plan.show.map((e) => e.id));
    if (m === 'firebase') void recordCoachEvents(uid, plan.show, Date.now()).catch(() => undefined);
  }, []);

  // ─── Réaction immédiate à une écriture ───────────────────────────────
  useEffect(() => {
    const handle = async (signal: CoachWriteSignal) => {
      const { engine: e, uid, profile: p, currency: cur } = latest.current;
      if (!e || !uid) return;
      const memory = await envelopeMemory(uid, signal.spaceId);
      const r = alertsAfterWrite({ data: e.getData(signal.spaceId), touched: signal.touched, currency: cur, memory, today: today() });
      // Mémoire toujours à jour (même alertes coupées) : pas de rafale à la réactivation.
      await saveEnvelopeMemory(uid, signal.spaceId, r.memory);
      const now = Date.now();
      await deliver(r.alerts.map((a) => fromEnvelopeAlert(a, signal.spaceId, p?.firstName, now)), 'write');
    };
    setCoachWriteHandler((s) => void handle(s).catch(() => undefined));
    return () => setCoachWriteHandler(null);
  }, [deliver]);

  // ─── Récompenses ─────────────────────────────────────────────────────
  /** Nouvelles récompenses → enregistrées + événements de célébration (même politique que le reste). */
  const awardRewards = useCallback(async (overlay: boolean): Promise<CoachEvent[]> => {
    const { engine: e, uid, profile: p, mode: m, currency: cur, spaceId, text: txt } = latest.current;
    if (!e || !uid || !spaceId || !e.isLoaded(spaceId)) return [];
    const online = m === 'firebase';
    const history = await loadRewards(uid, online);
    const fresh = evaluateRewards({ data: e.getData(spaceId), currency: cur, month: monthToEvaluate(today()), history }, Date.now()).map((r) => ({ ...r, spaceId }));
    if (!fresh.length) {
      setRewards(history);
      return [];
    }
    await saveRewards(uid, fresh, online);
    setRewards([...history, ...fresh]);
    const now = Date.now();
    const events: CoachEvent[] = fresh.map((r) => {
      const def = REWARDS.find((d) => d.id === r.rewardId)!;
      return { id: `reward_${rewardKey(r.rewardId, r.period)}`, kind: `reward_${r.rewardId}`, severity: 'celebration', priority: 35 + (def.tier === 'gold' ? 3 : def.tier === 'silver' ? 2 : 1), spaceId, period: r.period, textKey: def.messageKey, params: { name: p?.firstName ?? '' }, pref: null, createdAt: now };
    });
    if (overlay) {
      const top = [...events].sort((a, b) => b.priority - a.priority)[0];
      setCelebration({ rewardId: top.kind.replace('reward_', ''), message: txt(top) });
    }
    return events;
  }, []);

  const checkRewards = useCallback(
    async (opts?: { overlay?: boolean }) => {
      const events = await awardRewards(!!opts?.overlay);
      await deliver(events, 'write');
    },
    [awardRewards, deliver],
  );

  // ─── Ouverture / retour au premier plan : un seul résumé ─────────────
  const evaluateOpen = useCallback(async () => {
    const { engine: e, uid, profile: p, mode: m, currency: cur, label, spaceId } = latest.current;
    if (!e || !uid || !spaceId || !p?.onboarding.completed || !e.isLoaded(spaceId)) return;
    if (m === 'firebase' && remoteMergedFor.current !== uid) {
      remoteMergedFor.current = uid;
      await fetchDeliveredIds(uid)
        .then((ids) => mergeDelivered(uid, ids))
        .catch(() => undefined);
    }
    const data = e.getData(spaceId);
    const day = today();
    const month = monthKey(day);
    const now = Date.now();
    const memory = await envelopeMemory(uid, spaceId);
    const env = evaluateEnvelopeAlerts({ statuses: envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, cur), month, plans: data.budgets, memory, today: day });
    await saveEnvelopeMemory(uid, spaceId, env.memory);
    const free = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, cur).free;
    const snap = financialSnapshot({ data, currency: cur, now: day, available: free, financial: p.financial });
    const events = [
      ...env.alerts.map((a) => fromEnvelopeAlert(a, spaceId, p.firstName, now)),
      ...fromInsights(computeInsights({ data, currency: cur, now: day, categoryName: label }), spaceId, month, now),
      ...fromRecommendations(recommendations(snap, data.goals), spaceId, month, now),
      ...detectPositiveEvents(data, cur, day, spaceId, now),
      ...(await awardRewards(true)),
    ];
    await deliver(events, 'open');
  }, [deliver, awardRewards]);

  const spaceId = activeSpace?.id ?? null;
  const onboarded = !!profile?.onboarding.completed;
  useEffect(() => {
    if (!ready || !onboarded || !spaceId) return;
    // Laisse la synchro initiale livrer les données à jour avant de juger.
    const timer = setTimeout(() => void evaluateOpen().catch(() => undefined), 2500);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        sessionVoiceUsed.current = false; // nouvelle « ouverture »
        void evaluateOpen().catch(() => undefined);
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [ready, onboarded, spaceId, evaluateOpen]);

  // Changement de compte : rien du précédent ne reste affiché.
  const uid = user?.uid ?? null;
  const [summaryFor, setSummaryFor] = useState(uid);
  if (summaryFor !== uid) {
    setSummaryFor(uid);
    setSummary([]);
    setRewards([]);
    setCelebration(null);
  }

  const dismiss = useCallback(() => setSummary([]), []);
  const value = useMemo(() => ({ summary, dismiss, text, rewards, checkRewards }), [summary, dismiss, text, rewards, checkRewards]);
  return (
    <CoachContext.Provider value={value}>
      <VoiceHost />
      {children}
      {celebration ? <RewardCelebration rewardId={celebration.rewardId} message={celebration.message} onClose={() => setCelebration(null)} /> : null}
    </CoachContext.Provider>
  );
}
