/**
 * Analyse financière : la photographie de la situation (avec la provenance
 * de chaque chiffre) et les recommandations du moteur d'intelligence.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useMoney } from '@/hooks/useFinance';
import { useIntelligence } from '@/hooks/useIntelligence';
import { Card, GradientCard, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { RecommendationCard, SourceTag } from '@/features/Recommendation';
import { withSpaceReady } from '@/components/SpaceReady';
import { useTheme } from '@/theme';
import type { Figure } from '@/core/intelligence';

function Analysis() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const { snapshot: s, recommendations } = useIntelligence();
  const line = (label: TKey, f: Figure | number, hint?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="bodyStrong">{t(label)}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
        {typeof f === 'number' ? null : <SourceTag source={f.source} />}
      </View>
      <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
        {money(typeof f === 'number' ? f : f.value)}
      </Text>
    </View>
  );
  return (
    <Screen back title={t('intel.title')}>
      <GradientCard>
        <Text variant="overline" tone="heroMuted">
          {t('intel.capacity').toUpperCase()}
        </Text>
        <Text variant="display" tone="onHero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginVertical: 6 }}>
          {money(s.savingsCapacity.value)}
        </Text>
        <Text variant="small" tone="heroMuted">
          {s.savingsCapacity.value > 0 ? t('intel.capacityHint', { amount: money(s.savingsCapacity.value) }) : t('intel.capacityNone')}
        </Text>
        <Text variant="caption" tone="heroMuted" style={{ marginTop: 8 }}>
          {s.monthsOfData ? t('intel.basedOn', { count: s.monthsOfData }) : t('intel.basedOnDeclared')}
        </Text>
      </GradientCard>

      <SectionHeader title={t('intel.recommendations')} />
      {recommendations.map((r) => (
        <RecommendationCard key={r.id} r={r} />
      ))}

      <SectionHeader title={t('intel.breakdown')} action={t('intel.perMonth')} />
      <Card>
        {line('intel.income', s.income)}
        {line('intel.expenses', s.expenses)}
        {line('intel.fixed', s.fixedCharges, s.fixedRatio !== null ? t('intel.fixedRatio', { percent: s.fixedRatio }) : undefined)}
        {line('intel.variable', s.variableSpending)}
        {line('intel.debtService', s.debtService, s.debtRatio !== null && s.debtService.value > 0 ? t('intel.debtRatio', { percent: s.debtRatio }) : undefined)}
        {line('intel.goalNeeds', s.goalNeeds)}
        {line('intel.upcoming', s.upcomingOutflows, t('intel.upcomingHint'))}
      </Card>

      <SectionHeader title={t('intel.tools')} />
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        <Row title={t('score.cta')} subtitle={t('score.ctaSub')} chevron onPress={() => router.push('/score')} />
        <Row title={t('cal.title')} subtitle={t('cal.sub')} chevron onPress={() => router.push('/calendar')} />
        <Row title={t('fi.title')} subtitle={t('fi.sub')} chevron onPress={() => router.push('/independence')} />
        <Row title={t('budget.personal')} subtitle={t('budget.personalSub')} chevron onPress={() => router.push('/budget/auto')} />
      </Card>
      <Text variant="caption" tone="subtle" style={{ marginTop: 14 }}>
        {t('intel.disclaimer')}
      </Text>
    </Screen>
  );
}

export default withSpaceReady(Analysis);
