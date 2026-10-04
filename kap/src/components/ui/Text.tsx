import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme, type TypographyVariant } from '@/theme';

export type TextTone = 'default' | 'muted' | 'subtle' | 'income' | 'expense' | 'success' | 'warning' | 'danger' | 'info' | 'ai' | 'onHero' | 'heroMuted' | 'onPrimary';

export interface KTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

/** Texte typé du design system. Respecte la taille de police système (accessibilité). */
export function Text({ variant = 'body', tone = 'default', align, weight, style, ...rest }: KTextProps) {
  const { colors, typography } = useTheme();
  const color: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    subtle: colors.textSubtle,
    income: colors.income,
    expense: colors.expense,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
    ai: colors.ai,
    onHero: colors.onHero,
    heroMuted: colors.heroMuted,
    onPrimary: colors.onPrimary,
  };
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color: color[tone] }, align ? { textAlign: align } : null, weight ? { fontWeight: weight } : null, style]}
      {...rest}
    />
  );
}
