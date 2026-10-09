/**
 * Bulle d'accueil « Dites-moi ce que vous avez dépensé ou reçu » : renvoie au
 * micro central (voix) ou à la saisie au clavier. L'exemple change à chaque
 * ouverture ; après 10 saisies réussies, la bulle se réduit à une ligne.
 * Design system v2 : « Parler » est le bouton principal du contenu de l'accueil (même
 * action que le micro central) ; « Saisir » (clavier) est tertiaire.
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('entry.prompt.title')}
          onPress={() => entry.open('voice')}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 8, borderRadius: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
        >
          <Icon name="mic-outline" size={22} color={colors.primary} />
          <Text variant="small" tone="muted" style={{ flex: 1 }} numberOfLines={2}>
            {showExamples ? t('entry.prompt.compact', { example: t(example) }) : t('entry.prompt.title')}
          </Text>
        </Pressable>
        {/* À côté de la zone cliquable, jamais dedans (pas de bouton dans un bouton). */}
        <Button small variant="tertiary" icon="keypad-outline" label={t('entry.prompt.type')} onPress={() => entry.open('keyboard')} />
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: colors.primaryContainer, borderRadius: radius.lg, padding: 16, marginBottom: 4, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="mic" size={22} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" style={{ color: colors.onPrimaryContainer }}>
            {t('entry.prompt.title')}
          </Text>
          {showExamples ? (
            <Text variant="small" style={{ color: colors.onPrimaryContainer }}>
              {t('entry.prompt.example', { example: t(example) })}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button icon="mic" label={t('entry.prompt.speak')} onPress={() => entry.open('voice')} style={{ flexGrow: 1 }} />
        <Button variant="tertiary" icon="keypad-outline" label={t('entry.prompt.type')} onPress={() => entry.open('keyboard')} style={{ flexGrow: 1 }} />
      </View>
    </View>
  );
}
