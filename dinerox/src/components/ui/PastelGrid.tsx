/**
 * Grille d'icônes PASTEL (refonte finale F1 ; ecrans/plus-*.html) : une carte (16 / 8, rayon 20),
 * 4 colonnes (3 si texte agrandi ou écran étroit, A8), 16 dp entre les lignes ; chaque rubrique :
 * carré de 52 dp (rayon 16) au fond doux, icône 24 de la couleur de sa famille, nom 11/14 centré
 * (jamais coupé : il passe à la ligne). Badge « PRO » gardé. Description lue par le lecteur d'écran.
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { shadowB, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { pastelColors, pastelColumns, type CircleFamily } from './circlePalette';

export interface PastelItem {
  key: string;
  family: CircleFamily;
  icon: string;
  label: string;
  badge?: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export function PastelGrid({ items }: { items: PastelItem[] }) {
  const { colors, dark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const columns = pastelColumns(width, fontScale);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 8, flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, ...(dark ? null : shadowB) }}>
      {items.map((i) => {
        const c = pastelColors(i.family, dark);
        return (
          <View key={i.key} style={{ width: `${100 / columns}%`, paddingHorizontal: 1 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={i.accessibilityLabel} onPress={i.onPress} style={({ pressed }) => ({ alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 2, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={i.icon} size={24} color={c.fg} />
                {i.badge ? (
                  <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 5 }}>
                    <Text variant="caption" weight="700" maxFontSizeMultiplier={1} style={{ fontSize: 9, lineHeight: 14, color: colors.surface }}>
                      {i.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" weight="600" align="center" style={{ fontSize: 11, lineHeight: 14 }}>
                {i.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
