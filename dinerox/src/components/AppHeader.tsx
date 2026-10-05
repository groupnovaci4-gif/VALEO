import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
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
  const { colors } = useTheme();
  const { t } = useI18n();
  const { profile } = useApp();
  const ini = initials(profile?.firstName, profile?.lastName);
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
