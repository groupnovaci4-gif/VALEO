/**
 * Accueil, refonte finale B4 (ecrans/accueil-*.html, `.qb`) : 4 grandes tuiles en 2 colonnes —
 * Historique (bleu pâle), Revenu (vert pâle), Transfert (or pâle), Parler (vert plein), chacune
 * avec sa petite phrase. Rayon 18, marge 14, hauteur mini 96, 18 dp entre l'icône et le texte.
 * « Parler » remplace la bulle de saisie : même action (voix, ou clavier après « Non, je tape »,
 * I1) ; l'exemple tiré au hasard reste (préférence `showExamples`). Texte agrandi ou écran
 * étroit (A8) : une tuile par ligne.
 */
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { BIG_TEXT, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { Button, Icon, Text } from '@/components/ui';
import { useApp } from '@/store/app';
import { entryPrefs } from '@/core/entry/prefs';
import { micOffered } from '@/core/entry/voicePrivacy';
import { useEntry } from '@/features/entry/EntryProvider';
import { useVoiceRoute } from '@/features/entry/useVoiceRoute';

const EXAMPLES: TKey[] = ['entry.example.1', 'entry.example.2', 'entry.example.3', 'entry.example.4', 'entry.example.5', 'entry.example.6'];
/** Écran étroit (A8) : en dessous, une tuile par ligne. */
const NARROW_WIDTH = 340;

export function QuickTiles() {
  const { t, lang } = useI18n();
  const { colors, dark } = useTheme();
  const p = finalPalette(dark);
  const entry = useEntry();
  const { profile } = useApp();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < NARROW_WIDTH || fontScale >= BIG_TEXT;
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  const ePrefs = entryPrefs(profile?.preferences);
  // I1 : après « Non, je tape », la tuile ouvre le clavier (aucun micro proposé).
  const voiceRoute = useVoiceRoute(ePrefs.voiceLanguage ?? (lang === 'en' ? 'en' : 'fr'));
  const voice = !voiceRoute.route || micOffered(voiceRoute.route);
  // Même règle que le bouton central (`(tabs)/_layout.tsx`).
  const keyboardFirst = ePrefs.defaultMethod === 'quick_manual';
  const tiles = [
    { key: 'history', icon: 'time-outline', label: t('history.title'), sub: t('home.tile.history.sub'), bg: p.blueBg, fg: p.blueFg, onPress: () => router.push('/transactions?from=home') },
    { key: 'income', icon: 'arrow-down', label: t('tx.income'), sub: t('home.tile.income.sub'), bg: p.greenBg, fg: p.greenFg, onPress: () => router.push('/transaction/new?type=income') },
    { key: 'transfer', icon: 'swap-horizontal', label: t('tx.transfer'), sub: t('home.tile.transfer.sub'), bg: p.goldBg, fg: p.goldFg, onPress: () => router.push('/transaction/new?type=transfer') },
    {
      key: 'speak',
      icon: voice ? 'mic' : 'keypad-outline',
      label: voice ? t('entry.prompt.speak') : t('entry.prompt.type'),
      sub: ePrefs.showExamples ? t('home.tile.speak.sub', { example: t(example) }) : t('entry.prompt.title'),
      bg: p.brandTile,
      fg: '#FFFFFF',
      onPress: () => entry.open(voice ? 'voice' : 'keyboard'),
    },
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
        {tiles.map((x) => {
          const onBrand = x.key === 'speak';
          return (
            <Pressable
              key={x.key}
              accessibilityRole="button"
              accessibilityLabel={`${x.label}, ${x.sub}`}
              onPress={x.onPress}
              style={({ pressed }) => ({ flexBasis: narrow ? '100%' : '45%', flexGrow: 1, minHeight: 96, borderRadius: 18, padding: 14, gap: 18, backgroundColor: x.bg, opacity: pressed ? 0.85 : 1 })}
            >
              <Icon name={x.icon} size={26} color={x.fg} />
              <View>
                <Text variant="label" style={{ fontSize: 15, color: onBrand ? '#FFFFFF' : colors.text }}>
                  {x.label}
                </Text>
                <Text variant="caption" weight="400" style={{ fontSize: 12, lineHeight: 16, opacity: 0.8, color: onBrand ? '#FFFFFF' : colors.textMuted }}>
                  {x.sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {/* Décision D1 du fondateur (audit du 23/10, R8) : la saisie au CLAVIER reste visible, sans appui long.
          Seulement quand la voix est la méthode : sinon le bouton central (ou la tuile) ouvre déjà le clavier. */}
      {voice && !keyboardFirst && <Button small variant="tertiary" icon="keypad-outline" label={t('entry.mic.labelKeyboard')} onPress={() => entry.open('keyboard')} style={{ alignSelf: 'center', marginTop: 4 }} />}
    </View>
  );
}
