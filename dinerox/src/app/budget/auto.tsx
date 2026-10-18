/**
 * Budget automatique : DineroX propose une répartition du revenu selon une
 * méthode ; l'utilisateur ajuste chaque ligne avant de valider.
 * Design system v2 : une seule action principale (« Appliquer ce budget », en pied),
 * total et écart lisibles, couleurs d'enveloppes issues des jetons (`envelopeDefaults`).
 */
import { useRunAction } from '@/hooks/useRunAction';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { DesignV2, envelopeDefaults } from '@/theme';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, AmountField, Banner, Button, Card, ChipGroup, Screen, Text, useToast } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { proposeBudget, type BudgetBucket } from '@/core/budget';
import { hasFeature } from '@/core/subscription';
import { personalBudget } from '@/core/personalBudget';
import { useIntelligence } from '@/hooks/useIntelligence';
import type { BudgetMethod } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';
import { ListenButton } from '@/features/coach/ListenButton';

const BUCKET_META: Record<BudgetBucket, { icon: string; color: string; categoryIds: string[]; envKey: TKey }> = {
  housing: { icon: 'home', color: envelopeDefaults.housing, categoryIds: ['cat_housing', 'cat_internet'], envKey: 'env.housing' },
  food: { icon: 'restaurant', color: envelopeDefaults.food, categoryIds: ['cat_food'], envKey: 'env.food' },
  transport: { icon: 'car', color: envelopeDefaults.transport, categoryIds: ['cat_transport'], envKey: 'env.transport' },
  family: { icon: 'heart', color: envelopeDefaults.family, categoryIds: ['cat_family', 'cat_education', 'cat_health'], envKey: 'env.family' },
  savings: { icon: 'wallet', color: envelopeDefaults.savings, categoryIds: ['cat_savings'], envKey: 'env.savings' },
  project: { icon: 'rocket', color: envelopeDefaults.project, categoryIds: ['cat_investment'], envKey: 'env.project' },
  free: { icon: 'sparkles', color: envelopeDefaults.free, categoryIds: ['cat_leisure', 'cat_clothing', 'cat_communication', 'cat_other'], envKey: 'env.free' },
  needs: { icon: 'home', color: envelopeDefaults.housing, categoryIds: ['cat_housing', 'cat_food', 'cat_transport', 'cat_health', 'cat_internet'], envKey: 'budget.bucket.needs' },
  wants: { icon: 'sparkles', color: envelopeDefaults.wants, categoryIds: ['cat_leisure', 'cat_clothing', 'cat_communication', 'cat_other'], envKey: 'budget.bucket.wants' },
};

function AutoBudget() {
  const { t } = useI18n();
  const toast = useToast();
  const { plan } = useApp();
  const money = useMoney();
  const { data, currency, month, now, position } = useFinance();
  const actions = useActions();
  const run = useRunAction();
  const { profile } = useApp();
  const { snapshot } = useIntelligence();
  // Argent disponible v2 (§9) : « Montant à répartir » prérempli avec l'argent disponible D, jamais avec le déclaré.
  const [income, setIncome] = useState<number | null>(position.free > 0 ? position.free : null);
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
      const ok = run(() => actions.applyBudget(
        month,
        'custom',
        income ?? 0,
        personalAmounts.map((l) => {
          const e = data.envelopes.find((x) => x.id === l.envelopeId)!;
          return { envelopeId: e.id, name: e.name, icon: e.icon, color: e.color, amount: l.amount ?? 0, categoryIds: e.categoryIds };
        }),
      ));
      if (!ok) return;
      toast.show(t('budget.auto.applied'));
      goBack();
      return;
    }
    const ok = run(() => actions.applyBudget(
      month,
      method,
      income ?? 0,
      amounts.map((l) => {
        const meta = BUCKET_META[l.bucket];
        // Réutilise l'enveloppe existante qui couvre la même catégorie principale.
        const existing = data.envelopes.find((e) => e.categoryIds.includes(meta.categoryIds[0]));
        return { envelopeId: existing?.id ?? null, name: t(meta.envKey), icon: meta.icon, color: meta.color, amount: l.amount ?? 0, categoryIds: meta.categoryIds };
      }),
    ));
    if (!ok) return;
    toast.show(t('budget.auto.applied'));
    goBack();
  };

  return (
    <Screen back title={t('budget.auto.title')} footer={<Button full label={t('budget.auto.apply')} disabled={method === 'personal' ? total <= 0 : !income || diff < 0} onPress={apply} />}>
      <Text tone="muted" style={{ marginBottom: 16 }}>
        {t('budget.auto.hint')}
      </Text>
      <AmountField label={t('budget.auto.income')} value={income} onChange={(v) => (setIncome(v), setOverrides({}))} currency={currency} big />
      <Text variant="label" style={{ marginBottom: 8 }}>
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
          {/* « Écouter » sous le texte : à 320 dp, à côté, il réduisait l'explication à une colonne étroite. */}
          <View style={{ alignItems: 'flex-start', gap: 4, marginBottom: 12 }}>
            <Text variant="small" tone="muted">
              {t('budget.personalHint')}
            </Text>
            {/* Lecture de la proposition affichée (enveloppes, montants, total). */}
            <ListenButton
              text={[t('budget.personalHint'), ...personalAmounts.map((l) => `${data.envelopes.find((x) => x.id === l.envelopeId)?.name ?? ''} : ${money(l.amount ?? 0)}`), `${t('budget.auto.total')} : ${money(total)}`]}
            />
          </View>
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
          <TotalLine label={t('budget.auto.total')} value={money(total)} />
          {personal.adjusted ? <Banner tone="warning" icon="information-circle-outline" text={t('budget.personalAdjusted')} /> : null}
          {diff !== 0 && income ? <Banner tone={diff < 0 ? 'danger' : 'info'} icon={diff < 0 ? 'alert-circle' : 'information-circle-outline'} text={`${t('budget.auto.diff')} : ${money(diff, { signed: true })}`} /> : null}
        </Card>
      ) : null}
      {method !== 'personal' && amounts.length ? (
        <Card>
          <View style={{ alignItems: 'flex-end' }}>
            <ListenButton text={[...amounts.map((l) => `${t(`budget.bucket.${l.bucket}` as TKey)} : ${money(l.amount ?? 0)}`), `${t('budget.auto.total')} : ${money(total)}`]} />
          </View>
          {amounts.map((l) => (
            <AmountField key={l.bucket} label={t(`budget.bucket.${l.bucket}` as TKey)} value={l.amount} onChange={(v) => setOverrides((o) => ({ ...o, [l.bucket]: v }))} currency={currency} />
          ))}
          <TotalLine label={t('budget.auto.total')} value={money(total)} />
          {diff !== 0 ? <Banner tone={diff < 0 ? 'danger' : 'info'} icon={diff < 0 ? 'alert-circle' : 'information-circle-outline'} text={`${t('budget.auto.diff')} : ${money(diff, { signed: true })}`} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

/** Total réparti : libellé à gauche, montant à droite (le montant passe dessous si la place manque). */
function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, paddingTop: 4, marginBottom: 12 }}>
      <Text variant="bodyStrong">{label}</Text>
      <Amount text={value} size="M" />
    </View>
  );
}

const Ready = withSpaceReady(AutoBudget);

export default function AutoBudgetScreen() {
  return (
    <DesignV2>
      <Ready />
    </DesignV2>
  );
}
