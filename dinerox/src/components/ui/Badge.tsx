import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors, v2 } = useTheme();
  const map: Record<BadgeTone, [string, string]> = {
    neutral: [colors.surfaceAlt, colors.textMuted],
    success: [colors.successBg, colors.success],
    warning: [colors.warningBg, colors.warning],
    danger: [colors.dangerBg, colors.danger],
    info: [colors.infoBg, colors.info],
    // v2 : l'or (réussite, IA, formule) sur son conteneur dédié.
    ai: v2 ? [colors.accentContainer, colors.onAccentContainer] : [colors.aiBg, colors.ai],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: v2 ? 4 : 3, borderRadius: v2 ? 8 : 99, alignSelf: 'flex-start' }}>
      <Text variant="caption" weight={v2 ? '600' : undefined} style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
