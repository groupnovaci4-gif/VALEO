import { useEffect, useMemo, useRef } from 'react';
import { useApp, useData, useSpaceReady } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useI18n } from '@/i18n';
import { analytics, enableFirestoreAnalytics } from '@/services/analytics';
import { notifyNewInsights, registerPushToken, scheduleLocalNotifications } from '@/services/notifications';
import { useInsightText } from '@/hooks/useInsightText';
import { coachPrefs } from '@/core/coach/prefs';
import { DEFAULT_REMINDER_HOUR, lastEntryAt, planEntryReminders } from '@/core/entry/reminder';
import { buildDemoData } from '@/core/demo';
import { systemCategories } from '@/core/defaults';
import { subcategoryDocs } from '@/core/catalog';
import { zoneOf } from '@/core/countries';
import { parseISODate, today } from '@/core/dates';
import { reserveReminders } from '@/core/reserve';
import { seasonReminders } from '@/core/seasons';
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
  // Rappel du soir : replanifié à chaque saisie (le rappel du jour disparaît une fois une opération saisie).
  const lastEntry = useMemo(() => (user ? lastEntryAt(data.transactions, user.uid) : null), [data.transactions, user]);
  useEffect(() => {
    if (!prefs || !profile?.onboarding.completed) return;
    const reminders = planEntryReminders({ now: Date.now(), enabled: prefs.dailyEntryReminder ?? true, hour: prefs.dailyReminderHour ?? DEFAULT_REMINDER_HOUR, lastEntryAt: lastEntry });
    // Réserve : « Mettre X de côté » le lendemain de la paie (rappels d'épargne activés), à 18 h.
    const at = (d: string, hour: number) => {
      const when = parseISODate(d);
      when.setHours(hour, 0, 0, 0);
      return when;
    };
    const dated = [
      ...(prefs.savingsReminder ? reserveReminders(data, { payDay: profile.financial?.payDay, today: today() }).map((r) => ({ date: at(r.date, 18), title: t('notif.reserve.title'), body: t('notif.reserve.body'), url: `/reserve/${r.reserveId}?refill=1` })) : []),
      // Moments forts : J-60, J-30 et J-7 (texte sobre, jamais le nom saisi).
      ...(prefs.goalProgress ? seasonReminders(data, today()).map((r) => ({ date: at(r.date, 9), title: t('notif.season.title'), body: t('notif.season.body'), url: `/goals/${r.goalId}` })) : []),
    ];
    void scheduleLocalNotifications(prefs, t, data.debts, data.debtPayments, (n) => money(n), (d) => date(d), reminders, dated).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, data.debts, data.debtPayments, data.goals, data.goalContributions, profile?.onboarding.completed, profile?.financial?.payDay, lastEntry]);

  // Alertes immédiates (budget, dépense inhabituelle, objectif proche) en
  // notification système — seulement si le coach est désactivé : sinon c'est
  // le coach qui les présente dans l'application (un seul circuit, pas de doublon).
  const coachOn = coachPrefs(profile?.preferences).enabled;
  useEffect(() => {
    if (!user || !prefs || !profile?.onboarding.completed || coachOn) return;
    void notifyNewInsights(user.uid, insights, prefs, render).catch(() => undefined);
  }, [user, prefs, insights, render, profile?.onboarding.completed, coachOn]);

  // Jeton push (comptes en ligne uniquement).
  useEffect(() => {
    if (mode === 'firebase' && user && profile?.onboarding.completed) void registerPushToken(user.uid);
  }, [mode, user, profile?.onboarding.completed]);

  return null;
}
