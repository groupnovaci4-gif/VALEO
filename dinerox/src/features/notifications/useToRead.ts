/**
 * « À lire » (refonte finale B5, E1 à E4) : rassemble TOUS les messages du coach — alertes
 * (`insights` : budget, seuils 85 % / 100 % / dépassement…), conseil du jour (`adviceOfDay(`),
 * points de « Votre coach » (`summary` : échéances, rappels, célébrations…) et « Votre analyse »
 * (`recommendations[0]`) — sans doublon, puis applique la mémoire locale des messages lus.
 * Aucun calcul : chaque texte vient de son moteur (insights, coach, recommandations).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useApp } from '@/store/app';
import { useFinance } from '@/hooks/useFinance';
import { useInsightText } from '@/hooks/useInsightText';
import { useIntelligence } from '@/hooks/useIntelligence';
import { useRecommendationText } from '@/features/Recommendation';
import { useCoach } from '@/features/coach/CoachProvider';
import { adviceOfDay } from '@/core/coach/advice';
import type { Insight } from '@/core/insights';
import type { Recommendation } from '@/core/intelligence';
import type { CoachEvent } from '@/core/coach/events';
import { loadReadState, readNow, readStateSnapshot, setReadState, subscribeReadState } from '@/services/readState';
import { groupToRead, markRead, mergeToRead, readTargets, visibleToRead, type ToReadItem, type ToReadTone } from './toRead';
import { useI18n, type TKey } from '@/i18n';

/** Alertes du BUDGET (onglet Budget et étiquette « Alerte budget »). */
const BUDGET_INSIGHTS = new Set<Insight['kind']>(['envelope_threshold', 'envelope_over_streak', 'negative_month']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Écran ouvert par un toucher (mêmes destinations que les cartes d'avant). */
export function refPath(r: Insight['ref'] | undefined): string | null {
  if (!r) return null;
  return r.type === 'envelope' ? `/envelopes/${r.id}` : r.type === 'goal' ? `/goals/${r.id}` : r.type === 'debt' ? `/debts/${r.id}` : r.type === 'transaction' ? `/transaction/${r.id}` : null;
}

const insightTone = (s: Insight['severity']): ToReadTone => (s === 'danger' ? 'danger' : s === 'warning' ? 'warning' : 'info');
const coachTone = (s: CoachEvent['severity']): ToReadTone => (s === 'critical' ? 'danger' : s === 'warning' ? 'warning' : s === 'advice' ? 'advice' : 'info');
const recTone = (s: Recommendation['severity']): ToReadTone => (s === 'danger' ? 'danger' : s === 'warning' ? 'warning' : 'info');

export function useToRead() {
  const { user } = useApp();
  const { t } = useI18n();
  const uid = user?.uid ?? null;
  const { insights, now } = useFinance();
  const renderInsight = useInsightText();
  const { summary, text: coachText } = useCoach();
  const { recommendations } = useIntelligence();
  const renderRec = useRecommendationText();
  const snap = useSyncExternalStore(subscribeReadState, readStateSnapshot, readStateSnapshot);
  useEffect(() => {
    void loadReadState(uid);
  }, [uid]);

  const topRec = recommendations[0] ?? null;
  const advice = useMemo(() => adviceOfDay(recommendations.filter((r) => r.id !== topRec?.id), now), [recommendations, now, topRec?.id]);

  const all = useMemo(() => {
    const alerts: ToReadItem[] = insights.map((i) => ({
      id: i.id,
      kind: BUDGET_INSIGHTS.has(i.kind) ? 'budget' : 'coach',
      tone: insightTone(i.severity),
      text: renderInsight(i),
      link: refPath(i.ref),
      dueDate: typeof i.params?.date === 'string' && DAY_RE.test(i.params.date) ? i.params.date : null,
      // Seuil d'une enveloppe : le même fait que l'alerte d'enveloppe du coach.
      keys: i.kind === 'envelope_threshold' && i.ref ? [`envelope:${i.ref.id}`] : [],
      origin: 'insight',
      insightKind: i.kind,
    }));
    const adviceItems: ToReadItem[] = advice ? [{ id: advice.id, kind: 'advice', tone: 'advice', text: renderRec(advice), link: advice.link ?? null, keys: [`rec:${advice.kind}`], origin: 'advice' }] : [];
    const coachItems: ToReadItem[] = summary
      .map((e) => ({
        id: e.id,
        kind: (e.pref === 'budgetAlerts' ? 'budget' : 'coach') as ToReadItem['kind'],
        tone: coachTone(e.severity),
        text: coachText(e),
        link: refPath(e.ref),
        dueDate: DAY_RE.test(e.period) ? e.period : null,
        keys: [e.ref?.type === 'envelope' ? `envelope:${e.ref.id}` : null, e.kind.startsWith('rec_') ? `rec:${e.kind.slice(4)}` : null].filter((k): k is string => !!k),
        // Résumé d'ouverture du coach (1 à 3 points, `planDelivery`).
        origin: 'summary' as const,
      }))
      .filter((x) => x.text);
    const analysisItems: ToReadItem[] = topRec ? [{ id: topRec.id, kind: 'analysis', tone: recTone(topRec.severity), text: renderRec(topRec), link: topRec.link ?? '/analysis', keys: [`rec:${topRec.kind}`], origin: 'analysis' }] : [];
    // Ordre de la maquette : alertes, conseil du jour, votre coach, votre analyse.
    return mergeToRead([alerts.filter((x) => x.kind === 'budget'), adviceItems, alerts.filter((x) => x.kind !== 'budget'), coachItems, analysisItems]);
  }, [insights, renderInsight, advice, renderRec, summary, coachText, topRec]);

  const ready = snap.loaded && snap.uid === uid;
  const visible = useMemo(() => (ready ? visibleToRead(all, snap.store, snap.checkedAt, snap.checkedDay) : []), [ready, all, snap.store, snap.checkedAt, snap.checkedDay]);
  // E5 : les messages du même type deviennent UN message (« 7 paiements réguliers détectés »).
  const items = useMemo(() => groupToRead(visible, (kind, count) => t(`toRead.group.${kind}` as TKey, { count })), [visible, t]);

  // Lire un message regroupé = lire chacun de ses messages (E1).
  const dismiss = useCallback(
    (x: { id: string; reminder: boolean; members?: { id: string; reminder: boolean }[] }) => {
      const { now: at, day } = readNow();
      let store = readStateSnapshot().store;
      for (const target of readTargets(x)) store = markRead(store, target, at, day);
      setReadState(uid, store);
    },
    [uid],
  );
  const dismissAll = useCallback(
    (xs: { id: string; reminder: boolean; members?: { id: string; reminder: boolean }[] }[]) => {
      const { now: at, day } = readNow();
      let store = readStateSnapshot().store;
      for (const x of xs) for (const target of readTargets(x)) store = markRead(store, target, at, day);
      setReadState(uid, store);
    },
    [uid],
  );
  // `all` : TOUS les messages, lus ou non (écran Notifications, B5bis) ; `unread` : le même nombre
  // que « À lire · N » (décision du fondateur, 22/10 : un message regroupé compte pour 1).
  return { items, all, unread: items.length, dismiss, dismissAll, advice, topRec };
}

/** Cloche : le même nombre que « À lire · N » (messages non lus, après regroupement). */
export function useToReadCount(): number {
  return useToRead().unread;
}
