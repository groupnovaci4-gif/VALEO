import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Banner, Card, EmptyState, IconButton, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { tontinePositions } from '@/core/tontine';
import { today } from '@/core/dates';
import { netWorth } from '@/core/networth';
import { hasFeature } from '@/core/subscription';

/** Patrimoine net = actifs − passifs (formule Family/Premium). */
export default function Assets() {
  const { t } = useI18n();
  const { plan } = useApp();
  const money = useMoney();
  const { data, currency } = useFinance();
  const nw = useMemo(() => netWorth(data.assets, data.accounts, data.transactions, data.debts, data.debtPayments, currency, tontinePositions(data, currency, today())), [data, currency]);
  if (!hasFeature(plan, 'net_worth')) {
    return (
      <Screen back title={t('nw.title')}>
        <UpgradeCard feature="net_worth" text={t('nw.empty.body')} />
      </Screen>
    );
  }
  return (
    <Screen back title={t('nw.title')} right={<IconButton icon="add-circle" size={30} label={t('nw.add')} onPress={() => router.push('/assets/edit')} />}>
      <Card>
        <Text variant="caption" tone="muted">
          {t('nw.net')} · {t('nw.formula')}
        </Text>
        <Text variant="h1" tone={nw.net < 0 ? 'danger' : 'default'}>
          {money(nw.net)}
        </Text>
        <View style={{ marginTop: 10, gap: 4 }}>
          <Line label={t('nw.assets')} value={money(nw.assets)} />
          <Line label={t('nw.accounts')} value={money(nw.accounts)} />
          <Line label={t('nw.receivables')} value={money(nw.receivables)} />
          <Line label={t('nw.liabilities')} value={money(-nw.liabilities)} />
        </View>
      </Card>
      {nw.skippedOtherCurrency ? <Banner tone="info" text={t('nw.skipped', { count: nw.skippedOtherCurrency })} /> : null}
      <SectionHeader title={t('nw.assets')} />
      <Card>
        {data.assets.length ? (
          data.assets.map((a) => <Row key={a.id} title={a.name} subtitle={t(`nw.type.${a.type}` as TKey)} right={<Text weight="700">{money(a.value, { currency: a.currency })}</Text>} chevron onPress={() => router.push(`/assets/edit?id=${a.id}`)} />)
        ) : (
          <EmptyState emoji="🏡" title={t('nw.empty.title')} body={t('nw.empty.body')} action={t('nw.add')} onAction={() => router.push('/assets/edit')} />
        )}
      </Card>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="small" weight="600">
        {value}
      </Text>
    </View>
  );
}
