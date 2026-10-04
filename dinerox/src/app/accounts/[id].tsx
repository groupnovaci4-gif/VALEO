import React, { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Badge, Button, Card, EmptyState, Screen, Text } from '@/components/ui';
import { TransactionRow } from '@/features/rows';
import { sortTransactions } from '@/core/transactions';
import { can } from '@/core/permissions';
import { withSpaceReady } from '@/components/SpaceReady';

function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const { data, balances } = useFinance();
  const account = data.accounts.find((a) => a.id === id);
  const txs = useMemo(() => sortTransactions(data.transactions.filter((tx) => tx.accountId === id || tx.toAccountId === id)), [data.transactions, id]);
  if (!account) return <Screen back><EmptyState title={t('acc.empty.title')} /></Screen>;
  return (
    <Screen
      back
      scroll={false}
      title={account.name}
      right={can(role, 'update', 'accounts') ? <Button small variant="ghost" icon="create-outline" label={t('common.edit')} onPress={() => router.push(`/accounts/edit?id=${id}`)} /> : undefined}
    >
      <FlatList
        data={txs}
        keyExtractor={(x) => x.id}
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <Card style={{ marginBottom: 12 }}>
            <Text variant="caption" tone="muted">
              {t('acc.balance')}
            </Text>
            <Text variant="h1" tone={(balances[account.id] ?? 0) < 0 ? 'danger' : 'default'}>
              {money(balances[account.id] ?? 0, { currency: account.currency })}
            </Text>
            <Text variant="small" tone="muted">
              {t(`acc.type.${account.type}`)} · {account.currency}
            </Text>
            {!account.active ? <Badge label={t('common.inactive')} /> : null}
            <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
              {t('acc.manualNotice')}
            </Text>
          </Card>
        }
        renderItem={({ item }) => <TransactionRow tx={item} />}
        ListEmptyComponent={<EmptyState emoji="🧾" title={t('tx.empty.title')} />}
      />
    </Screen>
  );
}

export default withSpaceReady(AccountDetail);
