import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, darkColorsV2, lightColors, lightColorsV2, radius, shadow, spacing, typography, typographyV2, type ColorSchemeV2, type TypeStyle, type TypographyVariant } from './tokens';
import type { ThemePreference } from '@/core/types';

export interface Theme {
  dark: boolean;
  /** Écran migré vers le design system v2 (docs/design-system.md) : voir `DesignV2`. */
  v2: boolean;
  colors: ColorSchemeV2;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: Record<TypographyVariant, TypeStyle>;
  shadow: typeof shadow;
}

/**
 * Hors v2, les rôles ajoutés par la v2 prennent leur valeur v2 : ils ne servent
 * qu'aux écrans migrés, mais restent définis partout (aucun `undefined`).
 */
const legacy = (dark: boolean): ColorSchemeV2 => ({ ...(dark ? darkColorsV2 : lightColorsV2), ...(dark ? darkColors : lightColors) });

const make = (dark: boolean, v2 = false): Theme => ({
  dark,
  v2,
  colors: v2 ? (dark ? darkColorsV2 : lightColorsV2) : legacy(dark),
  spacing,
  radius,
  // Hors v2 : anciens styles (les noms v2 existent aussi, pour qu'aucun texte ne soit sans style).
  typography: v2 ? typographyV2 : { ...typographyV2, ...typography },
  shadow,
});

const ThemeContext = createContext<Theme>(make(false));

export function ThemeProvider({ preference, children }: { preference: ThemePreference; children: React.ReactNode }) {
  const system = useColorScheme();
  const dark = preference === 'dark' || (preference === 'system' && system === 'dark');
  const theme = useMemo(() => make(dark), [dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Écran migré vers le design system v2 : mêmes thème clair/sombre que l'utilisateur
 * a choisis, avec la palette, la typographie et les composants v2. Les écrans non
 * migrés sont inchangés. Supprimé quand tous les écrans seront passés en v2.
 */
export function DesignV2({ children }: { children: React.ReactNode }) {
  const { dark } = useContext(ThemeContext);
  const theme = useMemo(() => make(dark, true), [dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export * from './tokens';
export { contrastRatio, glyphOn } from './contrast';
