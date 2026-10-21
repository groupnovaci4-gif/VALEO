/**
 * « Mes récompenses » de l'accueil — étape 4 (maquette validée, point 4) : rond de couleur
 * pleine (or, trophée), nom centré et nombre de récompenses obtenues (ou l'invitation à en gagner).
 */
import React from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { CircleTile } from '@/components/ui';
import { useCoach } from './CoachProvider';

export function RewardsCircle() {
  const { t } = useI18n();
  const { rewards } = useCoach();
  const subtitle = rewards.length ? t('reward.earned', { count: rewards.length }) : t('reward.subtitle');
  return <CircleTile family="or" icon="trophy" label={t('reward.title')} sub={subtitle} accessibilityLabel={`${t('reward.title')}, ${subtitle}`} onPress={() => router.push('/rewards')} />;
}
