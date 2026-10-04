import React from 'react';
import { View } from 'react-native';
import { brand } from '@/config/brand';
import { Text } from '@/components/ui';

/** Logo typographique centralisé (remplaçable par une image de marque). */
export function Logo({ size = 56, inverted }: { size?: number; inverted?: boolean }) {
  return (
    <View
      accessibilityLabel={brand.name}
      style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: inverted ? '#FFFFFF' : brand.colors.primary, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: size * 0.55, fontWeight: '800', color: inverted ? brand.colors.primary : '#FFFFFF' }}>{brand.logoLetter}</Text>
    </View>
  );
}
