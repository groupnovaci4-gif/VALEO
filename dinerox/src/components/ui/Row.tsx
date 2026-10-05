import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useTheme, MIN_TOUCH } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

/** Ligne de liste : icône, titre, sous-titre, valeur à droite, chevron. */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron,
  danger,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MIN_TOUCH + 8, paddingVertical: 8 }}>
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="subtle" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={colors.textSubtle} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

/**
 * Interrupteur : TOUTE la ligne est touchable (pas seulement le petit bouton),
 * et le libellé n'est jamais tronqué. Un seul contrôle accessible (rôle switch).
 */
export function SwitchRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MIN_TOUCH + 8, paddingVertical: 8, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="subtle">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {/* Indicateur visuel : la ligne entière porte l'action (évite un double basculement). */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} disabled={disabled} trackColor={{ true: colors.primary, false: colors.track }} thumbColor={colors.onInverse} />
      </View>
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 22, marginBottom: 10 }}>
      <Text variant="h3" accessibilityRole="header" style={{ flexShrink: 1 }} numberOfLines={2}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text variant="small" weight="700" style={{ color: colors.primary }}>
            {action}
          </Text>
        </Pressable>
      ) : action ? (
        <Text variant="small" tone="muted">
          {action}
        </Text>
      ) : null}
    </View>
  );
}
