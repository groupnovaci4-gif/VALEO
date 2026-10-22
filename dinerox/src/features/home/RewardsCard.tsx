/**
 * Accueil, refonte finale B9 (ecrans/accueil-*.html, `.g2`) : deux cartes côte à côte —
 * « Mes récompenses » (trophée 3D, nombre de récompenses obtenues) et « DineroX IA » (rond violet,
 * « Instantané »). Mêmes destinations qu'avant ; l'invitation de l'assistant reste lue par le
 * lecteur d'écran. Texte agrandi ou écran étroit (A8) : une carte par ligne.
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { BIG_TEXT, shadowB, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { ContentIcon, Icon, Text } from '@/components/ui';
import { useCoach } from '@/features/coach/CoachProvider';

const NARROW_WIDTH = 340;

export function RewardsCard() {
  const { t } = useI18n();
  const { colors, dark } = useTheme();
  const { rewards } = useCoach();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < NARROW_WIDTH || fontScale >= BIG_TEXT;
  const rewardsSub = rewards.length ? t('reward.earned', { count: rewards.length }) : t('reward.subtitle');
  const card = (pressed: boolean) => ({ flexBasis: narrow ? ('100%' as const) : ('45%' as const), flexGrow: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 14, borderRadius: 20, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, ...(dark ? null : shadowB) });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t('reward.title')}, ${rewardsSub}`} onPress={() => router.push('/rewards')} style={({ pressed }) => card(pressed)}>
        <ContentIcon slug="trophy" icon="trophy" color={colors.accent} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" style={{ fontSize: 14 }}>
            {t('reward.title')}
          </Text>
          <Text variant="small" tone="subtle" style={{ fontSize: 13, lineHeight: 18 }}>
            {rewardsSub}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t('home.ai.title')}, ${t('home.ai.badge')}, ${t('home.askAssistantHint')}`} onPress={() => router.push('/assistant')} style={({ pressed }) => card(pressed)}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: finalPalette(dark).aiCircle, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chatbubble-ellipses" size={19} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" style={{ fontSize: 14 }}>
            {t('home.ai.title')}
          </Text>
          <Text variant="small" tone="subtle" style={{ fontSize: 13, lineHeight: 18 }}>
            {t('home.ai.badge')}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
