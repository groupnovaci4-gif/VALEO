import React, { useEffect, useState } from 'react';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Card, Screen, SwitchRow } from '@/components/ui';
import type { NotificationPrefs } from '@/core/types';
import { ensurePermission, notificationsSupported, permissionStatus } from '@/services/notifications';

const KEYS: (keyof NotificationPrefs)[] = ['budgetAlerts', 'goalProgress', 'incomeReceived', 'unusualSpending', 'savingsReminder', 'debtDue', 'weeklySummary', 'monthlySummary'];

export default function NotificationSettings() {
  const { t } = useI18n();
  const { profile, updateProfile } = useApp();
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void permissionStatus().then((p) => setDenied(!!p && !p.granted && !p.canAskAgain));
  }, []);
  if (!profile) return null;
  const prefs = profile.preferences.notifications;
  return (
    <Screen back title={t('notif.settings')}>
      {!notificationsSupported ? <Banner tone="info" icon="information-circle-outline" text={t('notif.unavailableExpoGo')} /> : null}
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
