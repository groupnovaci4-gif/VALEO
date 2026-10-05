import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { LANGUAGE_NAMES, LANGUAGES, useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Card, ChipGroup, IconCircle, Row, Screen, SectionHeader, Text } from '@/components/ui';
import type { ThemePreference } from '@/core/types';
import { env } from '@/config/env';
import { brand } from '@/config/brand';
import { signOut } from '@/services/auth';
import { useTheme } from '@/theme';

export default function Settings() {
  const { t } = useI18n();
  const { profile, updateProfile, mode, user, signOutLocal, plan } = useApp();
  const { colors } = useTheme();
  if (!profile) return null;
  const prefs = profile.preferences;
  return (
    <Screen back title={t('set.title')}>
      <Card>
        <Row
          title={`${profile.firstName} ${profile.lastName}`.trim() || t('set.profile')}
          subtitle={[user?.email, t(`sub.${plan}`)].filter(Boolean).join(' · ')}
          left={<IconCircle icon="person" color={colors.primary} />}
          chevron
          onPress={() => router.push('/settings/profile')}
        />
      </Card>
      <SectionHeader title={t('set.preferences')} />
      <Card>
        <Text variant="small" weight="600" style={{ marginVertical: 6 }}>
          {t('set.language')}
        </Text>
        <ChipGroup options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))} value={profile.language} onChange={(language) => void updateProfile({ language })} />
        <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
          {t('set.theme')}
        </Text>
        <ChipGroup
          options={(['system', 'light', 'dark'] as ThemePreference[]).map((v) => ({ value: v, label: t(`set.theme.${v}`) }))}
          value={prefs.theme}
          onChange={(theme) => void updateProfile({ preferences: { ...prefs, theme } })}
        />
      </Card>
      <SectionHeader title={t('set.title')} />
      <Card>
        <Row title={t('set.security')} left={<IconCircle icon="lock-closed" color={colors.primary} size={36} />} chevron onPress={() => router.push('/settings/security')} />
        <Row title={t('set.notifications')} left={<IconCircle icon="notifications" color={colors.secondary} size={36} />} chevron onPress={() => router.push('/settings/notifications')} />
        <Row title={t('set.recurring')} left={<IconCircle icon="repeat" color={colors.primary} size={36} />} chevron onPress={() => router.push('/recurring')} />
        <Row title={t('set.categories')} left={<IconCircle icon="pricetags" color={colors.textMuted} size={36} />} chevron onPress={() => router.push('/categories')} />
        <Row title={t('set.data')} left={<IconCircle icon="server" color={colors.info} size={36} />} chevron onPress={() => router.push('/settings/data')} />
      </Card>
      <SectionHeader title={t('set.legal')} />
      <Card>
        <Row title={t('set.privacy')} chevron onPress={() => router.push('/legal/privacy')} />
        <Row title={t('set.terms')} chevron onPress={() => router.push('/legal/terms')} />
        <Row title={t('set.about')} subtitle={`${brand.name} · ${t('set.version', { version: env.buildLabel, env: env.appEnv })}`} />
      </Card>
      <Card style={{ marginTop: 18 }}>
        <Row
          title={t('auth.signout')}
          danger
          onPress={() =>
            Alert.alert(t('auth.signout'), undefined, [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('auth.signout'), style: 'destructive', onPress: () => void (mode === 'local' ? signOutLocal() : signOut()) },
            ])
          }
        />
      </Card>
    </Screen>
  );
}
