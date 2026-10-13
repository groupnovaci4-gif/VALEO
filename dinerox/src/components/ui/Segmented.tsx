import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme, MIN_TOUCH } from '@/theme';
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
  const { colors, radius, v2 } = useTheme();
  if (v2) {
    // v2 (docs/design-system.md §8.8) : 48 dp, icône et libellé sur une ligne, coche sur le
    // segment choisi (pas la couleur seule), libellé sur plusieurs lignes plutôt que tronqué.
    return (
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 4, gap: 4, borderRadius: radius.md, marginBottom: 16 }}>
        {options.map((o) => {
          const sel = o.value === value;
          const fg = sel ? (filled ? colors.onPrimary : colors.text) : colors.textMuted;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: sel }}
              aria-selected={sel}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: MIN_TOUCH,
                paddingHorizontal: 8,
                paddingVertical: 6,
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                borderRadius: radius.sm,
                backgroundColor: sel ? (filled ? colors.primary : colors.surface) : pressed ? colors.border : 'transparent',
              })}
            >
              {o.icon ? <Icon name={o.icon} size={20} color={fg} /> : null}
              <Text variant="label" weight={sel ? '700' : '600'} style={{ color: fg, flexShrink: 1, textAlign: 'center' }}>
                {o.label}
              </Text>
              {sel ? <Icon name="checkmark" size={18} color={fg} /> : null}
            </Pressable>
          );
        })}
      </View>
    );
  }
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
            aria-selected={sel}
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
