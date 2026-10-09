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
  /** Fond or clair (bouton +, pastilles épargne) et son contenu. */
  secondaryContainer: string;
  onSecondaryContainer: string;
  /** Dégradé de la carte principale (solde, objectifs, patrimoine). */
  heroGradient: [string, string];
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
  secondaryContainer: '#F59E0B',
  onSecondaryContainer: '#020617',
  heroGradient: ['#13806F', '#0A5F58'],
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

/**
 * Thème clair (référence des maquettes DineroX) : fond lavande très clair,
 * cartes blanches, vert profond #00685F pour les actions et la navigation,
 * carte principale en dégradé vert, or pour l'épargne et le bouton +.
 * Contrastes du texte ≥ 4,5:1 sur blanc.
 */
export const lightColors: ColorScheme = {
  background: '#F8F7FD',
  surface: palette.white,
  surfaceAlt: '#EFEEF6',
  border: '#E4E3EC',
  text: '#1A1B21',
  textMuted: '#4A4D55',
  textSubtle: '#686B73',
  primary: '#00685F',
  primaryDark: '#004F48',
  primaryLight: '#D5F2EE',
  primaryBorder: '#9ED9D0',
  onPrimary: palette.white,
  secondary: '#8B5600',
  onSecondary: palette.white,
  secondaryContainer: '#FFB95F',
  onSecondaryContainer: '#2A1700',
  heroGradient: ['#1A7D6B', '#0A6F67'],
  inverseSurface: '#1A1B21',
  onInverse: '#F8FAFC',
  hero: '#00685F',
  onHero: palette.white,
  heroMuted: 'rgba(255,255,255,0.82)',
  income: '#00685F',
  expense: '#BA1A1A',
  success: '#00685F',
  successBg: '#D5F2EE',
  warning: '#8B5600',
  warningBg: '#FFE8CC',
  danger: '#BA1A1A',
  dangerBg: '#FFDAD6',
  info: '#3F51B5',
  infoBg: '#E1E4FB',
  ai: '#8B5600',
  aiBg: '#FBF1E6',
  track: '#E3E3EE',
  overlay: 'rgba(26,27,33,0.5)',
  tabBar: palette.white,
  chartIncome: '#0d9488',
  chartExpense: '#d97706',
  grid: '#E4E3EC',
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

export type TypographyVariant = keyof typeof typography | keyof typeof typographyV2;

/** Cible tactile minimale (WCAG / Material : 44–48 dp). */
export const MIN_TOUCH = 48;

/** Élévations : halo vert ou or (charte), ombre douce en mode clair. */
export const shadow = {
  card: { shadowColor: '#1A1B21', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  fab: { shadowColor: '#F59E0B', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  glowGreen: { shadowColor: '#14B8A6', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  /** v2 — élévation 2, ombre NEUTRE (bouton central, feuilles). */
  raised: { shadowColor: '#121A17', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
};

/** Palette pour comptes/enveloppes/catégories créés par l'utilisateur. */
export const pickableColors = ['#14B8A6', '#F59E0B', '#38BDF8', '#10B981', '#0EA5E9', '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308', '#0D9488', '#334155', '#EF4444'];

/* ───────────────────────── Design system v2 (docs/design-system.md) ─────────────────────────
 * Migration écran par écran : un écran passé en v2 est enveloppé dans `<DesignV2>`
 * (src/theme/index.tsx), qui fournit ces couleurs, cette typographie et `theme.v2 = true`.
 * Les composants communs lisent `theme.v2` pour adopter le nouveau style ; les écrans
 * pas encore migrés restent strictement identiques. Contrastes vérifiés par
 * tests/design-tokens.test.ts (texte ≥ 4,5:1, contours et graphiques ≥ 3:1).
 */

/** Rôles ajoutés par la v2 (les anciens rôles restent, en alias, le temps de la migration). */
export interface ColorSchemeV2 extends ColorScheme {
  /** Contour des contrôles (champs, puces) : ≥ 3:1. `border` reste décoratif. */
  borderStrong: string;
  primaryPressed: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  /** Or : réussites et récompenses (ex-`secondary`). */
  accent: string;
  accentContainer: string;
  onAccentContainer: string;
  onSuccess: string;
  onDanger: string;
  heroFrom: string;
  heroTo: string;
  onHeroMuted: string;
  /** Fond des barres et pastilles posées sur la carte héros. */
  heroTrack: string;
  disabledBg: string;
  onDisabled: string;
  medalGold: string;
  medalSilver: string;
  medalBronze: string;
  onMedal: string;
}

const lightV2Base = {
  background: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF0EE',
  border: '#DDE3E0',
  borderStrong: '#7D8984',
  text: '#121A17',
  textMuted: '#3F4A45',
  textSubtle: '#56625C',
  primary: '#00685F',
  primaryPressed: '#004F48',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D3EFEA',
  onPrimaryContainer: '#00413B',
  accent: '#8A5300',
  accentContainer: '#FFD9A8',
  onAccentContainer: '#2B1700',
  income: '#1E6B3A',
  expense: '#B3261E',
  success: '#1E6B3A',
  successBg: '#D7F0DF',
  onSuccess: '#FFFFFF',
  warning: '#8A5300',
  warningBg: '#FFEBCF',
  danger: '#B3261E',
  dangerBg: '#FDE2DE',
  onDanger: '#FFFFFF',
  info: '#3949AB',
  infoBg: '#E3E6FA',
  heroFrom: '#0B6B61',
  heroTo: '#06504A',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.88)',
  heroTrack: 'rgba(255,255,255,0.28)',
  track: '#DDE3E0',
  disabledBg: '#E3E7E5',
  onDisabled: '#5E6A64',
  inverseSurface: '#1F2724',
  onInverse: '#F2F6F4',
  overlay: 'rgba(18,26,23,0.5)',
  chartIncome: '#1E6B3A',
  chartExpense: '#C2570C',
};

const darkV2Base = {
  background: '#0E1412',
  surface: '#161D1A',
  surfaceAlt: '#212A26',
  border: '#2C3632',
  borderStrong: '#75827C',
  text: '#EEF3F0',
  textMuted: '#BAC5BF',
  textSubtle: '#9AA6A0',
  primary: '#4FD1C0',
  primaryPressed: '#7FE0D3',
  onPrimary: '#00201C',
  primaryContainer: '#0F3D37',
  onPrimaryContainer: '#B6F1E8',
  accent: '#FFC266',
  accentContainer: '#4A3000',
  onAccentContainer: '#FFDDB0',
  income: '#5BD6A0',
  expense: '#FF8A80',
  success: '#5BD6A0',
  successBg: '#123826',
  onSuccess: '#00210F',
  warning: '#FFC266',
  warningBg: '#3A2A0E',
  danger: '#FF8A80',
  dangerBg: '#3D1714',
  onDanger: '#3B0906',
  info: '#A5B4FF',
  infoBg: '#1E2547',
  heroFrom: '#0D5C53',
  heroTo: '#08413B',
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.86)',
  heroTrack: 'rgba(255,255,255,0.24)',
  track: '#2C3632',
  disabledBg: '#28322E',
  onDisabled: '#97A39D',
  inverseSurface: '#E3EAE6',
  onInverse: '#17201C',
  overlay: 'rgba(0,0,0,0.7)',
  chartIncome: '#5BD6A0',
  chartExpense: '#FFA45C',
};

/** Métaux des récompenses : pastille pleine + glyphe `onMedal` (identiques dans les deux thèmes). */
const medals = { medalGold: '#F5B301', medalSilver: '#C3CCD3', medalBronze: '#C27C46', onMedal: '#2B1700' };

/** Anciens rôles, branchés sur les rôles v2 (supprimés au dernier lot de migration). */
function withAliases(c: typeof lightV2Base): ColorSchemeV2 {
  return {
    ...c,
    ...medals,
    primaryDark: c.primaryPressed,
    primaryLight: c.primaryContainer,
    primaryBorder: c.borderStrong,
    secondary: c.accent,
    onSecondary: c.surface,
    secondaryContainer: c.accentContainer,
    onSecondaryContainer: c.onAccentContainer,
    heroGradient: [c.heroFrom, c.heroTo],
    hero: c.heroFrom,
    heroMuted: c.onHeroMuted,
    ai: c.accent,
    aiBg: c.warningBg,
    tabBar: c.surface,
    grid: c.border,
  };
}

export const lightColorsV2: ColorSchemeV2 = withAliases(lightV2Base);
export const darkColorsV2: ColorSchemeV2 = withAliases(darkV2Base);

/** Échelle d'espacements v2 (pas de 4). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radiusV2 = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/**
 * Typographie v2. Les anciens noms (`display`, `h1`…) sont redirigés vers la nouvelle
 * échelle pour les composants pas encore réécrits. Plancher : 13 px.
 * `cap` : plafond d'agrandissement du texte système (§2.3) — 160 % pour le texte courant.
 */
export const typographyV2 = {
  amountHero: { fontSize: 36, lineHeight: 44, fontWeight: '800' as const, letterSpacing: -0.5, role: 'heading' as const, cap: 1.15, tabular: true },
  amountL: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3, role: 'heading' as const, cap: 1.25, tabular: true },
  amountM: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, role: 'body' as const, cap: 1.4, tabular: true },
  amountS: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, role: 'body' as const, cap: 1.6, tabular: true },
  titleL: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, role: 'heading' as const, cap: 1.25 },
  titleM: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, role: 'heading' as const, cap: 1.4 },
  titleS: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const, role: 'heading' as const, cap: 1.4 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, role: 'body' as const, cap: 1.6 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, role: 'body' as const, cap: 1.6 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, role: 'body' as const, cap: 1.6 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, role: 'body' as const, cap: 1.6 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const, role: 'body' as const, cap: 1.6 },
  tab: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, role: 'body' as const, cap: 1.6 },
  // Anciens noms → nouvelle échelle (alias de migration).
  display: { fontSize: 36, lineHeight: 44, fontWeight: '800' as const, letterSpacing: -0.5, role: 'heading' as const, cap: 1.15 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, role: 'heading' as const, cap: 1.25 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, role: 'heading' as const, cap: 1.4 },
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const, role: 'heading' as const, cap: 1.4 },
  overline: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, role: 'body' as const, cap: 1.6 },
  numericLg: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, role: 'body' as const, cap: 1.4, tabular: true },
  numeric: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, role: 'body' as const, cap: 1.6, tabular: true },
};

export type TypographyVariantV2 = keyof typeof typographyV2;

/** Style typographique commun aux deux échelles. */
export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700' | '800';
  letterSpacing?: number;
  role: 'heading' | 'body' | 'numeric';
  /** Plafond d'agrandissement du texte système (v2 uniquement). */
  cap?: number;
  /** Chiffres alignés (`tabular-nums`). */
  tabular?: boolean;
}

/** Au-delà de ce facteur de texte système, les lignes et grilles passent en un seul étage (§2.3). */
export const BIG_TEXT = 1.3;
