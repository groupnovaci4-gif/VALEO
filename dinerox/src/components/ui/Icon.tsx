import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from './Text';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  return <Ionicons name={(name in Ionicons.glyphMap ? name : 'ellipse') as IconName} size={size} color={color} />;
}

/** Pastille ronde colorée contenant une icône Ionicons ou un emoji. */
export function IconCircle({ icon, color, size = 40, emoji }: { icon?: string; color: string; size?: number; emoji?: string }) {
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
