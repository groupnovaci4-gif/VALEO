/**
 * Notifications intelligentes.
 *
 * - Locales (fonctionnent hors-ligne) : rappels d'épargne, résumés,
 *   échéances de dettes, alertes budget / dépense inhabituelle / objectif
 *   proche, déclenchées par le moteur d'analyse.
 * - Push (serveur) : jeton Expo enregistré dans users/{uid}/devices ; une
 *   Cloud Function planifiée envoie les résumés (voir firebase/functions).
 * Chaque type est désactivable dans les préférences.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { readJSON, storageKey, writeJSON } from './storage';
import type { Insight } from '@/core/insights';
import type { Debt, DebtPayment, NotificationPrefs } from '@/core/types';
import { debtStatus } from '@/core/debts';
import { addDays, parseISODate, today } from '@/core/dates';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Default', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

type Translate = (key: 'notif.savingsReminder.title' | 'notif.savingsReminder.body' | 'notif.weekly.title' | 'notif.weekly.body' | 'notif.monthly.title' | 'notif.monthly.body' | 'notif.debtDue.title' | 'notif.debtDue.body', params?: Record<string, string | number>) => string;

/** Reprogramme toutes les notifications locales récurrentes selon les préférences. */
export async function scheduleLocalNotifications(
  prefs: NotificationPrefs,
  t: Translate,
  debts: Debt[],
  payments: DebtPayment[],
  formatAmount: (n: number) => string,
  formatDate: (d: string) => string,
): Promise<void> {
  if (!(await ensurePermission())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const T = Notifications.SchedulableTriggerInputTypes;
  if (prefs.savingsReminder) {
    await Notifications.scheduleNotificationAsync({
      content: { title: t('notif.savingsReminder.title'), body: t('notif.savingsReminder.body'), data: { url: '/goals' } },
      trigger: { type: T.WEEKLY, weekday: 1, hour: 18, minute: 0 }, // dimanche 18 h
    });
  }
  if (prefs.weeklySummary) {
    await Notifications.scheduleNotificationAsync({
      content: { title: t('notif.weekly.title'), body: t('notif.weekly.body'), data: { url: '/reports?period=week' } },
      trigger: { type: T.WEEKLY, weekday: 2, hour: 8, minute: 30 }, // lundi 8 h 30
    });
  }
  if (prefs.monthlySummary) {
    await Notifications.scheduleNotificationAsync({
      content: { title: t('notif.monthly.title'), body: t('notif.monthly.body'), data: { url: '/reports?period=month' } },
      trigger: { type: T.MONTHLY, day: 1, hour: 9, minute: 0 },
    });
  }
  if (prefs.debtDue) {
    const now = today();
    for (const d of debts) {
      if (d.deleted || d.direction !== 'i_owe') continue;
      const s = debtStatus(d, payments, now);
      if (!s.nextDue || s.settled) continue;
      const remindOn = addDays(s.nextDue, -1);
      const when = parseISODate(remindOn);
      when.setHours(9, 0, 0, 0);
      if (when.getTime() <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notif.debtDue.title'),
          body: t('notif.debtDue.body', { name: d.counterparty, amount: formatAmount(d.installment ?? s.remaining), date: formatDate(s.nextDue) }),
          data: { url: `/debts/${d.id}` },
        },
        trigger: { type: T.DATE, date: when },
      });
    }
  }
}

const NOTIFIABLE: Partial<Record<Insight['kind'], keyof NotificationPrefs>> = {
  envelope_threshold: 'budgetAlerts',
  envelope_over_streak: 'budgetAlerts',
  unusual_expense: 'unusualSpending',
  goal_near: 'goalProgress',
  goal_reached: 'goalProgress',
};

/**
 * Envoie immédiatement une notification pour chaque NOUVELLE alerte
 * importante (une seule fois par alerte, mémorisé localement).
 */
export async function notifyNewInsights(uid: string, insights: Insight[], prefs: NotificationPrefs, render: (i: Insight) => string): Promise<void> {
  const key = storageKey(uid, 'notifiedInsights');
  const seen = new Set((await readJSON<string[]>(key)) ?? []);
  const fresh = insights.filter((i) => {
    const pref = NOTIFIABLE[i.kind];
    if (!pref || !prefs[pref] || seen.has(i.id)) return false;
    if (i.kind === 'envelope_threshold' && i.params.level === 'warn70') return false; // 70 % : visible dans l'app, sans notification
    return true;
  });
  if (!fresh.length) return;
  const granted = (await Notifications.getPermissionsAsync()).granted;
  for (const i of fresh.slice(0, 3)) {
    seen.add(i.id);
    if (granted) await Notifications.scheduleNotificationAsync({ content: { title: render(i), body: '' }, trigger: null });
  }
  await writeJSON(key, [...seen].slice(-300));
}

/** Enregistre le jeton push de l'appareil (appareil physique + projet EAS requis). */
export async function registerPushToken(uid: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId || !(await ensurePermission())) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const id = token.replace(/[^A-Za-z0-9]/g, '').slice(-40);
    await setDoc(doc(firebase().db, 'users', uid, 'devices', id), { token, platform: Platform.OS, updatedAt: Date.now() });
  } catch {
    // Expo Go Android ne gère plus les push distants : les notifications locales restent actives.
  }
}
