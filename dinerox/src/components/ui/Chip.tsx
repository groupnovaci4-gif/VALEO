import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme, MIN_TOUCH } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

type ChipProps = { label: string; selected?: boolean; onPress?: () => void; icon?: string; emoji?: string; color?: string; /** Nom lu par le lecteur d'écran quand le libellé visible est un symbole. */ a11yLabel?: string };

export function Chip(props: ChipProps) {
  const { v2 } = useTheme();
  return v2 ? <ChipV2 {...props} /> : <LegacyChip {...props} />;
}

/**
 * Puce v2 (docs/design-system.md §8.7) : 48 dp, rayon 12, contour `borderStrong` ;
 * choisie = fond `primaryContainer` + coche (le choix ne repose pas sur la couleur
 * seule) ; pressée = couleur, jamais d'opacité ; libellé jamais tronqué.
 */
function ChipV2({ label, selected, onPress, icon, emoji, color, a11yLabel }: ChipProps) {
  const { colors, radius } = useTheme();
  const fg = selected ? colors.onPrimaryContainer : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-selected={!!selected}
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: MIN_TOUCH,
        maxWidth: '100%',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.borderStrong,
        backgroundColor: selected ? colors.primaryContainer : pressed ? colors.surfaceAlt : colors.surface,
      })}
    >
      {selected ? <Icon name="checkmark" size={18} color={fg} /> : null}
      {emoji ? <Text>{emoji}</Text> : icon ? <Icon name={icon} size={18} color={selected ? fg : (color ?? colors.textMuted)} /> : null}
      <Text variant="label" style={{ color: fg, flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function LegacyChip({ label, selected, onPress, icon, emoji, color, a11yLabel }: ChipProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-selected={!!selected}
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        maxWidth: '100%',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {emoji ? <Text>{emoji}</Text> : icon ? <Icon name={icon} size={16} color={selected ? colors.onPrimary : color ?? colors.textMuted} /> : null}
      <Text variant="small" weight="600" style={{ color: selected ? colors.onPrimary : colors.text, flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
  emoji?: string;
  color?: string;
  a11yLabel?: string;
}

/** Choix unique ou multiple parmi des puces. `scroll` : sur une ligne défilante. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  multiple,
  scroll,
}: {
  options: ChipOption<T>[];
  value: T | T[] | null;
  onChange: (v: T) => void;
  multiple?: boolean;
  scroll?: boolean;
}) {
  const { v2 } = useTheme();
  const gap = v2 ? 12 : 14;
  const isSel = (v: T) => (multiple ? (value as T[] | null)?.includes(v) : value === v);
  const chips = options.map((o) => <Chip key={o.value} label={o.label} icon={o.icon} emoji={o.emoji} color={o.color} a11yLabel={o.a11yLabel} selected={!!isSel(o.value)} onPress={() => onChange(o.value)} />);
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ marginBottom: gap }}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: gap }}>{chips}</View>;
}
