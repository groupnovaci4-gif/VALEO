import { useEffect, useRef } from 'react';
import { useApp, useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useI18n } from '@/i18n';
import { analytics, enableFirestoreAnalytics } from '@/services/analytics';
import { notifyNewInsights, registerPushToken, scheduleLocalNotifications } from '@/services/notifications';
import { useInsightText } from '@/hooks/useInsightText';
import { starterStructure } from '@/core/defaults';
import type { CollectionName, SyncedDoc } from '@/core/types';
import type { TKey } from '@/i18n';

/**
 * Tâches de fond liées à la session : récurrences dues, notifications,
 * consentement analytique, jeton push. Ne rend rien.
 */
export function Bootstrap() {
  const { user, profile, mode, activeSpace, engine, role, updateProfile } = useApp();
  const data = useData();
  const { runRecurring } = useActions();
  const { insights } = useFinance();
  const { t, date, lang } = useI18n();
  const money = useMoney();
  const render = useInsightText();
  const ranFor = useRef<string | null>(null);
  const starterFor = useRef<string | null>(null);

  // Première ouverture : pas de questionnaire, l'utilisateur arrive directement sur
  // son tableau de bord. La structure de départ (compte Espèces, enveloppes,
  // catégories) est créée ici, une seule fois, dans son espace personnel.
  useEffect(() => {
    if (!user || !profile || !engine || !activeSpace || role !== 'admin') return;
    if (profile.onboarding.completed || activeSpace.kind !== 'personal') return;
    if (!engine.isLoaded(activeSpace.id) || starterFor.current === activeSpace.id) return;
    starterFor.current = activeSpace.id;
    // Compte existant (réinstallation, ancien parcours) : rien à recréer.
    if (engine.getData(activeSpace.id).accounts.length === 0) {
      const structure = starterStructure(
        { firstName: profile.firstName, currency: profile.currency },
        { now: Date.now(), uid: user.uid, lang, label: (k) => t(k as TKey) },
      );
      const items: { col: CollectionName; doc: SyncedDoc }[] = [];
      for (const [col, docs] of Object.entries(structure)) for (const doc of docs as SyncedDoc[]) items.push({ col: col as CollectionName, doc });
      engine.writeMany(activeSpace.id, items);
      analytics.track('onboarding_completed', { method: 'auto' });
    }
    void updateProfile({ onboarding: { ...profile.onboarding, completed: true } });
  }, [user, profile, engine, activeSpace, role, lang, t, updateProfile, data.accounts.length]);

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
