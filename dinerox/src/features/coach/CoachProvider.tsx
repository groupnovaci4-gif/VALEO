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
import { planDelivery, type CoachTrigger, type DeliveryPlan } from '@/core/coach/policy';
import { coachPrefs } from '@/core/coach/prefs';
import { addNotified, deliveryState, envelopeMemory, mergeDelivered, saveDeliveryState, saveEnvelopeMemory } from '@/services/coachMemory';
import { fetchDeliveredIds, recordCoachEvents } from '@/services/coachHistory';
import { setCoachWriteHandler, type CoachWriteSignal } from './bus';

interface CoachValue {
  /** Résumé en attente (ouverture) : affiché sur l'accueil jusqu'à « J'ai compris ». */
  summary: CoachEvent[];
  dismiss: () => void;
  /** Texte d'un événement (clé i18n + montants formatés). */
  text: (e: CoachEvent) => string;
}

const CoachContext = createContext<CoachValue>({ summary: [], dismiss: () => undefined, text: () => '' });

export function useCoach(): CoachValue {
  return useContext(CoachContext);
}

/** Présentation sonore/vocale d'un plan (branchée par la phase 3 ; texte seul sinon). */
export type CoachPresenter = (plan: DeliveryPlan, text: (e: CoachEvent) => string) => void;
let presenter: CoachPresenter | null = null;
export function setCoachPresenter(p: CoachPresenter | null) {
  presenter = p;
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
  const sessionVoiceUsed = useRef(false);
  const remoteMergedFor = useRef<string | null>(null);

  const text = useCallback((e: CoachEvent) => (hasKey(e.textKey) ? t(e.textKey, fmt(e.params, { monthDates: e.kind === 'goal_eta' })) : ''), [t, fmt]);

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
    presenter?.(plan, txt);
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
    ];
    await deliver(events, 'open');
  }, [deliver]);

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
  }

  const dismiss = useCallback(() => setSummary([]), []);
  const value = useMemo(() => ({ summary, dismiss, text }), [summary, dismiss, text]);
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}
