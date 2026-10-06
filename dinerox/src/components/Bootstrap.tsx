import { useEffect, useRef } from 'react';
import { useApp, useData, useSpaceReady } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useI18n } from '@/i18n';
import { analytics, enableFirestoreAnalytics } from '@/services/analytics';
import { notifyNewInsights, registerPushToken, scheduleLocalNotifications } from '@/services/notifications';
import { useInsightText } from '@/hooks/useInsightText';
import { buildDemoData } from '@/core/demo';
import { systemCategories } from '@/core/defaults';
import { subcategoryDocs } from '@/core/catalog';
import { zoneOf } from '@/core/countries';
import { today } from '@/core/dates';
import { readJSON, storageKey, writeJSON } from '@/services/storage';
import type { CollectionName, SyncedDoc } from '@/core/types';
import type { TKey } from '@/i18n';

/**
 * Tâches de fond liées à la session : récurrences dues, notifications,
 * consentement analytique, jeton push. Ne rend rien.
 */
export function Bootstrap() {
  const { user, profile, mode, activeSpace, engine, role, addLocalSpace, setActiveSpace } = useApp();
  const data = useData();
  const { runRecurring } = useActions();
  const { insights } = useFinance();
  const { t, date, lang } = useI18n();
  const money = useMoney();
  const render = useInsightText();
  const ranFor = useRef<string | null>(null);
  const demoDone = useRef(false);

  // Mise à niveau du catalogue (comptes existants) : nouvelles catégories principales
  // et sous-catégories du pays, ajoutées une fois. Un élément supprimé par
  // l'utilisateur (trace de suppression) n'est jamais recréé.
  const catalogFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !profile?.onboarding.completed || !engine || !activeSpace || role !== 'admin') return;
    if (activeSpace.id.startsWith('demo_') || !engine.isLoaded(activeSpace.id) || catalogFor.current === activeSpace.id) return;
    const key = storageKey(user.uid, `catalog1_${activeSpace.id}`);
    const spaceId = activeSpace.id;
    // Laisse la synchro initiale livrer l'existant (nouvel appareil) avant de compléter.
    const timer = setTimeout(() => void run().catch(() => undefined), 4000);
    const run = async () => {
      if (catalogFor.current === spaceId) return;
      catalogFor.current = spaceId;
      if (await readJSON<boolean>(key)) return;
      const country = profile.country;
      const zone = zoneOf(country);
      const now = Date.now();
      const parents = systemCategories({ now, uid: user.uid, zone });
      const subs = subcategoryDocs(country, zone, { now, uid: user.uid, lang, parents: new Set(parents.map((c) => c.id)) });
      const missing = [...parents, ...subs].filter((c) => !engine.getDoc(spaceId, 'categories', c.id));
      if (missing.length) engine.writeMany(spaceId, missing.map((doc) => ({ col: 'categories' as const, doc })));
      await writeJSON(key, true);
    };
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.onboarding.completed, profile?.country, engine, activeSpace?.id, role, lang, data.categories.length > 0]);

  // « Tester sans données » : création de l'espace de démonstration (local, fictif).
  useEffect(() => {
    if (!user || user.uid !== 'local' || !engine || demoDone.current) return;
    demoDone.current = true;
    void (async () => {
      if (!(await readJSON<boolean>(storageKey(user.uid, 'demoRequested')))) return;
      await writeJSON(storageKey(user.uid, 'demoRequested'), null);
      const id = `demo_${user.uid}`;
      const now = Date.now();
      await addLocalSpace({ id, kind: 'personal', name: t('demo.space'), ownerId: user.uid, members: { [user.uid]: 'admin' }, memberIds: [user.uid], memberNames: {}, currency: 'XOF', createdAt: now, updatedAt: now });
      await engine.open(id, 'admin');
      if (engine.getData(id).accounts.length === 0) {
        const d = buildDemoData({ now, uid: user.uid, today: today(), label: (k) => t(k as TKey) });
        const items: { col: CollectionName; doc: SyncedDoc }[] = [];
        for (const [col, docs] of Object.entries(d)) for (const doc of docs as SyncedDoc[]) items.push({ col: col as CollectionName, doc });
        engine.writeMany(id, items);
      }
      setActiveSpace(id);
    })().catch(() => undefined);
  }, [user, engine, addLocalSpace, setActiveSpace, t]);

  // Consentement analytique.
  useEffect(() => {
    analytics.setConsent(!!profile?.preferences.analyticsConsent);
    if (profile?.preferences.analyticsConsent) enableFirestoreAnalytics();
  }, [profile?.preferences.analyticsConsent]);

  // Échéances récurrentes : une fois par ouverture d'espace, après chargement.
  // L'espace n'est marqué « traité » qu'une fois le minuteur écoulé : si l'effet
  // est relancé entre-temps (synchro qui livre les règles), il réarme le minuteur
  // au lieu de l'annuler définitivement.
  const runRecurringRef = useRef(runRecurring);
  useEffect(() => {
    runRecurringRef.current = runRecurring;
  }, [runRecurring]);
  const activeSpaceId = activeSpace?.id ?? null;
  const spaceLoaded = useSpaceReady();
  useEffect(() => {
    if (!activeSpaceId || !spaceLoaded || !profile?.onboarding.completed) return;
    if (ranFor.current === activeSpaceId) return;
    // Laisse le temps à la synchro initiale de livrer les règles à jour.
    const timer = setTimeout(() => {
      ranFor.current = activeSpaceId;
      try {
        runRecurringRef.current();
      } catch {
        // Droits insuffisants (enfant) ou espace en lecture seule : rien à générer.
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeSpaceId, spaceLoaded, profile?.onboarding.completed, data.recurring.length]);

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
