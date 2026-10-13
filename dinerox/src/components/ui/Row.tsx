import React from 'react';
import { Pressable, Switch, View, useWindowDimensions } from 'react-native';
import { useTheme, MIN_TOUCH, BIG_TEXT } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

/** Ligne de liste : icône, titre, sous-titre, valeur à droite, chevron. */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  accessibilityHint,
  chevron,
  danger,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Action secondaire (ex. suppression avec confirmation) ; annoncée par `accessibilityHint`. */
  onLongPress?: () => void;
  accessibilityHint?: string;
  chevron?: boolean;
  danger?: boolean;
  /** Libellé complet (nom, montant, état) ; par défaut « titre, sous-titre ». */
  accessibilityLabel?: string;
}) {
  const { colors, v2 } = useTheme();
  const { fontScale } = useWindowDimensions();
  if (v2) {
    // Texte système ≥ 130 % : la valeur de droite passe sous le titre (§2.3, règle 3).
    const stacked = fontScale >= BIG_TEXT && !!right;
    const texts = (
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
    const chev = chevron ? <Icon name="chevron-forward" size={20} color={colors.textSubtle} /> : null;
    const body = stacked ? (
      <View style={{ minHeight: 56, paddingVertical: 8, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {left}
          {texts}
          {chev}
        </View>
        <View style={{ alignItems: 'flex-end' }}>{right}</View>
      </View>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 }}>
        {left}
        {texts}
        {right}
        {chev}
      </View>
    );
    if (!onPress) return body;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={450}
        style={({ pressed }) => ({ borderRadius: 8, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
      >
        {body}
      </Pressable>
    );
  }
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
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)} accessibilityHint={accessibilityHint} onPress={onPress} onLongPress={onLongPress} delayLongPress={450} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
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
  const { colors, v2 } = useTheme();
  if (v2) {
    // Titre de section v2 : titleS ; action = bouton texte de 48 dp (plus de petit lien).
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8, marginTop: 24, marginBottom: 4 }}>
        <Text variant="titleS" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {action && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            onPress={onAction}
            style={({ pressed }) => ({ minHeight: MIN_TOUCH, paddingHorizontal: 8, marginRight: -8, justifyContent: 'center', borderRadius: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
          >
            <Text variant="label" tone="primary">
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
