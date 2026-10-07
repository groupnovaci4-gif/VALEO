import React, { useEffect, useState } from 'react';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, ChipGroup, Screen, SectionHeader, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import type { CoachPrefs, EntryPrefs, NotificationPrefs } from '@/core/types';
import { entryPrefs } from '@/core/entry/prefs';
import { DEFAULT_REMINDER_HOUR } from '@/core/entry/reminder';
import { speechInput } from '@/services/speechInput';

import { coachPrefs } from '@/core/coach/prefs';
import { hasFeature } from '@/core/subscription';
import { speak, stopVoice } from '@/services/voice';
import { ensurePermission, notificationsSupported, permissionStatus } from '@/services/notifications';

type BoolKey = Exclude<keyof NotificationPrefs, 'dailyEntryReminder' | 'dailyReminderHour'>;
const KEYS: BoolKey[] = ['budgetAlerts', 'goalProgress', 'incomeReceived', 'unusualSpending', 'savingsReminder', 'debtDue', 'tontineDue', 'weeklySummary', 'monthlySummary'];

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
  const entry = entryPrefs(profile.preferences);
  const setEntry = (patch: Partial<EntryPrefs>) => void updateProfile({ preferences: { ...profile.preferences, entry: { ...entry, ...patch } } });
  const setNotif = (patch: Partial<NotificationPrefs>) => void updateProfile({ preferences: { ...profile.preferences, notifications: { ...prefs, ...patch } } });
  const reminderOn = prefs.dailyEntryReminder ?? true;
  const reminderHour = prefs.dailyReminderHour ?? DEFAULT_REMINDER_HOUR;
  /** « Tester le micro » : écoute une phrase et affiche ce qui a été compris (rien n'est enregistré). */
  const testMic = async () => {
    const provider = speechInput();
    if (!(await provider.isAvailable())) return toast.show(t('entry.voice.unavailable'), 'info');
    const allowed = (await provider.permission()) === 'granted' || (await provider.requestPermission()) === 'granted';
    if (!allowed) return toast.show(t('entry.voice.denied'), 'warning');
    await stopVoice().catch(() => undefined);
    toast.show(t('entry.voice.listening'), 'info');
    const heard = await provider.listen({ language: entry.voiceLanguage ?? (lang === 'en' ? 'en' : 'fr'), onDeviceOnly: entry.onDeviceOnly }).catch(() => '');
    toast.show(heard ? t('entry.settings.heard', { text: heard }) : t('entry.voice.nothing'), heard ? 'success' : 'info');
  };
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
            value={prefs[k] ?? true}
            onChange={(v) => {
              if (v) void ensurePermission().then((ok) => setDenied(!ok));
              void updateProfile({ preferences: { ...profile.preferences, notifications: { ...prefs, [k]: v } } });
            }}
          />
        ))}
      </Card>

      {/* Saisie : rappel du soir et réglages de la voix (dictée). */}
      <SectionHeader title={t('entry.settings.title')} />
      <Card>
        <SwitchRow
          title={t('entry.settings.reminder')}
          subtitle={t('entry.settings.reminderHint')}
          value={reminderOn}
          onChange={(v) => {
            if (v) void ensurePermission().then((ok) => setDenied(!ok));
            setNotif({ dailyEntryReminder: v });
          }}
        />
        {reminderOn ? (
          <>
            <Text variant="small" weight="600" style={{ marginTop: 6 }}>
              {t('entry.settings.reminderHour')}
            </Text>
            <ChipGroup value={String(reminderHour)} onChange={(h) => setNotif({ dailyReminderHour: Number(h) })} options={['18', '19', '20', '21', '22'].map((h) => ({ value: h, label: `${h} h` }))} />
          </>
        ) : null}
        <Text variant="small" weight="600" style={{ marginTop: 6 }}>
          {t('entry.settings.defaultMethod')}
        </Text>
        <Segmented
          value={entry.defaultMethod}
          onChange={(defaultMethod) => setEntry({ defaultMethod })}
          options={[
            { value: 'voice', label: t('entry.mode.voice'), icon: 'mic-outline' },
            { value: 'quick_manual', label: t('entry.mode.keyboard'), icon: 'keypad-outline' },
          ]}
        />
        <Text variant="small" weight="600" style={{ marginTop: 6 }}>
          {t('entry.settings.voiceLanguage')}
        </Text>
        <ChipGroup
          value={entry.voiceLanguage ?? 'auto'}
          onChange={(v) => setEntry({ voiceLanguage: v === 'auto' ? null : (v as 'fr' | 'en') })}
          options={[
            { value: 'auto', label: t('entry.settings.languageAuto') },
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
        />
        {speechInput().supportsOnDevice() ? <SwitchRow title={t('entry.settings.onDevice')} subtitle={t('entry.settings.onDeviceHint')} value={entry.onDeviceOnly} onChange={(v) => setEntry({ onDeviceOnly: v })} /> : null}
        <SwitchRow title={t('entry.settings.examples')} value={entry.showExamples} onChange={(v) => setEntry({ showExamples: v })} />
        <Button variant="secondary" icon="mic-outline" label={t('entry.settings.testMic')} onPress={() => void testMic()} style={{ marginTop: 8 }} />
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
