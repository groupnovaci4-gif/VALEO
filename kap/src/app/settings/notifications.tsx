import React, { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Card, Screen, SwitchRow } from '@/components/ui';
import type { NotificationPrefs } from '@/core/types';
import { ensurePermission } from '@/services/notifications';

const KEYS: (keyof NotificationPrefs)[] = ['budgetAlerts', 'goalProgress', 'incomeReceived', 'unusualSpending', 'savingsReminder', 'debtDue', 'weeklySummary', 'monthlySummary'];

export default function NotificationSettings() {
  const { t } = useI18n();
  const { profile, updateProfile } = useApp();
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void Notifications.getPermissionsAsync().then((p) => setDenied(!p.granted && !p.canAskAgain));
  }, []);
  if (!profile) return null;
  const prefs = profile.preferences.notifications;
  return (
    <Screen back title={t('notif.settings')}>
      {denied ? <Banner tone="warning" icon="notifications-off-outline" text={t('notif.permissionDenied')} /> : null}
      <Card>
        {KEYS.map((k) => (
          <SwitchRow
            key={k}
            title={t(`notif.${k}` as TKey)}
            value={prefs[k]}
            onChange={(v) => {
              if (v) void ensurePermission().then((ok) => setDenied(!ok));
              void updateProfile({ preferences: { ...profile.preferences, notifications: { ...prefs, [k]: v } } });
            }}
          />
        ))}
      </Card>
    </Screen>
  );
}
