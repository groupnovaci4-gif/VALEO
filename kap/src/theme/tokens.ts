/**
 * Design system — jetons centralisés. Aucun écran ne doit définir ses
 * propres couleurs, tailles ou rayons : tout passe par ces jetons.
 * Contrastes vérifiés pour le texte principal (≥ 4,5:1) dans les deux thèmes.
 */
import { brand } from '@/config/brand';

export const palette = {
  ink900: '#0F172A',
  ink800: '#1E293B',
  ink700: '#334155',
  ink600: '#475569',
  ink500: '#64748B',
  ink400: '#94A3B8',
  ink300: '#CBD5E1',
  ink200: '#E2E8F0',
  ink100: '#F1F5F9',
  ink50: '#F8FAFC',
  white: '#FFFFFF',
  green600: '#16A34A',
  green500: '#22C55E',
  green100: '#DCFCE7',
  green900: '#14532D',
  red600: '#DC2626',
  red100: '#FEE2E2',
  red900: '#7F1D1D',
  amber600: '#D97706',
  amber100: '#FEF3C7',
  amber900: '#78350F',
  blue600: '#2563EB',
  blue100: '#DBEAFE',
  blue900: '#1E3A8A',
  violet600: '#7C3AED',
  violet100: '#EDE9FE',
  violet900: '#4C1D95',
};

export interface ColorScheme {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  onPrimary: string;
  hero: string;
  onHero: string;
  heroMuted: string;
  income: string;
  expense: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  ai: string;
  aiBg: string;
  track: string;
  overlay: string;
  tabBar: string;
}

export const lightColors: ColorScheme = {
  background: '#F6F8FB',
  surface: palette.white,
  surfaceAlt: palette.ink100,
  border: '#E8EDF3',
  text: '#152033',
  textMuted: palette.ink600,
  textSubtle: palette.ink500,
  primary: brand.colors.primary,
  onPrimary: palette.white,
  hero: brand.colors.primary,
  onHero: palette.white,
  heroMuted: '#AEB8C8',
  income: palette.green600,
  expense: palette.red600,
  success: palette.green600,
  successBg: palette.green100,
  warning: palette.amber600,
  warningBg: palette.amber100,
  danger: palette.red600,
  dangerBg: palette.red100,
  info: palette.blue600,
  infoBg: palette.blue100,
  ai: palette.violet600,
  aiBg: '#F7F5FF',
  track: '#EDF1F5',
  overlay: 'rgba(15,23,42,0.55)',
  tabBar: palette.white,
};

export const darkColors: ColorScheme = {
  background: '#0B1120',
  surface: '#131C2E',
  surfaceAlt: '#1B2639',
  border: '#24324A',
  text: '#E8EDF5',
  textMuted: '#A7B3C6',
  textSubtle: '#8391A7',
  primary: '#E8EDF5',
  onPrimary: '#0B1120',
  hero: '#172036',
  onHero: palette.white,
  heroMuted: '#9AA6BA',
  income: palette.green500,
  expense: '#F87171',
  success: palette.green500,
  successBg: '#0F2E1C',
  warning: '#FBBF24',
  warningBg: '#3A2A0A',
  danger: '#F87171',
  dangerBg: '#3B1212',
  info: '#60A5FA',
  infoBg: '#10213F',
  ai: '#A78BFA',
  aiBg: '#1E1838',
  track: '#24324A',
  overlay: 'rgba(0,0,0,0.65)',
  tabBar: '#131C2E',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** Tailles généreuses : public non expert, écrans d'entrée de gamme. */
export const typography = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '800' as const },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.2 },
};

export type TypographyVariant = keyof typeof typography;

/** Cible tactile minimale (WCAG / Material : 44–48 dp). */
export const MIN_TOUCH = 48;

export const shadow = {
  card: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  fab: { shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
};

/** Palette pour comptes/enveloppes/catégories créés par l'utilisateur. */
export const pickableColors = ['#16A34A', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308', '#14B8A6', '#334155', '#EF4444'];
