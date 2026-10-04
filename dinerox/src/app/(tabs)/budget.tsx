import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, EmptyState, ProgressBar, Screen, SectionHeader, Text } from '@/components/ui';
import { EnvelopeRow, InsightCard, SpaceSwitcher } from '@/features/rows';
import { can } from '@/core/permissions';

export default function Budget() {
  const { t, monthYear } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const { envelopes, budget, insights, now } = useFinance();
  const pct = budget.planned > 0 ? Math.round((budget.spent / budget.planned) * 100) : 0;
  const alerts = insights.filter((i) => i.kind === 'envelope_threshold' || i.kind === 'envelope_over_streak');
  const editable = can(role, 'create', 'envelopes');
  return (
    <Screen title={t('budget.title')} subtitle={monthYear(now)} right={editable ? <Button small variant="ghost" icon="sparkles" label={t('budget.auto')} onPress={() => router.push('/budget/auto')} /> : undefined}>
      <SpaceSwitcher />
      <Card>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <Metric label={t('budget.planned')} value={money(budget.planned)} />
          <Metric label={t('budget.spent')} value={money(budget.spent)} />
          <Metric label={t('budget.remaining')} value={money(budget.remaining)} danger={budget.remaining < 0} />
        </View>
        <ProgressBar value={pct} tone={pct > 100 ? 'danger' : pct >= 90 ? 'warning' : 'success'} height={10} label={t('budget.spent')} />
        {budget.unassigned > 0 ? (
          <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
            {t('budget.unassigned')} : {money(budget.unassigned)}
          </Text>
        ) : null}
      </Card>
      {alerts.length ? <View style={{ marginTop: 14 }}>{alerts.slice(0, 4).map((i) => <InsightCard key={i.id} insight={i} />)}</View> : null}
      <SectionHeader title={t('env.title')} action={editable ? t('env.new') : undefined} onAction={() => router.push('/envelopes/edit')} />
      <Card>
        {envelopes.length ? (
          envelopes.map((s) => <EnvelopeRow key={s.envelope.id} s={s} />)
        ) : (
          <EmptyState emoji="✉️" title={t('env.empty.title')} body={t('env.empty.body')} action={editable ? t('env.empty.cta') : undefined} onAction={() => router.push('/budget/auto')} />
        )}
      </Card>
    </Screen>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="small" weight="700" tone={danger ? 'danger' : 'default'} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
