import React, { useMemo } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Badge, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { debtStatus, debtTotals } from '@/core/debts';
import { can } from '@/core/permissions';

export default function Debts() {
  const { t, date } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const { data, currency, now } = useFinance();
  const totals = debtTotals(data.debts, data.debtPayments, currency);
  const statuses = useMemo(() => data.debts.map((d) => debtStatus(d, data.debtPayments, now)), [data.debts, data.debtPayments, now]);
  const section = (dir: 'i_owe' | 'owed_to_me') => statuses.filter((s) => s.debt.direction === dir).sort((a, b) => Number(a.settled) - Number(b.settled));
  return (
    <Screen back title={t('debt.title')} right={can(role, 'create', 'debts') ? <IconButton icon="add-circle" size={30} label={t('debt.new')} onPress={() => router.push('/debts/edit')} /> : undefined}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {t('debt.totals.iOwe')}
          </Text>
          <Text variant="h3" tone="expense">
            {money(totals.iOwe)}
          </Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {t('debt.totals.owedToMe')}
          </Text>
          <Text variant="h3" tone="income">
            {money(totals.owedToMe)}
          </Text>
        </Card>
      </View>
      {data.debts.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState emoji="🧾" title={t('debt.empty.title')} body={t('debt.empty.body')} action={t('debt.new')} onAction={() => router.push('/debts/edit')} />
        </Card>
      ) : (
        (['i_owe', 'owed_to_me'] as const).map((dir) =>
          section(dir).length ? (
            <React.Fragment key={dir}>
              <SectionHeader title={t(dir === 'i_owe' ? 'debt.iOwe' : 'debt.owedToMe')} />
              <Card>
                {section(dir).map((s) => (
                  <View key={s.debt.id}>
                    <Row
                      title={s.debt.counterparty}
                      subtitle={[t(`debt.kind.${s.debt.kind}`), s.nextDue ? t('debt.nextDue', { date: date(s.nextDue) }) : null].filter(Boolean).join(' · ')}
                      right={s.settled ? <Badge tone="success" label={t('debt.settled')} /> : <Text weight="700">{money(s.remaining)}</Text>}
                      chevron
                      onPress={() => router.push(`/debts/${s.debt.id}`)}
                    />
                    {!s.settled ? <ProgressBar value={s.percent} tone={s.daysToDue !== null && s.daysToDue < 0 ? 'danger' : 'success'} /> : null}
                  </View>
                ))}
              </Card>
            </React.Fragment>
          ) : null,
        )
      )}
    </Screen>
  );
}
