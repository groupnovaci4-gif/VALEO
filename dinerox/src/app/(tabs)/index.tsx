/**
 * Tableau de bord : « je comprends immédiatement ma situation ».
 * Solde disponible, flux du mois, épargne, budget restant, alertes,
 * enveloppes, objectifs prioritaires, dernières opérations.
 */
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { brand } from '@/config/brand';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Banner, Button, Card, EmptyState, Icon, IconButton, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { EnvelopeRow, GoalCard, InsightCard, SpaceSwitcher, TransactionRow } from '@/features/rows';
import { Logo } from '@/components/Logo';
import { goalPlanFor, sortGoals } from '@/core/goals';
import { sortTransactions } from '@/core/transactions';
import { formatMoney, type CurrencyCode } from '@/core/money';
import { resendVerification } from '@/services/auth';

export default function Home() {
  const { colors, radius, shadow } = useTheme();
  const { t } = useI18n();
  const { profile, user, mode } = useApp();
  const money = useMoney();
  const toast = useToast();
  const f = useFinance();
  const { data, position, flows, envelopes, budget, insights, now } = f;

  const goals = useMemo(
    () => sortGoals(data.goals.filter((g) => g.status === 'active')).slice(0, 3).map((g) => ({ g, plan: goalPlanFor(g, data.goalContributions, now) })),
    [data.goals, data.goalContributions, now],
  );
  const recent = useMemo(() => sortTransactions(data.transactions).slice(0, 5), [data.transactions]);
  const others = Object.entries(position.otherCurrencies).filter(([, v]) => v !== 0);

  return (
    <Screen
      right={
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="notifications-outline" label={t('notif.title')} onPress={() => router.push('/notifications')} />
          <IconButton icon="settings-outline" label={t('set.title')} onPress={() => router.push('/settings')} />
        </View>
      }
      leading={<Logo size={36} />}
      title={profile?.firstName ? t('home.hello', { name: profile.firstName }) : t('home.helloAnon')}
    >
      <SpaceSwitcher />
      {mode === 'local' ? <Banner tone="info" icon="phone-portrait-outline" text={t('sync.localMode')} /> : null}
      {mode === 'firebase' && user && !user.emailVerified ? (
        <Banner
          tone="warning"
          icon="mail-unread-outline"
          text={t('auth.verify.banner')}
          action={t('auth.verify.resend')}
          onAction={() => void resendVerification().then(() => toast.show(t('auth.verify.sent')))}
        />
      ) : null}

      {/* Héro : solde disponible */}
      <View style={{ backgroundColor: colors.hero, borderRadius: radius.xl, padding: 22, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(20,184,166,0.28)', ...shadow.glowGreen }}>
        <Text variant="small" tone="heroMuted">
          {t('home.available')}
        </Text>
        <Text variant="display" tone="onHero" style={{ marginVertical: 4 }} accessibilityRole="summary">
          {money(position.free)}
        </Text>
        <Text variant="caption" tone="heroMuted">
          {t('home.availableHint')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <HeroAction icon="arrow-down" label={t('tx.income')} onPress={() => router.push('/transaction/new?type=income')} />
          <HeroAction icon="arrow-up" label={t('tx.expense')} onPress={() => router.push('/transaction/new?type=expense')} />
          <HeroAction icon="swap-horizontal" label={t('tx.transfer')} onPress={() => router.push('/transaction/new?type=transfer')} />
        </View>
      </View>

      {data.accounts.length === 0 ? (
        <Card style={{ marginBottom: 14 }}>
          <EmptyState emoji="👛" title={t('home.noAccount.title')} body={t('home.noAccount.body')} action={t('home.noAccount.cta')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : null}

      {/* Indicateurs du mois */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <Stat label={t('home.income')} value={money(flows.income)} tone="income" icon="arrow-down" />
        <Stat label={t('home.expense')} value={money(flows.expense)} tone="expense" icon="arrow-up" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label={t('home.savings')} value={money(position.savings)} tone="success" icon="wallet" onPress={() => router.push('/savings')} />
        <Stat label={t('home.budgetLeft')} value={money(budget.remaining)} tone={budget.remaining < 0 ? 'danger' : 'info'} icon="pie-chart" onPress={() => router.push('/budget')} />
      </View>
      {position.allocatedToGoals > 0 ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
          {t('home.goalsAllocated')} : {money(position.allocatedToGoals)}
        </Text>
      ) : null}
      {others.length ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
          {t('home.otherCurrencies')} : {others.map(([c, v]) => formatMoney(v, c as CurrencyCode)).join(' · ')}
        </Text>
      ) : null}

      {/* Assistant */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/assistant')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.aiBg, borderRadius: radius.lg, padding: 14, marginTop: 14 }}
      >
        <Icon name="sparkles" size={22} color={colors.ai} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" tone="ai">
            {t('home.askAssistant')}
          </Text>
          <Text variant="caption" tone="muted">
            {t('home.askAssistantHint')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.ai} />
      </Pressable>

      {insights.length ? (
        <>
          <SectionHeader title={t('home.alerts')} action={insights.length > 3 ? t('common.seeAll') : undefined} onAction={() => router.push('/notifications')} />
          {insights.slice(0, 3).map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </>
      ) : null}

      <SectionHeader title={t('home.envelopes')} action={t('common.manage')} onAction={() => router.push('/budget')} />
      <Card>
        {envelopes.length ? (
          envelopes.slice(0, 5).map((s) => <EnvelopeRow key={s.envelope.id} s={s} />)
        ) : (
          <EmptyState title={t('env.empty.title')} body={t('env.empty.body', {})} action={t('env.empty.cta')} onAction={() => router.push('/budget/auto')} />
        )}
      </Card>

      <SectionHeader title={t('home.goals')} action={t('common.seeAll')} onAction={() => router.push('/goals')} />
      {goals.length ? (
        goals.map(({ g, plan }) => <GoalCard key={g.id} goal={g} plan={plan} compact />)
      ) : (
        <Card>
          <EmptyState title={t('goal.empty.title')} body={t('goal.empty.body')} action={t('goal.empty.cta')} onAction={() => router.push('/goals/new')} />
        </Card>
      )}

      <SectionHeader title={t('home.recent')} action={recent.length ? t('common.seeAll') : undefined} onAction={() => router.push('/transactions')} />
      <Card>
        {recent.length ? (
          recent.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
        ) : (
          <EmptyState emoji="🧾" title={t('tx.empty.title')} body={t('tx.empty.body')} action={t('quick.expense')} onAction={() => router.push('/transaction/new?type=expense')} />
        )}
      </Card>
      {recent.length ? <Button variant="ghost" label={t('rep.title')} icon="bar-chart-outline" onPress={() => router.push('/reports')} style={{ marginTop: 12 }} /> : null}
    </Screen>
  );
}

function HeroAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, backgroundColor: 'rgba(20,184,166,0.16)', borderWidth: 1, borderColor: 'rgba(20,184,166,0.35)', opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={16} color={brand.colors.green} />
      <Text variant="small" weight="600" tone="onHero">
        {label}
      </Text>
    </Pressable>
  );
}

function Stat({ label, value, tone, icon, onPress }: { label: string; value: string; tone: 'income' | 'expense' | 'success' | 'info' | 'danger'; icon: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const color = { income: colors.income, expense: colors.expense, success: colors.success, info: colors.info, danger: colors.danger }[tone];
  return (
    <Card style={{ flex: 1, padding: 14 }} onPress={onPress} accessibilityLabel={`${label} ${value}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon name={icon} size={14} color={color} />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="numericLg" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}
