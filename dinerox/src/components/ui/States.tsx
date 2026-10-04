import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { useI18n } from '@/i18n';

/** État vide : jamais d'écran blanc. Emoji + titre + explication + action. */
export function EmptyState({ emoji, title, body, action, onAction }: { emoji?: string; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20, gap: 10 }}>
      {emoji ? <Text style={{ fontSize: 44 }}>{emoji}</Text> : null}
      <Text variant="h3" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button label={action} onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 12 }}>
      <Icon name="cloud-offline-outline" size={40} color={colors.textSubtle} />
      <Text tone="muted" align="center">
        {message ?? t('error.generic')}
      </Text>
      {onRetry ? <Button variant="secondary" label={t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }} accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'ai';

export function Banner({ tone = 'info', icon, text, action, onAction }: { tone?: BannerTone; icon?: string; text: string; action?: string; onAction?: () => void }) {
  const { colors, radius } = useTheme();
  const map: Record<BannerTone, [string, string]> = {
    info: [colors.infoBg, colors.info],
    warning: [colors.warningBg, colors.warning],
    danger: [colors.dangerBg, colors.danger],
    success: [colors.successBg, colors.success],
    ai: [colors.aiBg, colors.ai],
  };
  const [bg, fg] = map[tone];
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: bg, padding: 12, borderRadius: radius.md, marginBottom: 12 }}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text variant="small" style={{ flex: 1, color: fg }}>
        {text}
      </Text>
      {action && onAction ? <Button small variant="ghost" label={action} onPress={onAction} /> : null}
    </View>
  );
}
