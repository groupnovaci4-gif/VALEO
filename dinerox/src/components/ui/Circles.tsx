/**
 * Menus et accès en RONDS de couleur pleine, regroupés dans des cartes (étape 4, maquette
 * validée, point 4) : rond 46 dp, icône Ionicons PLEINE, nom centré dessous (jamais coupé),
 * information éventuelle en petit ; plus de description visible — elle reste pour le lecteur
 * d'écran (`accessibilityHint`). Grille de 3 colonnes (2 si le texte est agrandi ou sous 340 dp).
 * Retour de pression par la couleur du fond de la cellule (règle 13 : pas d'opacité ni de transform).
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { Card } from './Card';
import { circleColors, circleColumns, type CircleFamily } from './circlePalette';

export function ColorCircle({ family, icon, size = 46 }: { family: CircleFamily; icon: string; size?: number }) {
  const { dark } = useTheme();
  const c = circleColors(family, dark);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name={icon} size={Math.round(size * 0.48)} color={c.fg} />
    </View>
  );
}

/** Une cellule : rond, nom centré (+ étiquette), information courte facultative. */
export function CircleTile({
  family,
  icon,
  label,
  badge,
  sub,
  hint,
  accessibilityLabel,
  onPress,
  dense,
}: {
  family: CircleFamily;
  icon: string;
  label: string;
  badge?: string;
  sub?: string;
  /** Description gardée pour le lecteur d'écran seulement. */
  hint?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  /** Écran Plus (maquette) : nom 12/15, écart 8, marges 2/14. */
  dense?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, sub].filter(Boolean).join(', ')}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: dense ? 8 : 6, paddingTop: dense ? 2 : 4, paddingHorizontal: dense ? 2 : 4, paddingBottom: 14, minHeight: 48, borderRadius: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
    >
      <ColorCircle family={family} icon={icon} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
        <Text variant="caption" weight="600" align="center" style={dense ? { fontSize: 12, lineHeight: 15 } : { fontSize: 12.5, lineHeight: 16 }}>
          {label}
        </Text>
        {badge ? (
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text variant="caption" weight="600" tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {sub ? (
        <Text variant="caption" tone="subtle" align="center" style={{ fontSize: 12, lineHeight: 16 }} weight="400">
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Carte contenant une grille de ronds : `columns` fixe (2) ou automatique (3, ou 2). */
export function CircleGrid({ children, columns, radius }: { children: React.ReactNode; columns?: 2 | 3; radius?: number }) {
  const { width, fontScale } = useWindowDimensions();
  const cols = columns ?? circleColumns(width, fontScale);
  const items = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <Card padded={false} style={{ paddingTop: 14, paddingHorizontal: 6, paddingBottom: 4, ...(radius ? { borderRadius: radius } : null) }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          {r}
          {Array.from({ length: cols - r.length }, (_, k) => (
            <View key={`vide${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </Card>
  );
}

/**
 * Ligne de menu (rubrique « Application » de Plus) : rond de couleur 36 dp, titre, description
 * (2 lignes au plus), chevron. À placer dans une `ListCard`.
 */
export function MenuRow({ family, icon, title, sub, badge, accessibilityLabel, onPress }: { family: CircleFamily; icon: string; title: string; sub?: string; badge?: string; accessibilityLabel?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, sub].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
    >
      <ColorCircle family={family} icon={icon} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Text variant="label" style={{ fontSize: 14.5, lineHeight: 20 }}>
            {title}
          </Text>
          {badge ? (
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text variant="caption" weight="600" tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {sub ? (
          <Text variant="small" tone="muted" numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16, marginTop: 2 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
    </Pressable>
  );
}
