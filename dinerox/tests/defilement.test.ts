/**
 * Défilement bloqué (APK 1.6.0, 8fbb8aa) : un doigt posé sur un pavé au début d'un défilement
 * lance le fondu de couleur (Animated, useNativeDriver: false). L'icône du pavé était un
 * `Animated.createAnimatedComponent(Ionicons)` : à chaque image, Animated appelle
 * `Icon#setNativeProps`, qui appelle `setNativeProps` sur l'icône interne de
 * @expo/vector-icons — une classe React qui ne l'a pas → « undefined is not a function ».
 * En version publiée, React Native détruit alors l'instance React (`handleHostException`) :
 * l'écran reste figé, plus rien ne répond.
 *
 * Règle : on n'anime (côté JS) que des composants NATIFS (View, Text, Pressable…), jamais un
 * composant de bibliothèque ; l'icône d'un pavé est un `Animated.Text` qui porte le glyphe.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
import { tileGlyph } from '../src/components/ui/tileStyle';

const SRC = path.join(__dirname, '..', 'src');
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('défilement : animation des pavés', () => {
  it('aucun composant de bibliothèque animé côté JS (seulement des composants natifs)', () => {
    const native = new Set(['View', 'Text', 'Pressable', 'ScrollView', 'Image', 'TextInput']);
    const offenders = sources(SRC).flatMap((f) =>
      [...fs.readFileSync(f, 'utf8').matchAll(/createAnimatedComponent\((\w+)\)/g)].filter((m) => !native.has(m[1])).map((m) => `${path.relative(SRC, f)} : ${m[1]}`),
    );
    expect(offenders).toEqual([]);
  });

  it('glyphe de l’icône d’un pavé : celui d’Ionicons, « ellipse » pour un nom inconnu', () => {
    const map = glyphMap as Record<string, number>;
    expect(tileGlyph(map, 'home')).toBe(String.fromCodePoint(map.home));
    expect(tileGlyph(map, 'nom-inconnu')).toBe(String.fromCodePoint(map.ellipse));
  });

  it('la police Ionicons est chargée avant le premier écran (le glyphe s’affiche toujours)', () => {
    const layout = fs.readFileSync(path.join(SRC, 'app', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/useFonts\(\{\s*\.\.\.FONT_ASSETS,\s*\.\.\.Ionicons\.font\s*\}\)/);
  });
});
