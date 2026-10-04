import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text, Icon } from '@/components/ui';

/** Pavé numérique accessible (grandes touches) pour le code PIN. */
export function PinPad({ value, length = 4, onChange, onBiometric, biometricLabel }: { value: string; length?: number; onChange: (v: string) => void; onBiometric?: () => void; biometricLabel?: string }) {
  const { colors } = useTheme();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
  return (
    <View style={{ alignItems: 'center', gap: 28 }}>
      <View style={{ flexDirection: 'row', gap: 16 }} accessibilityLabel={`${value.length}/${length}`}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.text, backgroundColor: i < value.length ? colors.text : 'transparent' }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 270, justifyContent: 'space-between', rowGap: 14 }}>
        {keys.map((k) => {
          if (k === 'bio' && !onBiometric) return <View key={k} style={{ width: 76, height: 76 }} />;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? '⌫' : k === 'bio' ? biometricLabel : k}
              onPress={() => {
                if (k === 'del') onChange(value.slice(0, -1));
                else if (k === 'bio') onBiometric?.();
                else if (value.length < length) onChange(value + k);
              }}
              style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: k === 'del' || k === 'bio' ? 'transparent' : pressed ? colors.border : colors.surfaceAlt })}
            >
              {k === 'del' ? <Icon name="backspace-outline" size={26} color={colors.text} /> : k === 'bio' ? <Icon name="finger-print" size={30} color={colors.text} /> : <Text variant="h1">{k}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
