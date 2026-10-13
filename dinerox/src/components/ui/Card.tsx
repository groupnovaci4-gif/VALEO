import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

/** Message d'état d'une carte v2 : fond teinté + filet gauche + (icône et texte fournis par l'écran). */
export type CardTone = 'warning' | 'danger' | 'success' | 'info';

export function Card({
  children,
  style,
  onPress,
  padded = true,
  accessibilityLabel,
  accessibilityHint,
  tone,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** v2 : carte de message (attention, erreur, succès, info). */
  tone?: CardTone;
}) {
  const { colors, radius, shadow, dark, v2 } = useTheme();
  const toneBg = tone ? { warning: colors.warningBg, danger: colors.dangerBg, success: colors.successBg, info: colors.infoBg }[tone] : null;
  const toneFg = tone ? { warning: colors.warning, danger: colors.danger, success: colors.success, info: colors.info }[tone] : null;
  const base: ViewStyle = v2
    ? {
        backgroundColor: toneBg ?? colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: toneBg ? 'transparent' : colors.border,
        ...(toneFg ? { borderLeftWidth: 4, borderLeftColor: toneFg } : null),
        padding: padded ? 16 : 0,
        ...(dark || tone ? {} : shadow.card),
      }
    : {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        // Filet fin (charte) : blanc 8 % en sombre
        borderColor: colors.border,
        padding: padded ? 16 : 0,
        ...(dark ? {} : shadow.card),
      };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        // v2 : retour de pression par la couleur (visible au soleil), pas par l'opacité.
        style={({ pressed }) => [base, v2 ? (pressed ? { backgroundColor: toneBg ? colors.surfaceAlt : colors.surfaceAlt } : null) : { opacity: pressed ? 0.9 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
