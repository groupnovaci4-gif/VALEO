/**
 * Style du contour d'un champ de saisie — module pur (testé).
 *
 * Règle Android (Fabric) : un conteneur est « aplati » s'il ne forme pas de
 * « stacking context » ; ses enfants natifs sont alors accrochés à son parent.
 * Toute propriété qui fait basculer cette nature (shadowColor, opacity,
 * transform, zIndex, pointerEvents…) en fonction du focus détache le TextInput
 * actif et Android lui retire le focus : c'était la cause du clignotement des
 * champs à l'inscription. Ici, le focus et l'erreur ne changent QUE des valeurs
 * neutres (couleur de bordure, opacité de l'ombre), et le conteneur est
 * déclaré non aplatissable (`collapsable: false`).
 */
export interface FieldColors {
  primary: string;
  danger: string;
  border: string;
  surface: string;
}

export function fieldBoxProps(state: { focused: boolean; error: boolean }, colors: FieldColors, borderRadius: number, minHeight: number) {
  return {
    collapsable: false as const,
    style: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      borderWidth: 1.5,
      borderColor: state.error ? colors.danger : state.focused ? colors.primary : colors.border,
      // Halo vert au focus (charte) : seule l'opacité varie, jamais la couleur.
      shadowColor: colors.primary,
      shadowOpacity: state.focused && !state.error ? 0.35 : 0,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
      borderRadius,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      minHeight,
    },
  };
}
