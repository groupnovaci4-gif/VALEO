/**
 * Carte-LISTE (étape 4, maquette validée, point 5) : enveloppes, objectifs, réserves, moments
 * forts… une ligne par élément, séparées par un filet fin. Les lignes gèrent leur propre marge.
 */
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from './Card';

export function ListCard({ children, radius }: { children: React.ReactNode; radius?: number }) {
  const { colors } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <Card padded={false} style={{ overflow: 'hidden', ...(radius ? { borderRadius: radius } : null) }}>
      {items.map((c, i) => (
        <View key={i} style={i ? { borderTopWidth: 1, borderTopColor: colors.border } : null}>
          {c}
        </View>
      ))}
    </Card>
  );
}
