/** Calendrier financier : revenus, loyers, factures, tontines, dettes et objectifs à venir. */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Card, EmptyState, IconCircle, Row, Screen, Segmented, Text } from '@/components/ui';
import { withSpaceReady } from '@/components/SpaceReady';
import { useTheme } from '@/theme';
import { financialCalendar, type CalendarKind } from '@/core/calendar';

const ICON: Record<CalendarKind, string> = { income: 'arrow-down', expense: 'receipt-outline', tontine: 'people', tontine_payout: 'cash-outline', debt: 'card-outline', goal: 'flag', season: 'calendar-number' };

function CalendarScreen() {
  const { t, date } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const { data, now } = useFinance();
  const [days, setDays] = useState<'30' | '60' | '90'>('30');
  const events = useMemo(() => financialCalendar(data, now, Number(days)), [data, now, days]);
  const tone = (k: CalendarKind) => (k === 'income' || k === 'tontine_payout' ? colors.income : k === 'goal' || k === 'season' ? colors.primary : k === 'tontine' ? colors.secondary : k === 'debt' ? colors.danger : colors.info);
  const totalOut = events.filter((e) => e.kind !== 'income' && e.kind !== 'tontine_payout' && e.kind !== 'goal' && e.kind !== 'season').reduce((n, e) => n + (e.amount ?? 0), 0);
  const totalIn = events.filter((e) => e.kind === 'income' || e.kind === 'tontine_payout').reduce((n, e) => n + (e.amount ?? 0), 0);
  return (
    <Screen back title={t('cal.title')}>
      <Segmented value={days} onChange={setDays} options={(['30', '60', '90'] as const).map((d) => ({ value: d, label: t('cal.days', { count: d }) }))} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <Text variant="caption" tone="muted">
            {t('cal.in')}
          </Text>
          <Text variant="h3" tone="income" numberOfLines={1} adjustsFontSizeToFit>
            {money(totalIn)}
          </Text>
        </Card>
        <Card style={{ flex: 1, padding: 14 }}>
          <Text variant="caption" tone="muted">
            {t('cal.out')}
          </Text>
          <Text variant="h3" tone="expense" numberOfLines={1} adjustsFontSizeToFit>
            {money(totalOut)}
          </Text>
        </Card>
      </View>
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        {events.length ? (
          events.map((e) => (
            <Row
              key={e.id}
              title={e.label}
              subtitle={`${date(e.date)} · ${t(`cal.kind.${e.kind}` as TKey)}`}
              left={<IconCircle icon={ICON[e.kind]} color={tone(e.kind)} size={40} />}
              right={
                e.amount !== null ? (
                  <Text variant="numeric" weight="600" style={{ color: tone(e.kind) }}>
                    {money(e.amount, { currency: e.currency })}
                  </Text>
                ) : undefined
              }
              onPress={() => router.push(e.link as never)}
            />
          ))
        ) : (
          <EmptyState emoji="🗓️" title={t('cal.empty.title')} body={t('cal.empty.body')} action={t('rec.title')} onAction={() => router.push('/recurring')} />
        )}
      </Card>
    </Screen>
  );
}

export default withSpaceReady(CalendarScreen);
