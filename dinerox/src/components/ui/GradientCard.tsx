import React, { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Carte principale en dégradé vert (solde, objectifs, patrimoine).
 * Le dégradé est dessiné en SVG (aucune dépendance native supplémentaire).
 */
export function GradientCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius, shadow, v2 } = useTheme();
  const id = `g${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const [from, to] = v2 ? [colors.heroFrom, colors.heroTo] : colors.heroGradient;
  // v2 : ni halo coloré ni ombre (une seule carte héros par écran, légère pour les petits téléphones).
  return (
    <View style={[{ borderRadius: radius.xl, overflow: 'hidden', padding: 20, marginBottom: 14, backgroundColor: to, ...(v2 ? null : shadow.glowGreen) }, style]}>
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
