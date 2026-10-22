/**
 * Détail d'une enveloppe (design system v2) : reste en grand, état ÉCRIT avec une
 * icône (jamais la couleur seule), barre + %, historique et opérations du mois.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DesignV2, useTheme } from '@/theme';
import { monthName, useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Button, Card, EmptyState, Icon, ProgressBar, Screen, SectionHeader, Text, levelTone } from '@/components/ui';
import { BudgetHistoryBars } from '@/components/charts';
import { TransactionRow } from '@/features/rows';
import { LEVEL_ICON } from '@/features/budget/EnvelopeCard';
import { envelopeHistory, resolveEnvelopeId } from '@/core/budget';
import { lastMonths, monthKey } from '@/core/dates';
import { sortTransactions } from '@/core/transactions';
import { can } from '@/core/permissions';
import { withSpaceReady } from '@/components/SpaceReady';
import { isTontineContribution } from '@/core/savingsFlows';
import { shareOfDeclared } from '@/core/allowance';

function EnvelopeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const { role, profile } = useApp();
  const money = useMoney();
  const { data, envelopes, currency, now, month, envelopeSoon, spaceKind } = useFinance();
  const status = envelopes.find((s) => s.envelope.id === id);
  const history = useMemo(() => {
    if (!status) return [];
    return envelopeHistory(status.envelope, data.envelopes, data.transactions, data.budgets, lastMonths(6, now), currency);
  }, [status, data, now, currency]);
  const txs = useMemo(
    // Une cotisation de tontine n'est pas une dépense de l'enveloppe (cercle fermé).
    () => sortTransactions(data.transactions.filter((tx) => tx.type === 'expense' && !isTontineContribution(tx) && monthKey(tx.date) === month && resolveEnvelopeId(tx, data.envelopes) === id)),
    [data, id, month],
  );
  if (!status) {
    return (
      <Screen back>
        <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} />
      </Screen>
    );
  }
  const short = (m: string) => monthName(lang, Number(m.slice(5)) - 1).slice(0, 4);
  const upcoming = envelopeSoon[status.envelope.id] ?? 0;
  const declaredShare = shareOfDeclared(status.budget, profile?.financial?.monthlyIncome ?? null, spaceKind);
  const over = status.remaining < 0;
  const state = t(`env.state.${status.level}` as TKey);
  const stateColor = status.level === 'critical' ? colors.danger : status.level === 'ok' ? colors.success : colors.warning;
  return (
    <Screen back title={status.envelope.name} right={can(role, 'update', 'envelopes') ? <Button small variant="tertiary" icon="create-outline" label={t('common.edit')} onPress={() => router.push(`/envelopes/edit?id=${id}`)} /> : undefined}>
      <Card style={{ gap: 8 }}>
        <Text variant="small" tone="muted">
          {t('budget.remaining')}
        </Text>
        <Amount text={money(status.remaining)} size="L" tone={over ? 'danger' : 'default'} />
        {over ? (
          <Text variant="label" tone="danger">
            {t('env.over', { amount: money(-status.remaining) })}
          </Text>
        ) : null}
        <ProgressBar value={status.percent} tone={levelTone(status.level)} height={10} label={status.envelope.name} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={LEVEL_ICON[status.level]} size={18} color={stateColor} />
            <Text variant="small" weight="600" style={{ color: stateColor }}>
              {state}
            </Text>
          </View>
          <Text variant="small" tone="muted">
            {t('env.consumed', { percent: status.percent })}
          </Text>
        </View>
        <Text variant="small" tone="muted">
          {t('env.of', { spent: money(status.spent), budget: money(status.budget) })}
        </Text>
        {/* Refonte finale C2 : la liste du Budget est en bulles ; ces deux précisions restent visibles ici. */}
        {upcoming > 0 ? (
          <Text variant="small" tone="muted">
            {t('env.upcoming', { amount: money(upcoming) })}
          </Text>
        ) : null}
        {declaredShare !== null ? (
          <Text variant="caption" tone="subtle">
            {t('env.shareOfDeclared', { percent: lang === 'en' ? declaredShare.toFixed(2) : declaredShare.toFixed(2).replace('.', ',') })}
          </Text>
        ) : null}
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
      <Card>{txs.length ? txs.map((tx) => <TransactionRow key={tx.id} tx={tx} />) : <EmptyState icon="receipt-outline" title={t('tx.empty.title')} />}</Card>
    </Screen>
  );
}

const Ready = withSpaceReady(EnvelopeDetail);

export default function EnvelopeDetailScreen() {
  return (
    <DesignV2>
      <Ready />
    </DesignV2>
  );
}
