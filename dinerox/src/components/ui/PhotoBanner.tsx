import React from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { PhotoSlot } from '@/config/photos';
import { PHOTO_SOURCES } from './photoSources';

/**
 * Photo d'ambiance d'un écran (une seule par écran : registre `config/photos.ts`).
 * Image locale, pleine largeur, format 16:9, coins arrondis du thème. DÉCORATIVE :
 * ignorée par le lecteur d'écran, aucun texte ni montant posé dessus. Même photo en
 * mode sombre, sans effet qui varie (styles fixes, règle 13).
 */
export function PhotoBanner({ photo, style }: { photo: PhotoSlot; style?: StyleProp<ViewStyle> }) {
  const { radius } = useTheme();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden' }, style]}
    >
      <Image source={PHOTO_SOURCES[photo]} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
