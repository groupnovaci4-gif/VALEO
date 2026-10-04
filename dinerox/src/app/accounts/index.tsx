import React from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Banner, Card, EmptyState, IconButton, Screen, SectionHeader, Text } from '@/components/ui';
import { AccountRow } from '@/features/rows';
import { can } from '@/core/permissions';

export default function Accounts() {
  const { t } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const { data, balances, position } = useFinance();
  const sorted = [...data.accounts].sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order);
  const spending = sorted.filter((a) => !a.isSavings);
  const savings = sorted.filter((a) => a.isSavings);
  return (
    <Screen back title={t('acc.title')} right={can(role, 'create', 'accounts') ? <IconButton icon="add-circle" size={30} label={t('acc.new')} onPress={() => router.push('/accounts/edit')} /> : undefined}>
      <Banner tone="info" icon="information-circle-outline" text={t('acc.manualNotice')} />
      {data.accounts.length === 0 ? (
        <Card>
          <EmptyState emoji="👛" title={t('acc.empty.title')} body={t('acc.empty.body')} action={t('acc.new')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : (
        <>
          <Card>
            <Text variant="caption" tone="muted">
              {t('home.available')}
            </Text>
            <Text variant="h1">{money(position.available)}</Text>
          </Card>
          <SectionHeader title={t('acc.title')} />
          <Card>{spending.map((a) => <AccountRow key={a.id} account={a} balance={balances[a.id] ?? 0} />)}</Card>
          {savings.length ? (
            <>
              <SectionHeader title={t('sav.title')} />
              <Card>{savings.map((a) => <AccountRow key={a.id} account={a} balance={balances[a.id] ?? 0} />)}</Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
