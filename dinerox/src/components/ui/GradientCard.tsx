import React, { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { radiusV2, shadowB, useTheme } from '@/theme';

/** Motif discret de la carte (b) : losanges au trait fin (inspirés des tissages), dans un coin. */
const PATTERN = Array.from({ length: 25 }, (_, i) => {
  const x = (i % 5) * 32 + 16;
  const y = Math.floor(i / 5) * 32;
  return `M${x} ${y} l16 16 -16 16 -16 -16z`;
}).join(' ');

/**
 * Carte principale (reste par jour, objectifs, patrimoine).
 * v2 — design-pro, carte (b) : vert profond UNI (aucun dégradé), fin filet clair de 1 dp, motif
 * de losanges à 10 % dans le coin, ombre de 1 dp en clair seulement.
 * Ancien style : dégradé vert dessiné en SVG.
 */
export function GradientCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius, shadow, v2, dark } = useTheme();
  const id = `g${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  if (v2) {
    return (
      <View
        style={[
          { borderRadius: radiusV2.hero, padding: 20, marginBottom: 14, backgroundColor: colors.heroFrom, borderWidth: 1, borderColor: colors.heroLine, ...(dark ? null : shadowB) },
          style,
        ]}
      >
        {/* Motif décoratif : dans son propre calque rogné, la carte elle-même ne rogne rien. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: 118, height: 118, borderTopRightRadius: radiusV2.hero - 1, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={124} height={124} viewBox="0 0 150 150" style={{ position: 'absolute', top: -6, right: -6 }}>
            <Path d={PATTERN} fill="none" stroke={colors.heroPattern} strokeWidth={1.2} />
          </Svg>
        </View>
        {children}
      </View>
    );
  }
  const [from, to] = colors.heroGradient;
  return (
    <View style={[{ borderRadius: radius.xl, overflow: 'hidden', padding: 20, marginBottom: 14, backgroundColor: to, ...shadow.glowGreen }, style]}>
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
