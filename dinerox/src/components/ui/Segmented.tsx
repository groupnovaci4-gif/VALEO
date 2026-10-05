import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

/**
 * Sélecteur à segments. `filled` : segment choisi en vert DineroX (réglages),
 * sinon segment blanc sur fond neutre.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  filled,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  filled?: boolean;
}) {
  const { colors, radius } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 4, borderRadius: radius.md, marginBottom: 16 }}>
      {options.map((o) => {
        const sel = o.value === value;
        const fg = sel ? (filled ? colors.onPrimary : colors.text) : colors.textMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: sel }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: o.icon ? 52 : 40,
              paddingHorizontal: 4,
              gap: 2,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: o.icon ? 'column' : 'row',
              borderRadius: radius.sm,
              backgroundColor: sel ? (filled ? colors.primary : colors.surface) : 'transparent',
            }}
          >
            {o.icon ? <Icon name={o.icon} size={18} color={fg} /> : sel && filled ? <Icon name="checkmark" size={16} color={fg} /> : null}
            <Text variant="small" weight={sel ? '700' : '500'} style={{ color: fg, marginLeft: !o.icon && sel && filled ? 4 : 0 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
