/**
 * Composants métier réutilisables : opération, enveloppe, objectif,
 * compte, alerte, sélecteur d'espace, verrou de formule.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Icon, IconCircle, ProgressBar, Row, Sheet, Text, levelTone } from '@/components/ui';
import { useAccountLabel, useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { useInsightText } from '@/hooks/useInsightText';
import { useApp } from '@/store/app';
import type { Account, Goal, Transaction } from '@/core/types';
import type { EnvelopeStatus } from '@/core/budget';
import type { GoalPlan } from '@/core/goals';
import type { Insight } from '@/core/insights';
import { minimumPlanFor, type Feature } from '@/core/subscription';

export function TransactionRow({ tx, onPress }: { tx: Transaction; onPress?: () => void }) {
  const { colors } = useTheme();
  const { t, date } = useI18n();
  const money = useMoney();
  const cats = useCategoryLabels();
  const accountLabel = useAccountLabel();
  const meta = tx.type === 'transfer' ? { name: t('tx.transfer'), icon: 'swap-horizontal', color: colors.info } : cats.meta(tx.categoryId);
  const title = tx.payee || meta.name;
  const sub = tx.type === 'transfer' ? `${accountLabel(tx.accountId)} → ${accountLabel(tx.toAccountId)}` : `${meta.name} · ${accountLabel(tx.accountId)}`;
  const amount = tx.type === 'expense' ? `-${money(tx.amount, { currency: tx.currency })}` : tx.type === 'income' ? money(tx.amount, { currency: tx.currency, signed: true }) : money(tx.amount, { currency: tx.currency });
  const tone = tx.type === 'expense' ? 'expense' : tx.type === 'income' ? 'income' : 'muted';
  return (
    <Row
      title={title}
      subtitle={`${sub} · ${date(tx.date)}`}
      left={<IconCircle icon={meta.icon} color={meta.color} />}
      right={
        <Text variant="numeric" weight="600" tone={tone}>
          {amount}
        </Text>
      }
      onPress={onPress ?? (() => router.push(`/transaction/${tx.id}`))}
    />
  );
}

export function EnvelopeRow({ s, onPress }: { s: EnvelopeStatus; onPress?: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  return (
    <Pressable accessibilityRole="button" onPress={onPress ?? (() => router.push(`/envelopes/${s.envelope.id}`))} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <IconCircle icon={s.envelope.icon} color={s.envelope.color} size={38} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {s.envelope.name}
          </Text>
          <Text variant="small" tone={s.remaining < 0 ? 'danger' : 'muted'}>
            {s.remaining < 0 ? t('env.over', { amount: money(-s.remaining) }) : t('env.left', { amount: money(s.remaining) })}
          </Text>
        </View>
        <ProgressBar value={s.percent} tone={levelTone(s.level)} label={s.envelope.name} />
        <Text variant="caption" tone="subtle">
          {t('env.of', { spent: money(s.spent), budget: money(s.budget) })} · {s.percent} %
        </Text>
      </View>
    </Pressable>
  );
}

export function GoalCard({ goal, plan, compact }: { goal: Goal; plan: GoalPlan; compact?: boolean }) {
  const { t, monthYear } = useI18n();
  const money = useMoney();
  const { colors } = useTheme();
  const tone = plan.reached ? 'success' : plan.overdue ? 'danger' : 'primary';
  return (
    <Card onPress={() => router.push(`/goals/${goal.id}`)} accessibilityLabel={goal.name} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <IconCircle emoji={goal.icon} color={colors.primary} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {goal.name}
          </Text>
          <Text variant="small" tone="muted">
            {goal.targetAmount > 0 ? t('goal.progress', { saved: money(plan.saved), target: money(plan.target) }) : t('goal.setAmount')}
          </Text>
        </View>
        <Text variant="h3">{plan.percent} %</Text>
      </View>
      <ProgressBar value={plan.percent} tone={tone} height={10} label={goal.name} />
      {!compact && goal.targetAmount > 0 ? (
        <View style={{ marginTop: 10, gap: 2 }}>
          <Text variant="small">{t('goal.left', { amount: money(plan.remaining) })}</Text>
          {goal.targetDate ? (
            <Text variant="small" tone="muted">
              {t('goal.planned.date', { date: monthYear(goal.targetDate) })}
            </Text>
          ) : null}
          {plan.requiredMonthly ? (
            <Text variant="small" tone="muted">
              {t('goal.recommended', { amount: money(plan.requiredMonthly) })}
            </Text>
          ) : plan.estimatedDate && !plan.reached ? (
            <Text variant="small" tone="muted">
              {t('goal.estimatedDate', { date: monthYear(plan.estimatedDate) })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export function AccountRow({ account, balance, onPress }: { account: Account; balance: number; onPress?: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  return (
    <Row
      title={account.name}
      subtitle={`${t(`acc.type.${account.type}`)}${account.active ? '' : ` · ${t('common.inactive')}`}`}
      left={<IconCircle icon={account.icon} color={account.color} />}
      right={
        <Text variant="numeric" weight="600" tone={balance < 0 ? 'danger' : 'default'}>
          {money(balance, { currency: account.currency })}
        </Text>
      }
      onPress={onPress ?? (() => router.push(`/accounts/${account.id}`))}
      chevron
    />
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
  const { colors, radius } = useTheme();
  const render = useInsightText();
  const map = {
    info: [colors.infoBg, colors.info, 'information-circle'],
    positive: [colors.successBg, colors.success, 'sparkles'],
    warning: [colors.warningBg, colors.warning, 'warning'],
    danger: [colors.dangerBg, colors.danger, 'alert-circle'],
  } as const;
  const [bg, fg, icon] = map[insight.severity];
  const onPress = insight.ref
    ? () => {
        const r = insight.ref!;
        const path = r.type === 'envelope' ? `/envelopes/${r.id}` : r.type === 'goal' ? `/goals/${r.id}` : r.type === 'debt' ? `/debts/${r.id}` : r.type === 'transaction' ? `/transaction/${r.id}` : null;
        if (path) router.push(path as never);
      }
    : undefined;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: bg, borderRadius: radius.md, padding: 12, marginBottom: 8 }}>
      <Icon name={icon} size={18} color={fg} />
      <Text variant="small" style={{ flex: 1, color: colors.text }}>
        {render(insight)}
      </Text>
    </Pressable>
  );
}

/** Bascule entre « Mes finances personnelles » et les espaces familiaux. */
export function SpaceSwitcher() {
  const { spaces, activeSpace, setActiveSpace } = useApp();
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  if (spaces.length <= 1 || !activeSpace) return null;
  const label = (id: string, kind: string, name: string) => (id.startsWith('demo_') ? `🧪 ${name}` : kind === 'personal' ? t('fam.private') : `👨‍👩‍👧 ${name}`);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('fam.switch')} : ${label(activeSpace.id, activeSpace.kind, activeSpace.name)}`}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginBottom: 12 }}
      >
        <Text variant="small" weight="600">
          {label(activeSpace.id, activeSpace.kind, activeSpace.name)}
        </Text>
        <Icon name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('fam.switch')}>
        {spaces.map((s) => (
          <Row
            key={s.id}
            title={label(s.id, s.kind, s.name)}
            right={s.id === activeSpace.id ? <Icon name="checkmark-circle" size={22} color={colors.success} /> : undefined}
            onPress={() => {
              setActiveSpace(s.id);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** Fonctionnalité réservée à une formule supérieure. */
export function UpgradeCard({ feature, text }: { feature: Feature; text: string }) {
  const { t } = useI18n();
  const plan = minimumPlanFor(feature);
  return (
    <Card style={{ alignItems: 'center', gap: 10, marginVertical: 12 }}>
      <Badge tone="ai" label={t('sub.locked', { plan: t(plan === 'family' ? 'sub.family' : 'sub.plus') })} />
      <Text tone="muted" align="center">
        {text}
      </Text>
      <Button label={t('common.upgrade')} icon="sparkles" onPress={() => router.push('/subscription')} />
    </Card>
  );
}
