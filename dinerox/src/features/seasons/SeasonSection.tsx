/**
 * Section « Moments forts de l'année » de l'écran Objectifs — étape 4, en LIGNE : icône de
 * contenu, le prochain moment (date) et son rythme par semaine, chevron ; ou l'accès à la préparation.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { ContentIcon, Icon, ListCard, SectionHeader, Text } from '@/components/ui';
import { activeSeasons, seasonPlanFor } from '@/core/seasons';

export function SeasonSection() {
  const { t, date } = useI18n();
  const money = useMoney();
  const { colors } = useTheme();
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
      <ListCard>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('season.section')} · ${line}`}
          onPress={() => router.push('/seasons')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
        >
          {next ? <ContentIcon emoji={next.icon} ids={[next.templateId, `goal.${next.categoryId}`]} color={colors.primary} size={40} /> : <Icon name="calendar-outline" size={28} color={colors.primary} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">{next ? `${next.name}${next.targetDate ? ` · ${date(next.targetDate)}` : ''}` : t('season.add')}</Text>
            <Text variant="small" tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
              {line}
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
        </Pressable>
      </ListCard>
    </View>
  );
}
