/**
 * Accueil, « À lire » (refonte finale B5, E1 à E4) : TOUS les messages du coach au même endroit —
 * alertes, conseil du jour, points de « Votre coach » et « Votre analyse ».
 * Étape 3 : les blocs existants, regroupés à la place de la maquette (rien n'est retiré).
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { SectionHeader } from '@/components/ui';
import { InsightCard } from '@/features/rows';
import { CoachSummaryCard } from '@/features/coach/CoachSummaryCard';
import { AdviceOfDay } from '@/features/coach/AdviceOfDay';
import { RecommendationCard } from '@/features/Recommendation';
import { useFinance } from '@/hooks/useFinance';
import { useIntelligence } from '@/hooks/useIntelligence';

export function ToRead() {
  const { t } = useI18n();
  const { insights } = useFinance();
  const { recommendations } = useIntelligence();
  const topRec = recommendations[0];
  return (
    <View>
      {insights.length ? (
        <>
          <SectionHeader title={t('home.alerts')} action={insights.length > 3 ? t('common.seeAll') : undefined} onAction={() => router.push('/notifications')} />
          {insights.slice(0, 3).map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <CoachSummaryCard />
        <AdviceOfDay excludeId={topRec?.id} />
      </View>
      {topRec ? (
        <>
          <SectionHeader title={t('home.analysis')} action={t('common.seeAll')} onAction={() => router.push('/analysis')} />
          <RecommendationCard r={topRec} />
        </>
      ) : null}
    </View>
  );
}
