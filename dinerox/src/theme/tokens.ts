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
  /** Graphiques : 2 séries validées (daltonisme, contraste) dans chaque thème. */
  chartIncome: string;
  chartExpense: string;
  grid: string;
}

/**
 * Couleurs DineroX, tirées du logo : D vert (#2AB8A1), flèche jaune
 * (#F8AE16), fond nuit (#0D0D1C). Les teintes des textes sont assombries
 * en mode clair pour garder un contraste lisible (≥ 4,5:1).
 */
export const lightColors: ColorScheme = {
  background: '#F5F6F8',
  surface: palette.white,
  surfaceAlt: '#EEF0F3',
  border: '#E3E6EB',
  text: '#11121F',
  textMuted: '#4B5060',
  textSubtle: '#6B7080',
  primary: brand.colors.night,
  onPrimary: palette.white,
  hero: brand.colors.night,
  onHero: palette.white,
  heroMuted: '#A9ADC0',
  income: '#13806F',
  expense: palette.red600,
  success: '#13806F',
  successBg: '#DDF5F0',
  warning: '#A86A00',
  warningBg: '#FEF3D6',
  danger: palette.red600,
  dangerBg: palette.red100,
  info: '#1F6FB2',
  infoBg: '#E1EEFA',
  ai: '#9A6200',
  aiBg: '#FFF6E0',
  track: '#E9ECF0',
  overlay: 'rgba(13,13,28,0.6)',
  tabBar: palette.white,
  chartIncome: '#1f9e8a',
  chartExpense: '#d08f00',
  grid: '#E3E6EB',
};

export const darkColors: ColorScheme = {
  background: brand.colors.night,
  surface: '#16172A',
  surfaceAlt: '#1F2036',
  border: '#2A2B44',
  text: '#ECEDF5',
  textMuted: '#B1B3C6',
  textSubtle: '#8D90A6',
  primary: brand.colors.green,
  onPrimary: brand.colors.night,
  hero: '#14152A',
  onHero: palette.white,
  heroMuted: '#A3A6BC',
  income: brand.colors.green,
  expense: '#F87171',
  success: brand.colors.green,
  successBg: '#0E2E2A',
  warning: brand.colors.yellow,
  warningBg: '#3A2B08',
  danger: '#F87171',
  dangerBg: '#3B1212',
  info: '#60A5FA',
  infoBg: '#10213F',
  ai: brand.colors.yellow,
  aiBg: '#2A220E',
  track: '#2A2B44',
  overlay: 'rgba(0,0,0,0.7)',
  tabBar: '#14152A',
  chartIncome: '#24a690',
  chartExpense: '#bf7f00',
  grid: '#2A2B44',
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
export const pickableColors = ['#2AB8A1', '#F8AE16', '#16A34A', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308', '#14B8A6', '#334155', '#EF4444'];
