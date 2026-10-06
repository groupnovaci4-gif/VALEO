/** Tuile « Mes récompenses » de l'accueil (carte de marque GradientCard). */
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { GradientCard, Icon, Text } from '@/components/ui';
import { useCoach } from './CoachProvider';

export function RewardsTile() {
  const { t } = useI18n();
  const { rewards } = useCoach();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('reward.title')} onPress={() => router.push('/rewards')} style={{ marginBottom: 14 }}>
      <GradientCard style={{ marginBottom: 0, paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="trophy" size={26} color="#F5B301" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" tone="onHero">
              {t('reward.title')}
            </Text>
            <Text variant="caption" tone="heroMuted">
              {rewards.length ? t('reward.earned', { count: rewards.length }) : t('reward.subtitle')}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color="#FFFFFF" />
        </View>
      </GradientCard>
    </Pressable>
  );
}
