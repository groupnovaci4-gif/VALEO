/**
 * Historique des opérations (ancien onglet « Opérations », même URL
 * /transactions) : liste virtualisée par jour, filtres type, mois, compte,
 * catégorie et recherche, total de la période, modification au toucher et
 * suppression par appui long (avec confirmation).
 */
import React, { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, SectionList, View } from 'react-native';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { useActions, ActionError } from '@/store/actions';
import { useCategoryLabels, useCurrency, useMoney } from '@/hooks/useFinance';
import { ChipGroup, EmptyState, Field, Screen, Segmented, Text, useToast } from '@/components/ui';
import { TransactionRow } from '@/features/rows';
import { useEntry } from '@/features/entry/EntryProvider';
import { ALL_HISTORY, filterHistory, historyCategories, historyMonths, isFiltered, periodTotals, type HistoryFilter } from '@/core/history';
import { formatMoney } from '@/core/money';
import type { Transaction } from '@/core/types';
import { useTheme } from '@/theme';

export default function History() {
  const { t, date, monthYear } = useI18n();
  const { colors, radius } = useTheme();
  const data = useData();
  const money = useMoney();
  const currency = useCurrency();
  const cats = useCategoryLabels();
  const actions = useActions();
  const toast = useToast();
  const entry = useEntry();
  // Ouvert depuis un compte : filtré sur ce compte (modifiable).
  const params = useLocalSearchParams<{ from?: string; accountId?: string }>();
  const [f, setF] = useState<HistoryFilter>(() => ({ ...ALL_HISTORY, accountId: typeof params.accountId === 'string' && params.accountId ? params.accountId : 'all' }));
  const set = (patch: Partial<HistoryFilter>) => setF((cur) => ({ ...cur, ...patch }));

  const months = useMemo(() => historyMonths(data.transactions), [data.transactions]);
  const categories = useMemo(() => historyCategories(data.transactions), [data.transactions]);
  const list = useMemo(() => filterHistory(data.transactions, f, (tx) => cats.byId(tx.categoryId ?? '')), [data.transactions, f, cats]);
  const totals = useMemo(() => periodTotals(list), [list]);
  const sections = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const tx of list) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);
    return [...byDay.entries()].map(([day, items]) => ({
      title: day,
      net: items.reduce((s, x) => s + (x.type === 'income' ? x.amount : x.type === 'expense' ? -x.amount : 0), 0),
      data: items,
    }));
  }, [list]);

  const askDelete = (tx: Transaction) =>
    Alert.alert(t('common.deleteConfirmTitle'), t('tx.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          try {
            actions.remove('transactions', tx.id);
            toast.show(t('common.deleted'));
          } catch (e) {
            toast.show(e instanceof ActionError && e.code === 'permission' ? t('error.permission') : t('error.generic'), 'error');
          }
        },
      },
    ]);

  const main = totals[currency];
  const others = Object.entries(totals).filter(([c]) => c !== currency);
  const header = (
    <View>
      {months.length ? (
        <ChipGroup
          scroll
          value={f.month}
          onChange={(month) => set({ month })}
          options={[{ value: 'all', label: t('history.allMonths') }, ...months.map((m) => ({ value: m, label: monthYear(`${m}-01`) }))]}
        />
      ) : null}
      {data.accounts.length > 1 ? (
        <ChipGroup scroll value={f.accountId} onChange={(accountId) => set({ accountId })} options={[{ value: 'all', label: t('history.allAccounts') }, ...data.accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))]} />
      ) : null}
      {categories.length > 1 ? (
        <ChipGroup
          scroll
          value={f.categoryId}
          onChange={(categoryId) => set({ categoryId })}
          options={[{ value: 'all', label: t('history.allCategories') }, ...categories.map((id) => ({ value: id, label: cats.byId(id), icon: cats.meta(id).icon, color: cats.meta(id).color }))]}
        />
      ) : null}
      {list.length ? (
        <View accessibilityRole="summary" style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12, marginTop: 6, gap: 2 }}>
          <Text variant="small" weight="700">
            {t('history.total', { count: main?.count ?? 0 })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Text variant="small" tone="income">
              {t('history.in', { amount: money(main?.income ?? 0) })}
            </Text>
            <Text variant="small" tone="expense">
              {t('history.out', { amount: money(main?.expense ?? 0) })}
            </Text>
            <Text variant="small" weight="700" tone={(main?.net ?? 0) < 0 ? 'expense' : 'income'}>
              {t('history.net', { amount: money(main?.net ?? 0, { signed: true }) })}
            </Text>
          </View>
          {others.map(([c, v]) => (
            <Text key={c} variant="caption" tone="subtle">
              {c} : {t('history.in', { amount: formatMoney(v.income, c) })} · {t('history.out', { amount: formatMoney(v.expense, c) })}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen back title={t('history.title')} scroll={false}>
      <Segmented
        value={f.type}
        onChange={(type) => set({ type })}
        options={[
          { value: 'all', label: t('common.all') },
          { value: 'expense', label: t('tx.expense') },
          { value: 'income', label: t('tx.income') },
          { value: 'transfer', label: t('tx.transfer') },
        ]}
      />
      <Field placeholder={t('common.search')} value={f.search} onChangeText={(search) => set({ search })} accessibilityLabel={t('common.search')} returnKeyType="search" />
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.id}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={header}
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
        renderItem={({ item }) => <TransactionRow tx={item} onLongPress={() => askDelete(item)} longPressHint={t('history.longPressHint')} />}
        ListEmptyComponent={
          isFiltered(f) ? (
            <EmptyState emoji="🔎" title={t('tx.empty.filtered')} action={t('history.clearFilters')} onAction={() => setF(ALL_HISTORY)} />
          ) : (
            <EmptyState emoji="🧾" title={t('tx.empty.title')} body={t('tx.empty.body')} action={t('quick.expense')} onAction={() => entry.open('keyboard')} />
          )
        }
      />
    </Screen>
  );
}
