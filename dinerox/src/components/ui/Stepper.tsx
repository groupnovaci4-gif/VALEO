import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { IconButton } from './Button';

/** Petit compteur (enfants, personnes à charge…) : − valeur +. */
export function Stepper({ label, value, onChange, min = 0, max = 30 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6, marginBottom: 8 }}>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }}>
        <IconButton icon="remove" label={`${label} −`} onPress={() => onChange(Math.max(min, value - 1))} />
        <Text variant="h3" style={{ minWidth: 28, textAlign: 'center' }} accessibilityLabel={`${label} : ${value}`}>
          {value}
        </Text>
        <IconButton icon="add" label={`${label} +`} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    </View>
  );
}
