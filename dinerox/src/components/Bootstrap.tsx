import { useEffect, useRef } from 'react';
import { useApp, useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useI18n } from '@/i18n';
import { analytics, enableFirestoreAnalytics } from '@/services/analytics';
import { notifyNewInsights, registerPushToken, scheduleLocalNotifications } from '@/services/notifications';
import { useInsightText } from '@/hooks/useInsightText';

/**
 * Tâches de fond liées à la session : récurrences dues, notifications,
 * consentement analytique, jeton push. Ne rend rien.
 */
export function Bootstrap() {
  const { user, profile, mode, activeSpace, engine } = useApp();
  const data = useData();
  const { runRecurring } = useActions();
  const { insights } = useFinance();
  const { t, date } = useI18n();
  const money = useMoney();
  const render = useInsightText();
  const ranFor = useRef<string | null>(null);

  // Consentement analytique.
  useEffect(() => {
    analytics.setConsent(!!profile?.preferences.analyticsConsent);
    if (profile?.preferences.analyticsConsent) enableFirestoreAnalytics();
  }, [profile?.preferences.analyticsConsent]);

  // Échéances récurrentes : une fois par ouverture d'espace, après chargement.
  useEffect(() => {
    if (!engine || !activeSpace || !profile?.onboarding.completed) return;
    if (ranFor.current === activeSpace.id || !engine.isLoaded(activeSpace.id)) return;
    ranFor.current = activeSpace.id;
    // Laisse le temps à la synchro initiale de livrer les règles à jour.
    const timer = setTimeout(() => runRecurring(), 1500);
    return () => clearTimeout(timer);
  }, [engine, activeSpace, profile?.onboarding.completed, runRecurring, data.recurring.length]);

  // Notifications programmées (rappels, résumés, échéances).
  const prefs = profile?.preferences.notifications;
  useEffect(() => {
    if (!prefs || !profile?.onboarding.completed) return;
    void scheduleLocalNotifications(prefs, t, data.debts, data.debtPayments, (n) => money(n), (d) => date(d)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, data.debts, data.debtPayments, profile?.onboarding.completed]);

  // Alertes immédiates (budget, dépense inhabituelle, objectif proche).
  useEffect(() => {
    if (!user || !prefs || !profile?.onboarding.completed) return;
    void notifyNewInsights(user.uid, insights, prefs, render).catch(() => undefined);
  }, [user, prefs, insights, render, profile?.onboarding.completed]);

  // Jeton push (comptes en ligne uniquement).
  useEffect(() => {
    if (mode === 'firebase' && user && profile?.onboarding.completed) void registerPushToken(user.uid);
  }, [mode, user, profile?.onboarding.completed]);

  return null;
}
