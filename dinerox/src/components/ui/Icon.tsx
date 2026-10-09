import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from './Text';
import { glyphOn, useTheme } from '@/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  return <Ionicons name={(name in Ionicons.glyphMap ? name : 'ellipse') as IconName} size={size} color={color} />;
}

/**
 * Pastille colorée contenant une icône Ionicons ou un emoji.
 * v2 : une icône est posée sur la couleur PLEINE, glyphe blanc ou encre selon le meilleur
 * contraste (≥ 4,2:1 sur toute la palette) ; un emoji (catégorie, objectif) reste sur un
 * fond teinté. Pastille ronde.
 */
export function IconCircle({ icon, color, size = 40, emoji }: { icon?: string; color: string; size?: number; emoji?: string }) {
  const { v2 } = useTheme();
  if (v2) {
    const solid = !emoji && /^#[0-9A-Fa-f]{6}$/.test(color);
    return (
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: solid ? color : color + '29', alignItems: 'center', justifyContent: 'center' }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {emoji ? <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }} maxFontSizeMultiplier={1}>{emoji}</Text> : <Icon name={icon ?? 'ellipse'} size={size * 0.5} color={solid ? glyphOn(color) : color} />}
      </View>
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {emoji ? <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text> : <Icon name={icon ?? 'ellipse'} size={size * 0.5} color={color} />}
    </View>
  );
}
