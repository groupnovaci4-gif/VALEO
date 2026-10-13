/**
 * Tuile « Mes récompenses » de l'accueil (design system v2) : carte simple avec une
 * médaille (une seule carte en dégradé par écran, plus de couleur en dur).
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { Card, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useCoach } from './CoachProvider';

export function RewardsTile() {
  const { t } = useI18n();
  const { rewards } = useCoach();
  const { colors } = useTheme();
  const subtitle = rewards.length ? t('reward.earned', { count: rewards.length }) : t('reward.subtitle');
  return (
    <Card onPress={() => router.push('/rewards')} accessibilityLabel={`${t('reward.title')}, ${subtitle}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.medalGold, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="trophy" size={22} color={colors.onMedal} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{t('reward.title')}</Text>
        <Text variant="small" tone="muted">
          {subtitle}
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
    </Card>
  );
}
