/**
 * Opérations : liste virtualisée (SectionList par jour), filtres type,
 * compte et recherche. Rien n'est rendu hors écran.
 */
import React, { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { ChipGroup, EmptyState, Field, Screen, Segmented, Text } from '@/components/ui';
import { TransactionRow } from '@/features/rows';
import { filterTransactions, sortTransactions } from '@/core/transactions';
import type { Transaction, TransactionType } from '@/core/types';

export default function Transactions() {
  const { t, date } = useI18n();
  const data = useData();
  const money = useMoney();
  const cats = useCategoryLabels();
  const [type, setType] = useState<TransactionType | 'all'>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [search, setSearch] = useState('');

  const sections = useMemo(() => {
    const list = sortTransactions(
      filterTransactions(data.transactions, { type, accountId: accountId === 'all' ? undefined : accountId, search }, (tx) => cats.byId(tx.categoryId ?? '')),
    );
    const byDay = new Map<string, Transaction[]>();
    for (const tx of list) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);
    return [...byDay.entries()].map(([day, items]) => ({
      title: day,
      net: items.reduce((s, x) => s + (x.type === 'income' ? x.amount : x.type === 'expense' ? -x.amount : 0), 0),
      data: items,
    }));
  }, [data.transactions, type, accountId, search, cats]);

  const filtered = type !== 'all' || accountId !== 'all' || !!search;
  return (
    <Screen brandSection={t('tab.transactions')} scroll={false}>
      <Text variant="h1" style={{ marginBottom: 12 }}>
        {t('tx.title')}
      </Text>
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'all', label: t('common.all') },
          { value: 'expense', label: t('tx.expense') },
          { value: 'income', label: t('tx.income') },
          { value: 'transfer', label: t('tx.transfer') },
        ]}
      />
      <Field placeholder={t('common.search')} value={search} onChangeText={setSearch} accessibilityLabel={t('common.search')} returnKeyType="search" />
      {data.accounts.length > 1 ? (
        <ChipGroup scroll value={accountId} onChange={setAccountId} options={[{ value: 'all', label: t('common.all') }, ...data.accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))]} />
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.id}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, marginBottom: 2 }}>
            <Text variant="small" weight="700" tone="muted">
              {date(section.title, { year: true })}
            </Text>
            <Text variant="small" tone={section.net < 0 ? 'expense' : 'income'}>
              {money(section.net, { signed: true })}
            </Text>
          </View>
        )}
        renderItem={({ item }) => <TransactionRow tx={item} />}
        ListEmptyComponent={
          filtered ? (
            <EmptyState emoji="🔎" title={t('tx.empty.filtered')} />
          ) : (
            <EmptyState emoji="🧾" title={t('tx.empty.title')} body={t('tx.empty.body')} action={t('quick.expense')} onAction={() => router.push('/transaction/new?type=expense')} />
          )
        }
      />
    </Screen>
  );
}
