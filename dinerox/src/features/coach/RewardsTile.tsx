/**
 * Pavé « Mes récompenses » de l'accueil : une médaille, le titre et le nombre de
 * récompenses obtenues (ou l'invitation à en gagner).
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { Icon, Tile, TileText } from '@/components/ui';
import { useTheme } from '@/theme';
import { useCoach } from './CoachProvider';

export function RewardsTile() {
  const { t } = useI18n();
  const { rewards } = useCoach();
  const { colors } = useTheme();
  const subtitle = rewards.length ? t('reward.earned', { count: rewards.length }) : t('reward.subtitle');
  return (
    <Tile onPress={() => router.push('/rewards')} accessibilityLabel={`${t('reward.title')}, ${subtitle}`}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.medalGold, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="trophy" size={22} color={colors.onMedal} />
      </View>
      <TileText variant="bodyStrong">{t('reward.title')}</TileText>
      <TileText variant="small" tone="muted">
        {subtitle}
      </TileText>
    </Tile>
  );
}
