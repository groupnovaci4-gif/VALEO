/**
 * Historique des opérations (ancien onglet « Opérations », même URL
 * /transactions) : liste virtualisée par jour, filtres type, mois, compte,
 * catégorie et recherche, total de la période, modification au toucher et
 * suppression par appui long (avec confirmation).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, SectionList, View } from 'react-native';
import { useI18n } from '@/i18n';
import { useActions, ActionError } from '@/store/actions';
import { useCategoryLabels, useCurrency, useFinance, useMoney } from '@/hooks/useFinance';
import { ChipGroup, EmptyState, Field, Screen, Segmented, Text, useToast } from '@/components/ui';
import { TransactionRow } from '@/features/rows';
import { useEntry } from '@/features/entry/EntryProvider';
import { ALL_HISTORY, filterHistory, historyCategories, historyMonths, isFiltered, periodTotals, type HistoryFilter } from '@/core/history';
import { formatMoney } from '@/core/money';
import { accountStatement } from '@/core/ledger';
import { removalWouldOverdraw } from '@/core/writePlans';
import { isRevenue, spendingAmount } from '@/core/nature';
import { endOfMonth } from '@/core/dates';
import type { Transaction } from '@/core/types';
import { useTheme } from '@/theme';
import { analytics } from '@/services/analytics';

export default function History() {
  const { t, date, monthYear } = useI18n();
  const { colors, radius } = useTheme();
  // Opérations vues sous leur catégorie actuelle (alias 1.8) : le filtre par catégorie les retrouve.
  const { data } = useFinance();
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
  // Mesure d'usage : d'où l'Historique est ouvert (aucun contenu).
  useEffect(() => {
    const from = typeof params.from === 'string' ? params.from : '';
    if (['home', 'toast', 'more', 'account', 'envelope'].includes(from)) analytics.track('history_opened', { source: from });
  }, [params.from]);

  const months = useMemo(() => historyMonths(data.transactions), [data.transactions]);
  const categories = useMemo(() => historyCategories(data.transactions), [data.transactions]);
  const list = useMemo(() => filterHistory(data.transactions, f, (tx) => cats.byId(tx.categoryId ?? '')), [data.transactions, f, cats]);
  const totals = useMemo(() => periodTotals(list), [list]);
  const sections = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const tx of list) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);
    return [...byDay.entries()].map(([day, items]) => ({
      title: day,
      // Argent disponible v2 : résultat du jour par nature (revenus − dépenses), comme le rapport.
      net: items.reduce((s, x) => s + (isRevenue(x) ? x.amount : -spendingAmount(x)), 0),
      data: items,
    }));
  }, [list]);

  const askDelete = (tx: Transaction) => {
    // Argent disponible v2 (§6.4, E40b) : supprimer est permis ; si un compte passe sous zéro, on le dit avant.
    const over = removalWouldOverdraw(data, tx.id);
    const body = over ? t('money.willBeNegative', { account: data.accounts.find((a) => a.id === over.accountId)?.name ?? '', amount: money(over.balance) }) : t('tx.deleteConfirm');
    return Alert.alert(t('common.deleteConfirmTitle'), body, [
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
  };

  const main = totals[currency];
  // Vue par compte = RELEVÉ (§10.2) : solde au début, entrées, sorties, solde à la fin ;
  // l'ouverture en tête, et chaque mise de côté portée par ce compte.
  const account = f.accountId !== 'all' ? data.accounts.find((a) => a.id === f.accountId) : undefined;
  const statement = useMemo(() => {
    if (!account) return null;
    const period = f.month === 'all' ? { start: '0000-01-01', end: '9999-12-31' } : { start: `${f.month}-01`, end: endOfMonth(`${f.month}-01`) };
    const s = accountStatement(data, account.id, period);
    const goals = new Map(data.goals.map((g) => [g.id, g.name]));
    const setAside = data.goalContributions
      .filter((c) => !c.deleted && !c.transferId && c.accountId === account.id && c.date >= period.start && c.date <= period.end)
      .sort((a, b) => b.date.localeCompare(a.date));
    return { s, setAside, goals };
  }, [account, data, f.month]);
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
      {account && statement ? (
        <View accessibilityRole="summary" style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12, marginTop: 6, gap: 2 }}>
          {statement.s.lines.filter((l) => l.nature === 'ouverture').map((l) => (
            <Text key="opening" variant="small">
              {t('history.opening', { amount: money(l.amount) })}
              {account.openingNote ? ` · ${account.openingNote}` : ''}
            </Text>
          ))}
          <Text variant="small">{t('history.statement.start', { amount: money(statement.s.start, { currency: account.currency }) })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Text variant="small" tone="income">
              {t('history.statement.in', { amount: money(statement.s.inflows, { currency: account.currency }) })}
            </Text>
            <Text variant="small" tone="expense">
              {t('history.statement.out', { amount: money(statement.s.outflows, { currency: account.currency }) })}
            </Text>
          </View>
          <Text variant="small" weight="700">
            {t('history.statement.end', { amount: money(statement.s.end, { currency: account.currency }) })}
          </Text>
          {statement.setAside.map((c) => (
            <Text key={c.id} variant="caption" tone="subtle">
              {date(c.date)} · {c.amount > 0 ? t('history.setAside', { account: account.name, goal: statement.goals.get(c.goalId) ?? '' }) : t('history.setAsideEnd', { account: account.name, goal: statement.goals.get(c.goalId) ?? '' })} · {money(Math.abs(c.amount), { currency: account.currency })}
            </Text>
          ))}
        </View>
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
