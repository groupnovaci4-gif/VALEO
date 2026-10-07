/**
 * Section « Réserves » de l'écran Objectifs (au-dessus des objectifs) : solde
 * et plafond de chaque réserve, ou invitation à créer la réserve famille.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, ProgressBar, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { isReserve, reserveState } from '@/core/reserve';
import { can } from '@/core/permissions';

export function ReserveSection() {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const { role } = useApp();
  const { data } = useFinance();
  const reserves = data.goals.filter((g) => !g.deleted && isReserve(g) && (g.status === 'active' || g.status === 'paused'));
  const canCreate = can(role, 'create', 'goals');
  if (!reserves.length && !canCreate) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionHeader title={t('reserve.section')} action={reserves.length && canCreate ? t('common.add') : undefined} onAction={() => router.push('/reserve/new')} />
      {reserves.length ? (
        reserves.map((r) => {
          const s = reserveState(r, data.goalContributions);
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`${r.name} · ${money(s.balance)} · ${t('reserve.of', { amount: money(s.target) })}`}
              onPress={() => router.push(`/reserve/${r.id}`)}
              style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, gap: 6 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>{r.icon}</Text>
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text variant="bodyStrong">{money(s.balance)}</Text>
              </View>
              <ProgressBar value={s.percent} tone={s.full ? 'success' : 'primary'} label={r.name} />
              <Text variant="caption" tone="subtle">
                {t('reserve.of', { amount: money(s.target) })}
                {s.monthly ? ` · ${t('reserve.monthlyPlan', { amount: money(s.monthly) })}` : ''}
              </Text>
            </Pressable>
          );
        })
      ) : (
        <Card style={{ gap: 8 }}>
          <Text variant="bodyStrong">🤝 {t('reserve.defaultName')}</Text>
          <Text variant="small" tone="muted">
            {t('reserve.createCta.body')}
          </Text>
          <Button icon="add-circle-outline" label={t('reserve.create')} onPress={() => router.push('/reserve/new')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}
      <Text variant="caption" tone="subtle" style={{ marginTop: 2, marginBottom: 6 }}>
        {t('reserve.section.hint')}
      </Text>
    </View>
  );
}
