import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 4, borderRadius: radius.md, marginBottom: 16 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: sel ? colors.surface : 'transparent' }}
          >
            <Text variant="small" weight={sel ? '700' : '500'} tone={sel ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
