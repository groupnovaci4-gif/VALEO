/**
 * Budget automatique : DineroX propose une répartition du revenu selon une
 * méthode ; l'utilisateur ajuste chaque ligne avant de valider.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Banner, Button, Card, ChipGroup, Screen, Text, useToast } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { proposeBudget, type BudgetBucket } from '@/core/budget';
import { hasFeature } from '@/core/subscription';
import { personalBudget } from '@/core/personalBudget';
import { useIntelligence } from '@/hooks/useIntelligence';
import type { BudgetMethod } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';

const BUCKET_META: Record<BudgetBucket, { icon: string; color: string; categoryIds: string[]; envKey: TKey }> = {
  housing: { icon: 'home', color: '#6366F1', categoryIds: ['cat_housing', 'cat_internet'], envKey: 'env.housing' },
  food: { icon: 'restaurant', color: '#F59E0B', categoryIds: ['cat_food'], envKey: 'env.food' },
  transport: { icon: 'car', color: '#0EA5E9', categoryIds: ['cat_transport'], envKey: 'env.transport' },
  family: { icon: 'heart', color: '#EC4899', categoryIds: ['cat_family', 'cat_education', 'cat_health'], envKey: 'env.family' },
  savings: { icon: 'wallet', color: '#16A34A', categoryIds: ['cat_savings'], envKey: 'env.savings' },
  project: { icon: 'rocket', color: '#8B5CF6', categoryIds: ['cat_investment'], envKey: 'env.project' },
  free: { icon: 'sparkles', color: '#94A3B8', categoryIds: ['cat_leisure', 'cat_clothing', 'cat_communication', 'cat_other'], envKey: 'env.free' },
  needs: { icon: 'home', color: '#6366F1', categoryIds: ['cat_housing', 'cat_food', 'cat_transport', 'cat_health', 'cat_internet'], envKey: 'budget.bucket.needs' },
  wants: { icon: 'sparkles', color: '#F97316', categoryIds: ['cat_leisure', 'cat_clothing', 'cat_communication', 'cat_other'], envKey: 'budget.bucket.wants' },
};

function AutoBudget() {
  const { t } = useI18n();
  const toast = useToast();
  const { plan } = useApp();
  const money = useMoney();
  const { data, currency, month, now } = useFinance();
  const actions = useActions();
  const { profile } = useApp();
  const { snapshot } = useIntelligence();
  const lastIncome = useMemo(() => data.recurring.filter((r) => r.type === 'income' && r.active).reduce((s, r) => s + r.amount, 0), [data.recurring]);
  const [income, setIncome] = useState<number | null>(lastIncome || snapshot.income.value || null);
  const activeEnvelopes = data.envelopes.filter((e) => e.active && !e.deleted);
  // Budget personnalisé par défaut dès qu'il y a des enveloppes : pas de règle universelle imposée.
  const [method, setMethod] = useState<BudgetMethod | 'personal'>(activeEnvelopes.length ? 'personal' : 'envelopes');
  const [personalOverrides, setPersonalOverrides] = useState<Record<string, number | null>>({});
  const personal = useMemo(
    () => personalBudget({ envelopes: data.envelopes, transactions: data.transactions, currency, now, income: income ?? 0, goalNeeds: snapshot.goalNeeds, financial: profile?.financial }),
    [data.envelopes, data.transactions, currency, now, income, snapshot.goalNeeds, profile?.financial],
  );
  const [overrides, setOverrides] = useState<Partial<Record<BudgetBucket, number | null>>>({});
  const lines = useMemo(() => (method === 'personal' ? [] : proposeBudget(income ?? 0, method, currency)), [income, method, currency]);
  const amounts = lines.map((l) => ({ ...l, amount: overrides[l.bucket] ?? l.amount }));
  const personalAmounts = personal.lines.map((l) => ({ ...l, amount: personalOverrides[l.envelopeId] ?? l.suggested }));
  const total = method === 'personal' ? personalAmounts.reduce((s, l) => s + (l.amount ?? 0), 0) : amounts.reduce((s, l) => s + (l.amount ?? 0), 0);
  const diff = (income ?? 0) - total;

  if (!hasFeature(plan, 'auto_budget')) {
    return (
      <Screen back title={t('budget.auto.title')}>
        <UpgradeCard feature="auto_budget" text={t('budget.auto.hint')} />
      </Screen>
    );
  }

  const apply = () => {
    if (method === 'personal') {
      actions.applyBudget(
        month,
        'custom',
        income ?? 0,
        personalAmounts.map((l) => {
          const e = data.envelopes.find((x) => x.id === l.envelopeId)!;
          return { envelopeId: e.id, name: e.name, icon: e.icon, color: e.color, amount: l.amount ?? 0, categoryIds: e.categoryIds };
        }),
      );
      toast.show(t('budget.auto.applied'));
      goBack();
      return;
    }
    actions.applyBudget(
      month,
      method,
      income ?? 0,
      amounts.map((l) => {
        const meta = BUCKET_META[l.bucket];
        // Réutilise l'enveloppe existante qui couvre la même catégorie principale.
        const existing = data.envelopes.find((e) => e.categoryIds.includes(meta.categoryIds[0]));
        return { envelopeId: existing?.id ?? null, name: t(meta.envKey), icon: meta.icon, color: meta.color, amount: l.amount ?? 0, categoryIds: meta.categoryIds };
      }),
    );
    toast.show(t('budget.auto.applied'));
    goBack();
  };

  return (
    <Screen back title={t('budget.auto.title')} footer={<Button full label={t('budget.auto.apply')} disabled={method === 'personal' ? total <= 0 : !income || diff < 0} onPress={apply} />}>
      <Text tone="muted" style={{ marginBottom: 14 }}>
        {t('budget.auto.hint')}
      </Text>
      <AmountField label={t('budget.auto.income')} value={income} onChange={(v) => (setIncome(v), setOverrides({}))} currency={currency} big />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('budget.auto.method')}
      </Text>
      <ChipGroup
        options={[
          ...(activeEnvelopes.length ? [{ value: 'personal' as const, label: t('budget.personalRecommended'), icon: 'sparkles' }] : []),
          ...(['envelopes', '50_30_20', 'zero_based'] as BudgetMethod[]).map((m) => ({ value: m, label: t(`budget.method.${m}` as TKey) })),
        ]}
        value={method}
        onChange={(m) => (setMethod(m), setOverrides({}), setPersonalOverrides({}))}
      />
      {method === 'personal' ? (
        <Card>
          <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
            {t('budget.personalHint')}
          </Text>
          {personalAmounts.map((l) => {
            const e = data.envelopes.find((x) => x.id === l.envelopeId)!;
            return (
              <AmountField
                key={l.envelopeId}
                label={e.name}
                hint={t(`budget.basis.${l.basis}` as TKey)}
                value={l.amount}
                onChange={(v) => setPersonalOverrides((o) => ({ ...o, [l.envelopeId]: v }))}
                currency={currency}
              />
            );
          })}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text weight="700">{t('budget.auto.total')}</Text>
            <Text weight="700">{money(total)}</Text>
          </View>
          {personal.adjusted ? <Banner tone="warning" icon="information-circle-outline" text={t('budget.personalAdjusted')} /> : null}
          {diff !== 0 && income ? <Banner tone={diff < 0 ? 'danger' : 'info'} text={`${t('budget.auto.diff')} : ${money(diff, { signed: true })}`} /> : null}
        </Card>
      ) : null}
      {method !== 'personal' && amounts.length ? (
        <Card>
          {amounts.map((l) => (
            <AmountField key={l.bucket} label={t(`budget.bucket.${l.bucket}` as TKey)} value={l.amount} onChange={(v) => setOverrides((o) => ({ ...o, [l.bucket]: v }))} currency={currency} />
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text weight="700">{t('budget.auto.total')}</Text>
            <Text weight="700">{money(total)}</Text>
          </View>
          {diff !== 0 ? <Banner tone={diff < 0 ? 'danger' : 'info'} text={`${t('budget.auto.diff')} : ${money(diff, { signed: true })}`} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(AutoBudget);
