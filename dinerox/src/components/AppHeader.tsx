import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BIG_TEXT, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { brand } from '@/config/brand';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Logo } from './Logo';

/** Initiales pour l'avatar (« Awa Koffi » → « AK »). */
export function initials(first?: string, last?: string): string {
  return `${(first ?? '').trim().charAt(0)}${(last ?? '').trim().charAt(0)}`.toUpperCase();
}

/**
 * En-tête de marque des écrans principaux : logo D, « DINEROX » et le nom de
 * l'écran, cloche des notifications et avatar (accès au profil / réglages).
 */
export function AppHeader({ section }: { section: string }) {
  const { colors, v2 } = useTheme();
  const { t } = useI18n();
  const { profile } = useApp();
  const { fontScale, width } = useWindowDimensions();
  const ini = initials(profile?.firstName, profile?.lastName);
  if (v2) {
    // v2 (accueil) : la marque, puis « Notifications » ÉCRIT à côté de la cloche et
    // l'avatar (réglages). Texte agrandi : les actions passent sous la marque plutôt
    // que de perdre leur texte. Écran étroit (< 360 dp) : le logo seul porte la marque
    // (il a le nom pour libellé), pour ne jamais tronquer « Notifications ».
    const big = fontScale >= BIG_TEXT;
    const showName = big || width >= 360;
    const avatar = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('set.title')}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: pressed ? colors.primaryPressed : colors.primary, alignItems: 'center', justifyContent: 'center' })}
      >
        {ini ? (
          <Text variant="label" weight="700" tone="onPrimary" maxFontSizeMultiplier={1.2}>
            {ini}
          </Text>
        ) : (
          <Icon name="person" size={22} color={colors.onPrimary} />
        )}
      </Pressable>
    );
    const notifications = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notif.title')}
        onPress={() => router.push('/notifications')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent', alignSelf: big ? 'flex-start' : 'auto' })}
      >
        <Icon name="notifications-outline" size={24} color={colors.text} />
        <Text variant="label">{t('notif.title')}</Text>
      </Pressable>
    );
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
          <Logo size={40} />
          {showName ? (
            <Text variant="titleS" tone="primary" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
              {brand.name}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {big ? null : notifications}
          {avatar}
        </View>
        {big ? notifications : null}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, minHeight: 56 }}>
      <Logo size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="h3" weight="800" style={{ color: colors.primary, letterSpacing: 0.2 }} numberOfLines={1}>
          {brand.name.toUpperCase()}
        </Text>
        <Text variant="overline" tone="muted" numberOfLines={1} style={{ fontWeight: '600' }}>
          {section.toUpperCase()}
        </Text>
      </View>
      <IconButton icon="notifications-outline" label={t('notif.title')} onPress={() => router.push('/notifications')} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('set.title')}
        onPress={() => router.push('/settings')}
        hitSlop={6}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
      >
        {ini ? (
          <Text variant="small" weight="700" style={{ color: colors.onPrimary }}>
            {ini}
          </Text>
        ) : (
          <Icon name="person" size={20} color={colors.onPrimary} />
        )}
      </Pressable>
    </View>
  );
}
