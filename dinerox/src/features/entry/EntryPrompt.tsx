/**
 * Bulle d'accueil « Dites-moi ce que vous avez dépensé ou reçu » : renvoie au
 * micro central (voix) ou à la saisie au clavier. L'exemple change à chaque
 * ouverture ; après 10 saisies réussies, la bulle se réduit à une ligne.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useEntry } from './EntryProvider';
import { useEntryStats } from './useEntryStats';
import { useApp } from '@/store/app';
import { entryPrefs } from '@/core/entry/prefs';

const EXAMPLES: TKey[] = ['entry.example.1', 'entry.example.2', 'entry.example.3', 'entry.example.4', 'entry.example.5', 'entry.example.6'];
export const COMPACT_AFTER = 10;

export function EntryPrompt() {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const entry = useEntry();
  const stats = useEntryStats();
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  const compact = (stats?.successes ?? 0) >= COMPACT_AFTER;
  const { profile } = useApp();
  const showExamples = entryPrefs(profile?.preferences).showExamples;

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('entry.prompt.title')}
        onPress={() => entry.open('voice')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 8, opacity: pressed ? 0.7 : 1 })}
      >
        <Icon name="mic-outline" size={18} color={colors.primary} />
        <Text variant="small" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
          {showExamples ? t('entry.prompt.compact', { example: t(example) }) : t('entry.prompt.title')}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('entry.prompt.type')} onPress={() => entry.open('keyboard')} hitSlop={10}>
          <Icon name="keypad-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    );
  }
  return (
    <View style={{ backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: 14, marginBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mic" size={20} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong">{t('entry.prompt.title')}</Text>
          {showExamples ? (
            <Text variant="small" tone="muted">
              {t('entry.prompt.example', { example: t(example) })}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small icon="mic" label={t('entry.prompt.speak')} onPress={() => entry.open('voice')} style={{ flex: 1 }} />
        <Button small variant="secondary" icon="keypad-outline" label={t('entry.prompt.type')} onPress={() => entry.open('keyboard')} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
