/**
 * Section « Moments forts de l'année » de l'écran Objectifs, en PAVÉ : le prochain
 * moment et son rythme par semaine, ou l'accès à la préparation.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { SectionHeader, Tile, TileText } from '@/components/ui';
import { activeSeasons, seasonPlanFor } from '@/core/seasons';

export function SeasonSection() {
  const { t, date } = useI18n();
  const money = useMoney();
  const { data, now } = useFinance();
  const seasons = activeSeasons(data.goals);
  const next = seasons[0];
  const p = next ? seasonPlanFor(next, data.goalContributions, now) : null;
  const line = next && p
    ? next.targetDate && p.weeksLeft !== null && p.weekly !== null
      ? p.plan.remaining > 0
        ? t('season.planFull', { name: next.name, weeks: p.weeksLeft, target: money(next.targetAmount), weekly: money(p.weekly) })
        : `${next.name} · ${t('season.ready')}`
      : `${next.name} · ${t('season.noDate')}`
    : t('season.section.hint');
  return (
    <View style={{ marginBottom: 8 }}>
      <SectionHeader title={t('season.section')} />
      {/* Un seul pavé : toute la largeur. */}
      <Tile accessibilityLabel={`${t('season.section')} · ${line}`} onPress={() => router.push('/seasons')}>
        <TileText variant="bodyStrong">{next ? `${next.icon} ${next.name}${next.targetDate ? ` · ${date(next.targetDate)}` : ''}` : `📅 ${t('season.add')}`}</TileText>
        <TileText variant="small" tone="muted">
          {line}
        </TileText>
      </Tile>
    </View>
  );
}
