import React from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, MIN_TOUCH } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

/**
 * `tertiary` / `destructive` : variantes v2. Écrans non migrés : `ghost`, `danger`, `success`.
 * En v2, `ghost` = `tertiary`, `danger` = `destructive` et `success` = `primary`.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'tertiary' | 'destructive';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button(props: ButtonProps) {
  const { v2 } = useTheme();
  return v2 ? <ButtonV2 {...props} /> : <LegacyButton {...props} />;
}

function haptic() {
  // Un retour haptique indisponible (module natif absent, web) n'empêche jamais l'action.
  try {
    void Haptics.selectionAsync().catch(() => undefined);
  } catch {
    /* sans vibration */
  }
}

/**
 * Bouton v2 (docs/design-system.md §8.1) : 48 dp dans tous les cas (`small` ne réduit
 * que la marge horizontale), rayon 12, icône + texte jamais tronqué, pressé = couleur
 * (pas d'opacité ni d'échelle), désactivé = couleurs dédiées lisibles.
 */
function ButtonV2({ label, onPress, variant = 'primary', icon, loading, disabled, full, small, style, accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const kind = variant === 'ghost' ? 'tertiary' : variant === 'danger' ? 'destructive' : variant === 'success' ? 'primary' : variant;
  const inactive = disabled || loading;
  const look = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary },
    secondary: { bg: colors.primaryContainer, pressed: colors.surfaceAlt, fg: colors.onPrimaryContainer },
    tertiary: { bg: 'transparent', pressed: colors.surfaceAlt, fg: colors.primary },
    destructive: { bg: colors.dangerBg, pressed: colors.surfaceAlt, fg: colors.danger },
  }[kind];
  const fg = disabled ? colors.onDisabled : look.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={() => {
        onPress?.();
        haptic();
      }}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH,
          paddingHorizontal: small || kind === 'tertiary' ? 12 : 18,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: disabled ? colors.disabledBg : pressed ? look.pressed : look.bg,
          alignSelf: full ? 'stretch' : 'auto',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={22} color={fg} /> : null}
        <Text variant="label" style={{ color: fg, flexShrink: 1, textAlign: 'center' }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function LegacyButton({ label, onPress, variant = 'primary', icon, loading, disabled, full, small, style, accessibilityHint }: ButtonProps) {
  const { colors, radius, dark, shadow } = useTheme();
  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.primaryLight,
    ghost: 'transparent',
    tertiary: 'transparent',
    danger: colors.danger,
    destructive: colors.danger,
    success: colors.success,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: colors.onPrimary,
    secondary: colors.primary,
    ghost: colors.text,
    tertiary: colors.text,
    danger: colors.onInverse,
    destructive: colors.onInverse,
    success: colors.onInverse,
  };
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={() => {
        // L'action d'abord : le retour haptique ne doit jamais l'empêcher.
        onPress?.();
        haptic();
      }}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : MIN_TOUCH,
          paddingHorizontal: small ? 12 : 18,
          borderRadius: radius.pill,
          backgroundColor: bg[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.primaryBorder,
          ...(variant === 'primary' && dark && !inactive ? shadow.glowGreen : null),
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : 'auto',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator color={fg[variant]} /> : icon ? <Icon name={icon} size={18} color={fg[variant]} /> : null}
        <Text variant={small ? 'small' : 'bodyStrong'} style={{ color: fg[variant] }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Icône seule : réservée à « Retour » et « Fermer » en v2 (zone de 48 dp). */
export function IconButton({ icon, onPress, label, color, size = 22, disabled = false }: { icon: string; onPress: () => void; label: string; color?: string; size?: number; disabled?: boolean }) {
  const { colors, v2 } = useTheme();
  const box = v2 ? MIN_TOUCH : 44;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ width: box, height: box, borderRadius: box / 2, alignItems: 'center', justifyContent: 'center', ...(v2 ? { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' } : { opacity: pressed ? 0.6 : 1 }) })}
    >
      <Icon name={icon} size={size} color={disabled ? colors.textSubtle : (color ?? colors.text)} />
    </Pressable>
  );
}
