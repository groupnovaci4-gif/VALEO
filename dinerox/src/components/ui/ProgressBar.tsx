import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';

export type ProgressTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

/** Barre de progression. `value` en %, peut dépasser 100 (affichée pleine). */
export function ProgressBar({ value, tone = 'primary', height = 8, color, label }: { value: number; tone?: ProgressTone; height?: number; color?: string; label?: string }) {
  const { colors } = useTheme();
  const map: Record<ProgressTone, string> = {
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
    ai: colors.ai,
  };
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height, backgroundColor: colors.track, borderRadius: 99, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color ?? map[tone], borderRadius: 99 }} />
    </View>
  );
}

/** Couleur sémantique d'un niveau d'enveloppe. */
export function levelTone(level: 'ok' | 'warn70' | 'warn90' | 'full' | 'over'): ProgressTone {
  if (level === 'over') return 'danger';
  if (level === 'warn90' || level === 'full') return 'warning';
  if (level === 'warn70') return 'info';
  return 'success';
}
