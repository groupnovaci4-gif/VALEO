import React from 'react';
import { Image } from 'react-native';
import { brand } from '@/config/brand';

/**
 * Logo DineroX (provisoire) : tuile nuit, D vert, flèche jaune.
 * Pour changer de logo : remplacer assets/logo.png (et les icônes dans assets/).
 */
const source = require('../../assets/logo.png');

export function Logo({ size = 56 }: { size?: number; inverted?: boolean }) {
  return <Image source={source} accessibilityLabel={brand.name} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="contain" />;
}
