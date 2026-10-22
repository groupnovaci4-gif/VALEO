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
import { finalPalette } from '@/theme/finalPalette';
import { useToReadCount } from '@/features/notifications/useToRead';

/** Initiales pour l'avatar (« Awa Koffi » → « AK »). */
export function initials(first?: string, last?: string): string {
  return `${(first ?? '').trim().charAt(0)}${(last ?? '').trim().charAt(0)}`.toUpperCase();
}

/**
 * En-tête de marque des écrans principaux : logo D, « DINEROX » et le nom de
 * l'écran, cloche des notifications et avatar (accès au profil / réglages).
 */
export function AppHeader({ section }: { section: string }) {
  const { colors, v2, dark } = useTheme();
  const { t } = useI18n();
  const { profile } = useApp();
  const toRead = useToReadCount();
  const { fontScale, width } = useWindowDimensions();
  const ini = initials(profile?.firstName, profile?.lastName);
  if (v2) {
    // v2 (accueil) : la marque, la cloche SEULE (décision du fondateur, 2026-10-21 : le mot
    // « Notifications » n'est plus écrit, il reste le libellé lu par le lecteur d'écran) et
    // l'avatar (réglages). Écran étroit (< 360 dp) : le logo seul porte la marque (il a le nom
    // pour libellé).
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
    // Refonte finale A2 / E : pastille du nombre de messages « À lire » sur la cloche.
    const notifications = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toRead ? `${t('notif.title')}, ${t('toRead.title', { count: toRead })}` : t('notif.title')}
        onPress={() => router.push('/notifications')}
        style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
      >
        <Icon name="notifications-outline" size={24} color={colors.text} />
        {toRead ? (
          <View style={{ position: 'absolute', top: 9, right: 10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: finalPalette(dark).alertFg, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" weight="700" maxFontSizeMultiplier={1} style={{ fontSize: 10, lineHeight: 16, color: '#FFFFFF' }}>
              {toRead > 9 ? '9+' : String(toRead)}
            </Text>
          </View>
        ) : null}
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
          {notifications}
          {avatar}
        </View>
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
