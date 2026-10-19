/**
 * Pavé (« Effet vert », validé par le fondateur) et grille de pavés.
 *
 * Pavé blanc, coins arrondis, bordure fine, ombre légère. Tant que le doigt est posé, il
 * passe en FONDU (240 ms) à la couleur primaire du thème, texte et icônes en `onPrimary`
 * (blanc en clair), puis revient au blanc au relâchement. Seules des COULEURS sont animées :
 * ni opacité ni transform sur le conteneur (règle 13). Un pavé sans `onPress` reste blanc
 * (information seule, pas un bouton).
 *
 * Grille : deux colonnes ; une seule sous 340 px de large ou avec un texte agrandi
 * (`tileColumns`). Les pavés d'une rangée ont la même hauteur.
 *
 * Dans un pavé, `TileText` et `TileIcon` suivent le fondu. Jamais de bouton dans un pavé :
 * un bouton propre à l'élément (« Écouter », « Ajouter de l'argent ») se place À CÔTÉ, dans
 * la cellule de la grille (`TileCell`).
 */
import React, { createContext, useContext, useState } from 'react';
import { Animated, Pressable, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type TypographyVariant } from '@/theme';
import { textStyle, toneColor, type TextTone } from './Text';
import { TILE_FADE_MS, TILE_GAP, TILE_RADIUS, tileColors, tileColumns, tileRows } from './tileStyle';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/** Avancement du fondu du pavé englobant (0 = blanc, 1 = vert) ; null hors d'un pavé cliquable. */
const TileFade = createContext<Animated.Value | null>(null);

export function Tile({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, shadow, dark } = useTheme();
  const c = tileColors(colors);
  const [fade] = useState(() => new Animated.Value(0));
  // Structure fixe : mêmes propriétés au repos et au toucher, seules les couleurs changent.
  const box: ViewStyle = { flexGrow: 1, borderRadius: TILE_RADIUS, borderWidth: 1, padding: 14, minHeight: 64, gap: 6, ...(dark ? {} : shadow.card) };
  if (!onPress) {
    return (
      <View testID={testID} style={[box, { backgroundColor: c.rest.background, borderColor: c.rest.border }, style]}>
        {children}
      </View>
    );
  }
  const to = (value: number) => Animated.timing(fade, { toValue: value, duration: TILE_FADE_MS, useNativeDriver: false }).start();
  return (
    <TileFade.Provider value={fade}>
      <AnimatedPressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onPressIn={() => to(1)}
        onPressOut={() => to(0)}
        style={[
          box,
          {
            backgroundColor: fade.interpolate({ inputRange: [0, 1], outputRange: [c.rest.background, c.pressed.background] }),
            borderColor: fade.interpolate({ inputRange: [0, 1], outputRange: [c.rest.border, c.pressed.border] }),
          },
          style as never,
        ]}
      >
        {children}
      </AnimatedPressable>
    </TileFade.Provider>
  );
}

/** Couleur qui suit le fondu du pavé : `base` au repos, `onPrimary` au toucher. */
function useTileColor(base: string): string | Animated.AnimatedInterpolation<string> {
  const fade = useContext(TileFade);
  const { colors } = useTheme();
  return fade ? fade.interpolate({ inputRange: [0, 1], outputRange: [base, colors.onPrimary] }) : base;
}

/** Texte d'un pavé : mêmes variantes que `Text`, couleur qui passe au blanc au toucher. */
export function TileText({
  variant = 'body',
  tone = 'default',
  weight,
  numeric,
  color,
  style,
  children,
  numberOfLines,
}: {
  variant?: TypographyVariant;
  tone?: TextTone;
  weight?: TextStyle['fontWeight'];
  numeric?: boolean;
  /** Couleur de repos explicite (sinon celle du ton). */
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  const base = textStyle(theme, variant, weight, numeric);
  const animated = useTileColor(color ?? toneColor(theme.colors, tone));
  return (
    <Animated.Text maxFontSizeMultiplier={base.cap} numberOfLines={numberOfLines} style={[base.style, { color: animated as never }, style]}>
      {children}
    </Animated.Text>
  );
}

/** Icône d'un pavé (Ionicons) : couleur qui passe au blanc au toucher. */
export function TileIcon({ name, size = 22, color }: { name: string; size?: number; color: string }) {
  const animated = useTileColor(color);
  const glyph = (name in Ionicons.glyphMap ? name : 'ellipse') as React.ComponentProps<typeof Ionicons>['name'];
  return <AnimatedIonicons name={glyph} size={size} color={animated as never} />;
}

/** Cellule de grille : le pavé, et éventuellement des actions À CÔTÉ (sous le pavé). */
export function TileCell({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, minWidth: 0, gap: 6 }}>{children}</View>;
}

/** Grille de pavés : deux colonnes, une seule sous 340 px ou avec un texte agrandi. */
export function TileGrid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = tileColumns(width, fontScale);
  // `toArray` écarte déjà null, false et undefined (éléments conditionnels).
  const items = React.Children.toArray(children);
  if (!items.length) return null;
  return (
    <View style={[{ gap: TILE_GAP, marginBottom: 12 }, style]}>
      {tileRows(items, columns).map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: TILE_GAP }}>
          {row.map((item, j) => (
            <View key={(item as React.ReactElement).key ?? j} style={{ flex: 1, minWidth: 0 }}>
              {item}
            </View>
          ))}
          {/* Rangée incomplète : une case vide garde la largeur des colonnes. */}
          {row.length < columns ? <View style={{ flex: columns - row.length }} /> : null}
        </View>
      ))}
    </View>
  );
}
