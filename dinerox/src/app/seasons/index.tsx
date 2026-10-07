/**
 * Moments forts de l'année : rentrée, Tabaski, fin du Ramadan, Noël et fin
 * d'année, Pâques, et moments personnels. Chaque moment choisi est un objectif
 * à date avec son plan (core/seasons) ; sans date connue : « date à préciser ».
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Card, Chip, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { withSpaceReady } from '@/components/SpaceReady';
import { activeSeasons, PERSONAL_SEASON, SEASON_EVENTS, seasonPlanFor } from '@/core/seasons';
import { withinLimit } from '@/core/subscription';
import { can } from '@/core/permissions';

function Seasons() {
  const { t, date } = useI18n();
  const money = useMoney();
  const { plan, role } = useApp();
  const { data, now } = useFinance();
  const seasons = useMemo(() => activeSeasons(data.goals), [data.goals]);
  const canCreate = can(role, 'create', 'goals');
  const canAdd = withinLimit(plan, 'seasons', seasons.length);

  return (
    <Screen back title={t('season.title')}>
      <Text tone="muted" style={{ marginBottom: 12 }}>
        {t('season.tagline')}
      </Text>

      <SectionHeader title={t('season.mine')} />
      <Card>
        {seasons.length ? (
          seasons.map((g) => {
            const p = seasonPlanFor(g, data.goalContributions, now);
            const subtitle =
              g.targetDate && p.weeksLeft !== null && p.weekly !== null
                ? p.plan.remaining > 0
                  ? t('season.plan', { weeks: p.weeksLeft, target: money(g.targetAmount), weekly: money(p.weekly) })
                  : t('season.ready')
                : t('season.noDate');
            return <Row key={g.id} title={`${g.icon} ${g.name}${g.targetDate ? ` · ${date(g.targetDate)}` : ''}`} subtitle={subtitle} chevron onPress={() => router.push(`/goals/${g.id}`)} />;
          })
        ) : (
          <EmptyState title={t('season.empty.title')} body={t('season.empty.body')} />
        )}
      </Card>

      {canCreate ? (
        <>
          <SectionHeader title={t('season.add')} />
          {canAdd ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SEASON_EVENTS.map((e) => (
                <Chip key={e.id} label={`${e.icon} ${t(`season.event.${e.id}` as TKey)}`} onPress={() => router.push(`/seasons/new?event=${e.id}`)} />
              ))}
              <Chip label={`✨ ${t('season.event.personal')}`} onPress={() => router.push(`/seasons/new?event=${PERSONAL_SEASON}`)} />
            </View>
          ) : (
            <UpgradeCard feature="seasonal_planning" text={t('season.limit')} />
          )}
        </>
      ) : null}
      <Text variant="caption" tone="subtle" style={{ marginTop: 12 }}>
        {t('season.datesNote')}
      </Text>
    </Screen>
  );
}

export default withSpaceReady(Seasons);
