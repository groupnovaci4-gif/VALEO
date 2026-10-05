/**
 * Design system — jetons centralisés. Aucun écran ne doit définir ses
 * propres couleurs, tailles ou rayons : tout passe par ces jetons.
 * Contrastes vérifiés pour le texte principal (≥ 4,5:1) dans les deux thèmes.
 */

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
  /** Vert DineroX : boutons principaux, éléments actifs, progression. */
  primary: string;
  /** Vert assombri : état pressé, liens et icônes sur fond clair. */
  primaryDark: string;
  /** Vert très léger : fonds de sélection, boutons secondaires. */
  primaryLight: string;
  /** Filet vert des éléments sélectionnés / boutons secondaires. */
  primaryBorder: string;
  onPrimary: string;
  /** Or de la flèche du logo : accent rare (bouton +, assistant). */
  secondary: string;
  onSecondary: string;
  /** Surface inversée (toasts) et son texte. */
  inverseSurface: string;
  onInverse: string;
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
 * Couleurs DineroX — charte « Sovereign Apex », VERT DOMINANT.
 *  - Vert émeraude (#14B8A6 / #0D9488) : couleur principale (boutons, sélection,
 *    progression, entrées d'argent, navigation active).
 *  - Or impérial (#F59E0B / #D97706) : accent rare (bouton « + », assistant, temps forts).
 *  - Cyan (#38BDF8) : informations.
 *  - Fonds nuit (#020617 / #0B1120 / #1E293B), filets fins, texte #F8FAFC.
 * Le thème sombre est la référence de la charte ; le thème clair reprend le même
 * vert, assombri pour rester lisible sur fond blanc (contraste ≥ 4,5:1).
 */
export const darkColors: ColorScheme = {
  background: '#020617',
  surface: '#0B1120',
  surfaceAlt: '#1E293B',
  border: 'rgba(255,255,255,0.08)',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textSubtle: '#7C8BA1',
  primary: '#14B8A6',
  primaryDark: '#0D9488',
  primaryLight: 'rgba(20,184,166,0.15)',
  primaryBorder: 'rgba(20,184,166,0.4)',
  onPrimary: '#012A25',
  secondary: '#F59E0B',
  onSecondary: '#020617',
  inverseSurface: '#1E293B',
  onInverse: '#F8FAFC',
  hero: '#0B1120',
  onHero: '#F8FAFC',
  heroMuted: '#94A3B8',
  income: '#34D399',
  expense: '#F43F5E',
  success: '#10B981',
  successBg: 'rgba(16,185,129,0.15)',
  warning: '#FBBF24',
  warningBg: 'rgba(245,158,11,0.15)',
  danger: '#F43F5E',
  dangerBg: 'rgba(244,63,94,0.15)',
  info: '#38BDF8',
  infoBg: 'rgba(56,189,248,0.12)',
  ai: '#FBBF24',
  aiBg: 'rgba(245,158,11,0.12)',
  track: '#1E293B',
  overlay: 'rgba(2,6,23,0.75)',
  tabBar: '#0B1120',
  chartIncome: '#0d9488',
  chartExpense: '#d97706',
  grid: 'rgba(255,255,255,0.08)',
};

export const lightColors: ColorScheme = {
  background: '#F3F8F7',
  surface: palette.white,
  surfaceAlt: '#E6F2F0',
  border: '#D9E6E3',
  text: '#0B1120',
  textMuted: '#475569',
  textSubtle: '#64748B',
  primary: '#0F766E',
  primaryDark: '#115E59',
  primaryLight: '#E6F4F1',
  primaryBorder: '#99D5CB',
  onPrimary: palette.white,
  secondary: '#F59E0B',
  onSecondary: '#020617',
  inverseSurface: '#0B1120',
  onInverse: '#F8FAFC',
  hero: '#0B1120',
  onHero: '#F8FAFC',
  heroMuted: '#94A3B8',
  income: '#047857',
  expense: '#E11D48',
  success: '#047857',
  successBg: '#D1FAE5',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#E11D48',
  dangerBg: '#FFE4E6',
  info: '#0369A1',
  infoBg: '#E0F2FE',
  ai: '#B45309',
  aiBg: '#FEF6E4',
  track: '#E2ECEA',
  overlay: 'rgba(2,6,23,0.6)',
  tabBar: palette.white,
  chartIncome: '#0d9488',
  chartExpense: '#d97706',
  grid: '#D9E6E3',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Échelle typographique de la charte (version mobile), tailles généreuses pour la lisibilité. */
export const typography = {
  display: { fontSize: 36, lineHeight: 44, fontWeight: '800' as const, letterSpacing: -0.9, role: 'heading' as const },
  h1: { fontSize: 26, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5, role: 'heading' as const },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.3, role: 'heading' as const },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2, role: 'heading' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, role: 'body' as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, role: 'body' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, role: 'body' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, role: 'body' as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.2, role: 'body' as const },
  numericLg: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.4, role: 'numeric' as const },
  numeric: { fontSize: 14, lineHeight: 18, fontWeight: '500' as const, role: 'numeric' as const },
};

export type TypographyVariant = keyof typeof typography;

/** Cible tactile minimale (WCAG / Material : 44–48 dp). */
export const MIN_TOUCH = 48;

/** Élévations : halo vert ou or (charte), ombre douce en mode clair. */
export const shadow = {
  card: { shadowColor: '#0B1120', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  fab: { shadowColor: '#F59E0B', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  glowGreen: { shadowColor: '#14B8A6', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
};

/** Palette pour comptes/enveloppes/catégories créés par l'utilisateur. */
export const pickableColors = ['#14B8A6', '#F59E0B', '#38BDF8', '#10B981', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308', '#0D9488', '#334155', '#EF4444'];
