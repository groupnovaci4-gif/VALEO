import React from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, MIN_TOUCH } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

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

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, full, small, style, accessibilityHint }: ButtonProps) {
  const { colors, radius, dark, shadow } = useTheme();
  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.primaryLight,
    ghost: 'transparent',
    danger: colors.danger,
    success: colors.success,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: colors.onPrimary,
    secondary: colors.primary,
    ghost: colors.text,
    danger: colors.onInverse,
    success: colors.onInverse,
  };
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        // L'action d'abord : un retour haptique indisponible (module natif absent,
        // web) ne doit jamais empêcher le bouton de fonctionner.
        onPress?.();
        try {
          void Haptics.selectionAsync().catch(() => undefined);
        } catch {
          /* sans vibration */
        }
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

export function IconButton({ icon, onPress, label, color, size = 22 }: { icon: string; onPress: () => void; label: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}
