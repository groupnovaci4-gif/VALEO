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
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { firebase } from './firebase';
import { readJSON, storageKey, writeJSON } from './storage';
import { addNotified, hasNotified } from './coachMemory';
import type { Insight } from '@/core/insights';
import type { Debt, DebtPayment, NotificationPrefs } from '@/core/types';
import { debtStatus } from '@/core/debts';
import { addDays, parseISODate, today } from '@/core/dates';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Depuis le SDK 53, Expo Go sur Android refuse de charger expo-notifications
 * (le simple import lève une erreur et ferait planter l'application). Le
 * module est donc chargé à la demande, et désactivé dans ce cas précis ;
 * il fonctionne normalement dans un build de développement ou de production.
 */
export const notificationsSupported = !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

let loaded: NotificationsModule | null | undefined;
function getNotifications(): NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (!notificationsSupported) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    loaded = mod;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Chemin interne porté par une notification (jamais d'URL externe). */
function tapUrl(data: unknown): string | null {
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

/**
 * Appelle `onOpen(chemin)` quand l'utilisateur touche une notification,
 * y compris celle qui a lancé l'application (démarrage à froid).
 */
export function listenNotificationTaps(onOpen: (url: string) => void): () => void {
  const Notifications = getNotifications();
  if (!Notifications) return () => undefined;
  let alive = true;
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      const url = r ? tapUrl(r.notification.request.content.data) : null;
      if (alive && url) onOpen(url);
    })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = tapUrl(r.notification.request.content.data);
    if (url) onOpen(url);
  });
  return () => {
    alive = false;
    sub.remove();
  };
}

/** État des autorisations, sans rien demander. null si indisponible. */
export async function permissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean } | null> {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  const p = await Notifications.getPermissionsAsync();
  return { granted: p.granted, canAskAgain: p.canAskAgain };
}

export async function ensurePermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
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
  const Notifications = getNotifications();
  if (!Notifications || !(await ensurePermission())) return;
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
  // Ensemble « déjà signalé » partagé avec les alertes immédiates du coach.
  const fresh: Insight[] = [];
  for (const i of insights) {
    const pref = NOTIFIABLE[i.kind];
    if (pref && prefs[pref] && !(await hasNotified(uid, i.id))) fresh.push(i);
  }
  const Notifications = getNotifications();
  if (!fresh.length || !Notifications) return;
  const granted = (await Notifications.getPermissionsAsync()).granted;
  const batch = fresh.slice(0, 3);
  for (const i of batch) {
    if (granted) await Notifications.scheduleNotificationAsync({ content: { title: render(i), body: '' }, trigger: null });
  }
  await addNotified(uid, batch.map((i) => i.id));
}

/** Enregistre le jeton push de l'appareil (appareil physique + projet EAS requis). */
export async function registerPushToken(uid: string): Promise<void> {
  try {
    const Notifications = getNotifications();
    if (!Notifications || !Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId || !(await ensurePermission())) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const id = token.replace(/[^A-Za-z0-9]/g, '').slice(-40);
    await setDoc(doc(firebase().db, 'users', uid, 'devices', id), { token, platform: Platform.OS, updatedAt: Date.now() });
    await writeJSON(storageKey(uid, 'pushDeviceId'), id);
  } catch {
    // Expo Go Android ne gère plus les push distants : les notifications locales restent actives.
  }
}

/**
 * Déconnexion : l'appareil cesse de recevoir les notifications de ce compte.
 *  - rappels locaux programmés (ils citent des dettes, des objectifs…) annulés ;
 *  - jeton push retiré du compte (sinon les résumés de A arriveraient sur le
 *    téléphone désormais utilisé par B).
 * Ne bloque jamais la déconnexion (hors-ligne : abandon après 3 s).
 */
export async function forgetDeviceNotifications(uid: string | null, online: boolean): Promise<void> {
  const Notifications = getNotifications();
  if (Notifications) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
    await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  }
  if (!uid) return;
  const key = storageKey(uid, 'pushDeviceId');
  const id = await readJSON<string>(key);
  if (!id || !online) return;
  const removal = deleteDoc(doc(firebase().db, 'users', uid, 'devices', id)).then(() => writeJSON(key, null));
  await Promise.race([removal.catch(() => undefined), new Promise((r) => setTimeout(r, 3000))]);
}
