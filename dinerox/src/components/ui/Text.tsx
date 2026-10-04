import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme, type TypographyVariant } from '@/theme';
import { fontFor } from '@/theme/fonts';

export type TextTone = 'default' | 'muted' | 'subtle' | 'income' | 'expense' | 'success' | 'warning' | 'danger' | 'info' | 'ai' | 'onHero' | 'heroMuted' | 'onPrimary';

export interface KTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  /** Chiffres alignés (JetBrains Mono) : montants dans les listes, pourcentages. */
  numeric?: boolean;
}

/** Texte typé du design system. Respecte la taille de police système (accessibilité). */
export function Text({ variant = 'body', tone = 'default', align, weight, numeric, style, ...rest }: KTextProps) {
  const { colors, typography } = useTheme();
  const v = typography[variant];
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
      style={[
        { fontSize: v.fontSize, lineHeight: v.lineHeight, letterSpacing: 'letterSpacing' in v ? v.letterSpacing : undefined },
        // Chaque graisse est une famille de police distincte (pas de gras synthétique).
        { fontFamily: fontFor(numeric ? 'numeric' : v.role, weight ?? v.fontWeight), color: color[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
