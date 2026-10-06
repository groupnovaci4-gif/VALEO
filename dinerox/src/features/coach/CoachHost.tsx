/**
 * Hôte du coach : reçoit les signaux d'écriture (`bus.ts`), décide des alertes
 * de budget avec le module pur `core/coach/envelopeAlerts` et les présente.
 * Phase 1 : message immédiat à l'écran (toast). Les phases suivantes passent
 * par le moteur d'événements (priorités, plafonds, voix).
 */
import { useEffect, useRef } from 'react';
import { useApp } from '@/store/app';
import { useCurrency } from '@/hooks/useFinance';
import { useToast } from '@/components/ui';
import { useI18n, type TKey } from '@/i18n';
import { useFormatParams } from '@/hooks/useInsightText';
import { today } from '@/core/dates';
import { LEVEL_RANK } from '@/core/budget';
import { alertsAfterWrite, envelopeAlertMessage } from '@/core/coach/envelopeAlerts';
import { addNotified, envelopeMemory, saveEnvelopeMemory } from '@/services/coachMemory';
import { setCoachWriteHandler, type CoachWriteSignal } from './bus';

export function CoachHost() {
  const { engine, user, profile } = useApp();
  const currency = useCurrency();
  const toast = useToast();
  const { t } = useI18n();
  const fmt = useFormatParams();
  // Valeurs courantes lues par le gestionnaire (enregistré une seule fois).
  const latest = useRef({ engine, uid: user?.uid ?? null, profile, currency, toast, t, fmt });
  useEffect(() => {
    latest.current = { engine, uid: user?.uid ?? null, profile, currency, toast, t, fmt };
  });

  useEffect(() => {
    const handle = async (signal: CoachWriteSignal) => {
      const { engine: e, uid, profile: p, currency: cur } = latest.current;
      if (!e || !uid) return;
      const memory = await envelopeMemory(uid, signal.spaceId);
      const r = alertsAfterWrite({ data: e.getData(signal.spaceId), touched: signal.touched, currency: cur, memory, today: today() });
      // La mémoire est toujours mise à jour (même alertes coupées) : pas de rafale à la réactivation.
      await saveEnvelopeMemory(uid, signal.spaceId, r.memory);
      if (!r.alerts.length || p?.preferences.notifications.budgetAlerts === false) return;
      // Plusieurs enveloppes touchées : la plus grave d'abord, une seule à l'écran.
      const top = [...r.alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
      const msg = envelopeAlertMessage(top, p?.firstName);
      const { toast: show, t: tr, fmt: format } = latest.current;
      show.show(tr(msg.key as TKey, format(msg.params)), top.level === 'critical' ? 'error' : 'warning');
      // Les notifications système ne répètent pas ce qui vient d'être dit.
      await addNotified(uid, r.alerts.filter((a) => !a.reminder).map((a) => a.id));
    };
    setCoachWriteHandler((s) => void handle(s).catch(() => undefined));
    return () => setCoachWriteHandler(null);
  }, []);
  return null;
}
