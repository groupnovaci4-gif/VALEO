import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme, type TypographyVariant } from '@/theme';
import { fontFor } from '@/theme/fonts';

export type TextTone = 'default' | 'muted' | 'subtle' | 'income' | 'expense' | 'success' | 'warning' | 'danger' | 'info' | 'ai' | 'onHero' | 'heroMuted' | 'onPrimary' | 'primary' | 'accent';

export interface KTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  /** Chiffres alignés : JetBrains Mono (écrans non migrés) ou Inter `tabular-nums` (v2). */
  numeric?: boolean;
}

/** Plafond d'agrandissement du texte système des écrans non migrés. */
const LEGACY_CAP = 1.3;

/** Couleur d'un ton de texte (partagée avec les textes animés des pavés). */
export function toneColor(colors: ReturnType<typeof useTheme>['colors'], tone: TextTone): string {
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
    primary: colors.primary,
    accent: colors.accent,
  };
  return color[tone];
}

/** Style typographique d'une variante (sans la couleur) et plafond d'agrandissement. */
export function textStyle(theme: Pick<ReturnType<typeof useTheme>, 'typography' | 'v2'>, variant: TypographyVariant, weight?: TextStyle['fontWeight'], numeric?: boolean): { style: TextStyle; cap: number } {
  const { typography, v2 } = theme;
  const v = typography[variant];
  // v2 : plus de police monospace ; les chiffres alignés viennent d'Inter / Jakarta (`tnum`).
  const tabular = v2 && (numeric || v.tabular);
  const role = numeric && !v2 ? 'numeric' : v.role === 'numeric' && v2 ? 'body' : v.role;
  return {
    // Chaque graisse est une famille de police distincte (pas de gras synthétique).
    style: { fontSize: v.fontSize, lineHeight: v.lineHeight, letterSpacing: v.letterSpacing, fontFamily: fontFor(role, weight ?? v.fontWeight), ...(tabular ? { fontVariant: ['tabular-nums'] } : null) },
    cap: v2 ? (v.cap ?? 1.6) : LEGACY_CAP,
  };
}

/**
 * Texte typé du design system. Respecte la taille de police système (accessibilité) :
 * en v2, jusqu'au plafond du rôle (160 % pour le texte courant, moins pour les très
 * grands montants, voir docs/design-system.md §2.3).
 */
export function Text({ variant = 'body', tone = 'default', align, weight, numeric, style, ...rest }: KTextProps) {
  const theme = useTheme();
  const base = textStyle(theme, variant, weight, numeric);
  return <RNText maxFontSizeMultiplier={base.cap} style={[base.style, { color: toneColor(theme.colors, tone) }, align ? { textAlign: align } : null, style]} {...rest} />;
}
