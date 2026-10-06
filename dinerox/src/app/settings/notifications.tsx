import React, { useEffect, useState } from 'react';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, Screen, SectionHeader, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import type { CoachPrefs, NotificationPrefs } from '@/core/types';
import { coachPrefs } from '@/core/coach/prefs';
import { hasFeature } from '@/core/subscription';
import { speak } from '@/services/voice';
import { ensurePermission, notificationsSupported, permissionStatus } from '@/services/notifications';

const KEYS: (keyof NotificationPrefs)[] = ['budgetAlerts', 'goalProgress', 'incomeReceived', 'unusualSpending', 'savingsReminder', 'debtDue', 'weeklySummary', 'monthlySummary'];

export default function NotificationSettings() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { profile, updateProfile, plan, mode } = useApp();
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    permissionStatus()
      .then((p) => setDenied(!!p && !p.granted && !p.canAskAgain))
      .catch(() => setDenied(false));
  }, []);
  if (!profile) return null;
  const prefs = profile.preferences.notifications;
  const coach = coachPrefs(profile.preferences);
  const setCoach = (patch: Partial<CoachPrefs>) => void updateProfile({ preferences: { ...profile.preferences, coach: { ...coach, ...patch } } });
  const premiumAllowed = mode === 'firebase' && hasFeature(plan, 'voice_premium');
  const VOLUMES: Record<string, number> = { off: 0, low: 0.3, mid: 0.6, high: 1 };
  const volumeKey = coach.soundVolume <= 0 ? 'off' : coach.soundVolume < 0.45 ? 'low' : coach.soundVolume < 0.8 ? 'mid' : 'high';
  const testVoice = () =>
    void speak(t('coach.voice.test', { name: profile.firstName || '' }).replace(/\s+,/g, ','), { language: lang === 'en' ? 'en' : 'fr' }).then((r) => {
      if (!r.spoken) toast.show(t('coach.settings.testFailed'), 'info');
    });
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

      {/* Coach : comment il présente les alertes (les types d'alertes restent réglés ci-dessus). */}
      <SectionHeader title={t('coach.settings.title')} />
      <Card>
        <SwitchRow title={t('coach.settings.enabled')} subtitle={t('coach.settings.enabledHint')} value={coach.enabled} onChange={(v) => setCoach({ enabled: v })} />
        {coach.enabled ? (
          <>
            <SwitchRow title={t('coach.settings.criticalOnly')} value={coach.criticalOnly} onChange={(v) => setCoach({ criticalOnly: v })} />
            <SwitchRow title={t('coach.settings.silent')} value={coach.silent} onChange={(v) => setCoach({ silent: v })} />
            <Text variant="small" weight="600" style={{ marginTop: 10, marginBottom: 6 }}>
              {t('coach.settings.frequency')}
            </Text>
            <Segmented value={coach.frequency} onChange={(v) => setCoach({ frequency: v })} options={(['discreet', 'normal', 'active'] as const).map((v) => ({ value: v, label: t(`coach.settings.frequency.${v}`) }))} />
            <Text variant="small" weight="600" style={{ marginTop: 10, marginBottom: 6 }}>
              {t('coach.settings.voice')}
            </Text>
            <Segmented value={coach.voice} onChange={(v) => setCoach({ voice: v })} options={(['off', 'important', 'all'] as const).map((v) => ({ value: v, label: t(`coach.settings.voice.${v}`) }))} />
            <Text variant="caption" tone="subtle" style={{ marginTop: 4, marginBottom: 6 }}>
              {t('coach.settings.voiceHint')}
            </Text>
            <SwitchRow title={t('coach.settings.speakAmounts')} subtitle={t('coach.settings.speakAmountsHint')} value={coach.speakAmounts} onChange={(v) => setCoach({ speakAmounts: v })} />
            <Text variant="small" weight="600" style={{ marginTop: 10, marginBottom: 6 }}>
              {t('coach.settings.sound')}
            </Text>
            <Segmented value={volumeKey} onChange={(v) => setCoach({ soundVolume: VOLUMES[v] })} options={(['off', 'low', 'mid', 'high'] as const).map((v) => ({ value: v, label: t(`coach.settings.sound.${v}`) }))} />
            <SwitchRow
              title={t('coach.settings.premium')}
              subtitle={premiumAllowed ? t('coach.settings.premiumHint') : t('coach.settings.premiumLocked')}
              value={coach.premiumVoice && premiumAllowed}
              disabled={!premiumAllowed}
              onChange={(v) => setCoach({ premiumVoice: v })}
            />
            <Button small variant="secondary" icon="volume-high-outline" label={t('coach.settings.test')} onPress={testVoice} style={{ marginTop: 8 }} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
