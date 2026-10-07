import React, { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { monthName, useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, EmptyState, ProgressBar, Screen, SectionHeader, Text, levelTone } from '@/components/ui';
import { BudgetHistoryBars } from '@/components/charts';
import { TransactionRow } from '@/features/rows';
import { envelopeHistory, resolveEnvelopeId } from '@/core/budget';
import { lastMonths, monthKey } from '@/core/dates';
import { sortTransactions } from '@/core/transactions';
import { can } from '@/core/permissions';
import { withSpaceReady } from '@/components/SpaceReady';

function EnvelopeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const { data, envelopes, currency, now, month } = useFinance();
  const status = envelopes.find((s) => s.envelope.id === id);
  const history = useMemo(() => {
    if (!status) return [];
    return envelopeHistory(status.envelope, data.envelopes, data.transactions, data.budgets, lastMonths(6, now), currency);
  }, [status, data, now, currency]);
  const txs = useMemo(
    () => sortTransactions(data.transactions.filter((tx) => tx.type === 'expense' && monthKey(tx.date) === month && resolveEnvelopeId(tx, data.envelopes) === id)),
    [data, id, month],
  );
  if (!status) {
    return (
      <Screen back>
        <EmptyState emoji="✉️" title={t('env.empty.title')} />
      </Screen>
    );
  }
  const short = (m: string) => monthName(lang, Number(m.slice(5)) - 1).slice(0, 4);
  return (
    <Screen back title={status.envelope.name} right={can(role, 'update', 'envelopes') ? <Button small variant="ghost" icon="create-outline" label={t('common.edit')} onPress={() => router.push(`/envelopes/edit?id=${id}`)} /> : undefined}>
      <Card>
        <Text variant="h2">{money(status.remaining)}</Text>
        <Text tone="muted" style={{ marginBottom: 10 }}>
          {status.remaining < 0 ? t('env.over', { amount: money(-status.remaining) }) : t('budget.remaining')}
        </Text>
        <ProgressBar value={status.percent} tone={levelTone(status.level)} height={10} />
        <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
          {t('env.of', { spent: money(status.spent), budget: money(status.budget) })} · {status.percent} %
        </Text>
      </Card>
      <SectionHeader title={t('env.history')} />
      <Card>
        <BudgetHistoryBars
          points={history.map((h) => ({ label: short(h.month), budget: h.budget, spent: h.spent }))}
          format={(n) => money(n)}
          summary={history.map((h) => `${short(h.month)} ${money(h.spent)} / ${money(h.budget)}`).join(', ')}
        />
      </Card>
      <SectionHeader title={t('tx.title')} action={t('history.title')} onAction={() => router.push('/transactions?from=envelope')} />
      <Card>{txs.length ? txs.map((tx) => <TransactionRow key={tx.id} tx={tx} />) : <EmptyState title={t('tx.empty.title')} />}</Card>
    </Screen>
  );
}

export default withSpaceReady(EnvelopeDetail);
