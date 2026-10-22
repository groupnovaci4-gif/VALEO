/**
 * Vignette d'objectif (refonte finale D2 ; ecrans/objectifs-*.html) : zone pastel de 118 dp avec
 * l'ANNEAU de progression (92 dp, trait 8) autour de l'icône (48 dp) et l'étiquette (« Priorité N »,
 * « Moment fort », « Réserve », « En pause ») ; puis le nom, les montants, le rythme, le % et le
 * bouton + (verser). Un toucher sur la vignette ouvre sa fiche ; le + est À CÔTÉ de la zone
 * touchable (jamais un bouton dans un bouton).
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { shadowB, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { ContentIcon, Icon, ProgressRing, Text } from '@/components/ui';
import { GOAL_TILE, goalTileColors, goalTileFamily, type GoalTileKind } from './goalTile';

export interface GoalTileProps {
  kind: GoalTileKind;
  label: string;
  name: string;
  amounts: string;
  pace?: string | null;
  percent: number;
  icon: { emoji?: string | null; ids: (string | null | undefined)[] };
  a11y: string;
  onPress: () => void;
  onAdd?: (() => void) | null;
  addLabel: string;
}

export function GoalTileCard({ kind, label, name, amounts, pace, percent, icon, a11y, onPress, onAdd, addLabel }: GoalTileProps) {
  const { colors, dark } = useTheme();
  const c = goalTileColors(goalTileFamily(kind), finalPalette(dark));
  const veil = GOAL_TILE[dark ? 'dark' : 'light'];
  return (
    <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...(dark ? null : shadowB) }}>
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <View style={{ height: 118, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ProgressRing size={92} stroke={8} percent={percent} color={c.fg} track={veil.track}>
            <ContentIcon emoji={icon.emoji} ids={icon.ids} color={c.fg} size={48} />
          </ProgressRing>
          <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: veil.pill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text variant="caption" weight="600" style={{ fontSize: 11, lineHeight: 15, color: c.fg }}>
              {label}
            </Text>
          </View>
        </View>
        <View style={{ paddingTop: 10, paddingHorizontal: 12 }}>
          <Text variant="label" style={{ fontSize: 14, lineHeight: 19 }}>
            {name}
          </Text>
          <Text variant="caption" weight="400" tone="subtle" style={{ fontSize: 12, lineHeight: 16 }}>
            {amounts}
          </Text>
          {pace ? (
            <Text variant="caption" weight="400" tone="subtle" style={{ fontSize: 11, lineHeight: 15, marginTop: 2 }}>
              {pace}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, marginTop: 'auto' }}>
        <Text variant="titleS" numeric weight="800" style={{ fontSize: 16, lineHeight: 22, color: c.fg }}>
          {`${percent} %`}
        </Text>
        {onAdd ? (
          // Zone de toucher de 48 dp (aussi sur le web, où hitSlop ne compte pas) autour du rond de 32 dp de la
          // maquette ; marges négatives : la vignette garde la hauteur de la maquette.
          <Pressable accessibilityRole="button" accessibilityLabel={addLabel} onPress={onAdd} style={{ width: 48, height: 48, margin: -8, alignItems: 'center', justifyContent: 'center' }}>
            {({ pressed }) => (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: pressed ? colors.primaryPressed : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="add" size={18} color={colors.onPrimary} />
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
