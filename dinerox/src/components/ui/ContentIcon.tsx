import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '@/theme';
import type { AccountProvider, AccountType } from '@/core/types';
import { useOperators } from '@/services/operatorsConfig';
import { IconCircle } from './Icon';
import { Text } from './Text';
import { accountMark, iconSlugFor } from './contentIconMap';
import { ICON_ASSETS, OPERATOR_ASSETS } from './contentIconAssets.generated';

/** Taille de l'icône dans son rond clair (mode sombre) : la place du rond reste la même. */
const IN_HALO = 0.78;

function Icon3d({ slug, size }: { slug: string; size: number }) {
  const { colors, dark } = useTheme();
  const inner = dark ? Math.round(size * IN_HALO) : size;
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.iconHalo, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={ICON_ASSETS[slug]} style={{ width: inner, height: inner }} resizeMode="contain" />
    </View>
  );
}

/**
 * Icône de CONTENU (design-pro) : Fluent Emoji 3D ou icône composée, sans pastille en clair, sur
 * un léger rond clair en sombre. Sans icône 3D connue (catégorie ou emoji créés par la personne),
 * ou hors design v2 : le rendu actuel (`IconCircle`). Décoratif : le texte voisin porte le sens.
 *  - `ids` : identifiants dans l'ordre (sous-catégorie avant catégorie, modèle avant famille) ;
 *  - `emoji` : emoji CHOISI par la personne (objectif, réserve) — passe avant les identifiants ;
 *  - `fallbackEmoji` : emoji affiché faute de mieux (catégorie), consulté après les identifiants.
 */
export function ContentIcon({ ids, emoji, fallbackEmoji, icon, color, size = 40 }: { ids?: (string | null | undefined)[]; emoji?: string | null; fallbackEmoji?: string | null; icon?: string; color: string; size?: number }) {
  const { v2 } = useTheme();
  const slug = v2 ? (iconSlugFor({ ids, emoji }) ?? iconSlugFor({ emoji: fallbackEmoji })) : null;
  if (slug && ICON_ASSETS[slug]) return <Icon3d slug={slug} size={size} />;
  return <IconCircle icon={icon} emoji={emoji ?? fallbackEmoji ?? undefined} color={color} size={size} />;
}

/**
 * Marque d'un compte : logo de l'opérateur (fichier non modifié, coins arrondis à l'affichage),
 * pastille aux couleurs de l'opérateur, ou icône 3D du type de compte. Réglage par opérateur :
 * `config/operators.json`, remplaçable à distance (`services/operatorsConfig`).
 * Le logo / la pastille de l'opérateur s'affiche sur TOUS les écrans (identité de l'opérateur,
 * décision du fondateur) ; l'icône 3D des autres comptes attend le passage de l'écran en v2.
 */
export function AccountMark({ account, icon, color, size = 40 }: { account: { type: AccountType; provider: AccountProvider }; icon?: string; color: string; size?: number }) {
  const { v2 } = useTheme();
  const data = useOperators();
  const mark = accountMark(account, data);
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  if (mark?.kind === 'logo' && OPERATOR_ASSETS[mark.operator]) {
    return <Image {...hidden} source={OPERATOR_ASSETS[mark.operator]} style={{ width: size, height: size, borderRadius: size / 4 }} resizeMode="contain" />;
  }
  if (mark?.kind === 'pill') {
    return (
      <View {...hidden} style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: mark.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text weight="700" maxFontSizeMultiplier={1} style={{ color: mark.color, fontSize: Math.round(size * (mark.initials.length > 2 ? 0.28 : 0.34)) }}>
          {mark.initials}
        </Text>
      </View>
    );
  }
  if (mark?.kind === '3d' && v2 && ICON_ASSETS[mark.slug]) return <Icon3d slug={mark.slug} size={size} />;
  return <IconCircle icon={icon} color={color} size={size} />;
}
