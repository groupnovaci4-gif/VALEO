import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme';
import { Text, Icon } from '@/components/ui';

/** Hauteur d'écran sous laquelle les touches sont réduites (elles restent bien au-dessus de 48 dp). */
const COMPACT_HEIGHT = 700;

/** Pavé numérique accessible (grandes touches) pour le code PIN. */
export function PinPad({ value, length = 4, onChange, onBiometric, biometricLabel }: { value: string; length?: number; onChange: (v: string) => void; onBiometric?: () => void; biometricLabel?: string }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const key = compact ? 64 : 76;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
  return (
    <View style={{ alignItems: 'center', gap: compact ? 20 : 28 }}>
      <View style={{ flexDirection: 'row', gap: 16 }} accessibilityLabel={`${value.length}/${length}`}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.text, backgroundColor: i < value.length ? colors.text : 'transparent' }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 3 * key + 42, justifyContent: 'space-between', rowGap: compact ? 10 : 14 }}>
        {keys.map((k) => {
          if (k === 'bio' && !onBiometric) return <View key={k} style={{ width: key, height: key }} />;
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
              style={({ pressed }) => ({ width: key, height: key, borderRadius: key / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: k === 'del' || k === 'bio' ? 'transparent' : pressed ? colors.border : colors.surfaceAlt })}
            >
              {k === 'del' ? <Icon name="backspace-outline" size={26} color={colors.text} /> : k === 'bio' ? <Icon name="finger-print" size={30} color={colors.text} /> : <Text variant="h1">{k}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
