import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { useI18n } from '@/i18n';

/**
 * État vide : jamais d'écran blanc. Titre + explication + action.
 * v2 : icône dans une pastille de marque (`icon`) ; les emoji ne sont plus affichés.
 */
export function EmptyState({ emoji, icon, title, body, action, onAction }: { emoji?: string; icon?: string; title: string; body?: string; action?: string; onAction?: () => void }) {
  const { colors, v2 } = useTheme();
  if (v2) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8, gap: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={icon ?? 'file-tray-outline'} size={28} color={colors.primary} />
        </View>
        <Text variant="titleS" align="center">
          {title}
        </Text>
        {body ? (
          <Text tone="muted" align="center">
            {body}
          </Text>
        ) : null}
        {action && onAction ? <Button label={action} onPress={onAction} /> : null}
      </View>
    );
  }
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
  const { colors, v2 } = useTheme();
  if (v2) {
    return (
      <View accessibilityRole="alert" style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8, gap: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="alert-circle-outline" size={28} color={colors.danger} />
        </View>
        <Text align="center">{message ?? t('error.generic')}</Text>
        {onRetry ? <Button variant="secondary" icon="refresh" label={t('common.retry')} onPress={onRetry} /> : null}
      </View>
    );
  }
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
  const { colors, v2 } = useTheme();
  const { t } = useI18n();
  if (v2) {
    // v2 : le texte est visible (pas seulement lu par le lecteur d'écran).
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.primary} size="large" />
        <Text tone="muted">{label ?? t('common.loading')}</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }} accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'ai';

export function Banner({ tone = 'info', icon, text, action, onAction }: { tone?: BannerTone; icon?: string; text: string; action?: string; onAction?: () => void }) {
  const { colors, radius, v2 } = useTheme();
  const map: Record<BannerTone, [string, string]> = {
    info: [colors.infoBg, colors.info],
    warning: [colors.warningBg, colors.warning],
    danger: [colors.dangerBg, colors.danger],
    success: [colors.successBg, colors.success],
    ai: [colors.aiBg, colors.ai],
  };
  const [bg, fg] = map[tone];
  if (v2) {
    // v2 : message dans la page (§8.10) — filet gauche + icône + texte au contraste plein ;
    // « alert » seulement pour une erreur, sinon annonce polie (pas d'interruption).
    const lineColor = tone === 'ai' ? colors.accent : fg;
    return (
      <View
        accessibilityRole={tone === 'danger' ? 'alert' : undefined}
        accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
        style={{ backgroundColor: tone === 'ai' ? colors.warningBg : bg, borderLeftWidth: 4, borderLeftColor: lineColor, borderRadius: 12, paddingVertical: 8, paddingLeft: 12, paddingRight: 4, marginBottom: 12, gap: 4 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4, paddingRight: 8 }}>
          {icon ? <Icon name={icon} size={20} color={lineColor} /> : null}
          <Text variant="small" style={{ flex: 1 }}>
            {text}
          </Text>
        </View>
        {action && onAction ? <Button small variant="tertiary" label={action} onPress={onAction} style={{ alignSelf: 'flex-start', marginLeft: icon ? 18 : -4 }} /> : null}
      </View>
    );
  }
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
