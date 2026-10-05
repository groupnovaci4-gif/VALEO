import React from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { LANGUAGE_NAMES, LANGUAGES, useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Badge, Card, Icon, IconButton, IconCircle, Row, Screen, SectionHeader, Segmented, Text } from '@/components/ui';
import { initials } from '@/components/AppHeader';
import { goBack } from '@/hooks/goBack';
import type { ThemePreference } from '@/core/types';
import { env } from '@/config/env';
import { brand } from '@/config/brand';
import { signOut } from '@/services/auth';
import { useTheme } from '@/theme';

export default function Settings() {
  const { t } = useI18n();
  const { profile, updateProfile, mode, user, signOutLocal, plan } = useApp();
  const { colors, radius } = useTheme();
  if (!profile) return null;
  const prefs = profile.preferences;
  const ini = initials(profile.firstName, profile.lastName);
  const confirmSignOut = () => {
    const run = () => void (mode === 'local' ? signOutLocal() : signOut());
    // Sur le web, Alert n'affiche rien : confirmation native du navigateur.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(t('auth.signout') + ' ?')) run();
      return;
    }
    Alert.alert(t('auth.signout'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signout'), style: 'destructive', onPress: run },
    ]);
  };
  const row = (title: TKey, sub: TKey, icon: string, color: string, path: string) => (
    <Row title={t(title)} subtitle={t(sub)} left={<IconCircle icon={icon} color={color} size={44} />} chevron onPress={() => router.push(path as never)} />
  );
  return (
    <Screen brandSection={t('set.title')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <IconButton icon="arrow-back" label={t('common.back')} onPress={goBack} />
        <Text variant="h1" style={{ flexGrow: 1, flexShrink: 1 }}>
          {t('set.title')}
        </Text>
        <Badge tone="success" label={`● ${t('set.accountActive').toUpperCase()}`} />
      </View>

      <Card onPress={() => router.push('/settings/profile')} accessibilityLabel={t('set.profile')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            {ini ? (
              <Text variant="h3" style={{ color: colors.onPrimary }}>
                {ini}
              </Text>
            ) : (
              <Icon name="person" size={26} color={colors.onPrimary} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text variant="h3" numberOfLines={1}>
              {`${profile.firstName} ${profile.lastName}`.trim() || t('set.profile')}
            </Text>
            <Badge tone="success" label={`${brand.name} ${t(`sub.${plan}`)}`} />
            {user?.email ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Card>

      <SectionHeader title={t('set.preferences').toUpperCase()} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text variant="bodyStrong">{t('set.languageLabel')}</Text>
          <Text variant="small" tone="muted">
            {LANGUAGE_NAMES[profile.language]}
          </Text>
        </View>
        <Segmented filled options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))} value={profile.language} onChange={(language) => void updateProfile({ language })} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text variant="bodyStrong">{t('set.appearanceLabel')}</Text>
          <Text variant="small" style={{ color: colors.primary }}>
            {t(`set.theme.${prefs.theme}`)}
          </Text>
        </View>
        <Segmented
          filled
          options={(['system', 'light', 'dark'] as ThemePreference[]).map((v) => ({ value: v, label: t(`set.theme.${v}`), icon: v === 'system' ? 'contrast-outline' : v === 'light' ? 'sunny-outline' : 'moon-outline' }))}
          value={prefs.theme}
          onChange={(theme) => void updateProfile({ preferences: { ...prefs, theme } })}
        />
      </Card>

      <SectionHeader title={t('set.title').toUpperCase()} />
      <Card padded={false} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
        {row('fp.edit.title', 'fp.edit.sub', 'person-circle', colors.primary, '/settings/financial')}
        {row('set.security', 'set.sub.security', 'lock-closed', colors.primary, '/settings/security')}
        {row('set.notifications', 'set.sub.notifications', 'notifications', colors.secondary, '/settings/notifications')}
        {row('set.recurring', 'set.sub.recurring', 'repeat', colors.info, '/recurring')}
        {row('set.categories', 'set.sub.categories', 'pricetags', colors.primary, '/categories')}
        {row('set.data', 'set.sub.data', 'server', colors.info, '/settings/data')}
      </Card>

      <SectionHeader title={t('set.legal').toUpperCase()} />
      <Card padded={false} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
        <Row title={t('set.terms')} right={<Icon name="open-outline" size={18} color={colors.textMuted} />} onPress={() => router.push('/legal/terms')} />
        <Row title={t('set.privacy')} right={<Icon name="open-outline" size={18} color={colors.textMuted} />} onPress={() => router.push('/legal/privacy')} />
        <Row title={t('set.appVersion')} right={<Badge tone="success" label={env.buildLabel.split(' · ')[0]} />} subtitle={env.buildLabel} />
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 14, marginTop: 18 }}>
        <Icon name="heart-outline" size={20} color={colors.primary} />
        <Text variant="small" tone="muted" style={{ flex: 1 }}>
          {t('set.footer')}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth.signout')}
        onPress={confirmSignOut}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: radius.lg, backgroundColor: colors.dangerBg, marginTop: 18, opacity: pressed ? 0.85 : 1 })}
      >
        <Icon name="log-out-outline" size={20} color={colors.danger} />
        <Text variant="bodyStrong" tone="danger">
          {t('auth.signout')}
        </Text>
      </Pressable>
    </Screen>
  );
}
