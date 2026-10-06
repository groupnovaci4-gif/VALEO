/**
 * Tableau de bord : « je comprends immédiatement ma situation ».
 * Solde disponible, flux du mois, épargne, budget restant, alertes,
 * enveloppes, objectifs prioritaires, dernières opérations.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Badge, Banner, Button, Card, EmptyState, GradientCard, Icon, IconCircle, ProgressBar, Screen, SectionHeader, Text, levelTone, useToast } from '@/components/ui';
import { GoalCard, InsightCard, SpaceSwitcher, TransactionRow } from '@/features/rows';
import type { EnvelopeStatus } from '@/core/budget';
import { useIntelligence } from '@/hooks/useIntelligence';
import { RecommendationCard } from '@/features/Recommendation';
import { goalPlanFor, sortGoals } from '@/core/goals';
import { sortTransactions } from '@/core/transactions';
import { formatMoney, type CurrencyCode } from '@/core/money';
import { authErrorKey, resendVerification } from '@/services/auth';

export default function Home() {
  const { colors, radius } = useTheme();
  const { t, monthYear } = useI18n();
  const { profile, user, mode, online, activeSpace, signOutLocal } = useApp();
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

  const [hidden, setHidden] = useState(false);
  const { recommendations } = useIntelligence();
  const topRec = recommendations[0];
  // Montants masquables d'un geste (consultation en public).
  const show = (n: number) => (hidden ? '••••••' : money(n));
  const monthLabel = monthYear(now);

  return (
    <Screen brandSection={t('tab.home')}>
      <SpaceSwitcher />
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        <Text variant="h1" style={{ flexShrink: 1 }} numberOfLines={2}>
          {profile?.firstName ? t('home.hello', { name: profile.firstName }) : t('home.helloAnon')}
        </Text>
        <StatusChip label={mode === 'local' ? t('home.status.local') : online ? t('home.status.synced') : t('home.status.offline')} ok={mode === 'local' || online} />
      </View>
      <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14, maxWidth: '100%' }}>
        <Icon name="shield-checkmark-outline" size={14} color={colors.primary} />
        <Text variant="caption" weight="600" style={{ color: colors.primary, flexShrink: 1 }} numberOfLines={1}>
          {mode === 'local' ? t('home.secure.local') : t('home.secure.cloud')}
        </Text>
      </View>

      {activeSpace?.id.startsWith('demo_') ? (
        <Banner
          tone="info"
          icon="flask-outline"
          text={t('home.demoBanner')}
          action={mode === 'local' ? t('home.demoCta') : undefined}
          onAction={() => void signOutLocal().then(() => router.replace('/sign-up'))}
        />
      ) : null}
      {mode === 'firebase' && user && !user.emailVerified ? (
        <Banner
          tone="warning"
          icon="mail-unread-outline"
          text={t('auth.verify.banner')}
          action={t('auth.verify.resend')}
          onAction={() =>
            void resendVerification()
              .then(() => toast.show(t('auth.verify.sent')))
              .catch((e) => toast.show(t(authErrorKey(e)), 'error'))
          }
        />
      ) : null}

      {/* Carte principale : solde disponible */}
      <GradientCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="overline" tone="heroMuted" style={{ letterSpacing: 1.4 }}>
            {t('home.available').toUpperCase()}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? t('home.showAmounts') : t('home.hideAmounts')} onPress={() => setHidden((h) => !h)} hitSlop={12}>
            <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.heroMuted} />
          </Pressable>
        </View>
        <Text variant="display" tone="onHero" style={{ marginVertical: 6 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityRole="summary">
          {show(position.free)}
        </Text>
        <Text variant="small" tone="heroMuted">
          {t('home.availableHint')}
        </Text>
      </GradientCard>

      {/* Actions rapides */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <QuickTile icon="arrow-down" tone="income" label={t('tx.income')} sub={t('home.action.income.sub')} onPress={() => router.push('/transaction/new?type=income')} />
        <QuickTile icon="arrow-up" tone="expense" label={t('tx.expense')} sub={t('home.action.expense.sub')} onPress={() => router.push('/transaction/new?type=expense')} />
        <QuickTile icon="swap-horizontal" tone="info" label={t('tx.transfer')} sub={t('home.action.transfer.sub')} onPress={() => router.push('/transaction/new?type=transfer')} />
      </View>

      {/* Assistant */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.ai.title')}
        onPress={() => router.push('/assistant')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.aiBg, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkles" size={22} color={colors.onSecondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="bodyStrong">{t('home.ai.title')}</Text>
            <Badge tone="ai" label={t('home.ai.badge').toUpperCase()} />
          </View>
          <Text variant="small" tone="muted" numberOfLines={2}>
            {t('home.askAssistantHint')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {/* Intelligence financière : la recommandation la plus importante, à partir des données réelles. */}
      {topRec ? (
        <>
          <SectionHeader title={t('home.analysis')} action={t('common.seeAll')} onAction={() => router.push('/analysis')} />
          <RecommendationCard r={topRec} />
        </>
      ) : null}

      {data.accounts.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState emoji="👛" title={t('home.noAccount.title')} body={t('home.noAccount.body')} action={t('home.noAccount.cta')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : null}

      {/* Mois en cours */}
      <SectionHeader title={t('home.month')} action={monthLabel} onAction={() => router.push('/reports')} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <Stat label={t('home.stat.income')} sub={t('home.stat.income.sub')} value={show(flows.income)} tone="income" icon="arrow-down" onPress={() => router.push('/transactions')} />
        <Stat label={t('home.stat.expense')} sub={t('home.stat.expense.sub')} value={show(flows.expense)} tone="expense" icon="arrow-up" onPress={() => router.push('/transactions')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label={t('home.stat.savings')} sub={t('home.stat.savings.sub')} value={show(position.savings)} tone="ai" icon="wallet" onPress={() => router.push('/savings')} />
        <Stat label={t('home.stat.budget')} sub={t('home.stat.budget.sub')} value={show(budget.remaining)} tone={budget.remaining < 0 ? 'expense' : 'primary'} icon="pie-chart" onPress={() => router.push('/budget')} />
      </View>
      {position.allocatedToGoals > 0 ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
          {t('home.goalsAllocated')} : {show(position.allocatedToGoals)}
        </Text>
      ) : null}
      {others.length ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
          {t('home.otherCurrencies')} : {others.map(([c, v]) => formatMoney(v, c as CurrencyCode)).join(' · ')}
        </Text>
      ) : null}

      {insights.length ? (
        <>
          <SectionHeader title={t('home.alerts')} action={insights.length > 3 ? t('common.seeAll') : undefined} onAction={() => router.push('/notifications')} />
          {insights.slice(0, 3).map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </>
      ) : null}

      <SectionHeader title={t('home.envelopesActive')} action={t('common.manageCount', { count: envelopes.length })} onAction={() => router.push('/budget')} />
      {envelopes.length ? (
        envelopes.slice(0, 5).map((s) => <EnvelopeCard key={s.envelope.id} s={s} />)
      ) : (
        <Card>
          <EmptyState title={t('env.empty.title')} body={t('env.empty.body', {})} action={t('env.empty.cta')} onAction={() => router.push('/budget/auto')} />
        </Card>
      )}

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

type Tone = 'income' | 'expense' | 'info' | 'ai' | 'primary';
function toneColors(colors: ReturnType<typeof useTheme>['colors'], tone: Tone): [string, string] {
  return {
    income: [colors.primaryLight, colors.primary],
    primary: [colors.primaryLight, colors.primary],
    expense: [colors.dangerBg, colors.expense],
    info: [colors.infoBg, colors.info],
    ai: [colors.warningBg, colors.secondary],
  }[tone] as [string, string];
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ok ? colors.primaryLight : colors.warningBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ok ? colors.primary : colors.warning }} />
      <Text variant="caption" weight="600" style={{ color: ok ? colors.primary : colors.warning }}>
        {label}
      </Text>
    </View>
  );
}

function QuickTile({ icon, tone, label, sub, onPress }: { icon: string; tone: Tone; label: string; sub: string; onPress: () => void }) {
  const { colors, radius, shadow, dark } = useTheme();
  const [bg, fg] = toneColors(colors, tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 4, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1, ...(dark ? {} : shadow.card) })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={fg} />
      </View>
      <Text variant="small" weight="700" numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      <Text variant="caption" numberOfLines={1} style={{ color: fg }}>
        {sub}
      </Text>
    </Pressable>
  );
}

/** Enveloppe façon maquette : pastille, reste, consommé / budget, état. */
function EnvelopeCard({ s }: { s: EnvelopeStatus }) {
  const { t } = useI18n();
  const money = useMoney();
  return (
    <Card onPress={() => router.push(`/envelopes/${s.envelope.id}`)} accessibilityLabel={s.envelope.name} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <IconCircle icon={s.envelope.icon} color={s.envelope.color} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {s.envelope.name}
          </Text>
          <Text variant="small" tone={s.remaining < 0 ? 'danger' : 'muted'} numberOfLines={1}>
            {s.remaining < 0 ? t('env.over', { amount: money(-s.remaining) }) : t('env.left', { amount: money(s.remaining) })}
          </Text>
        </View>
        <Text variant="numeric" weight="600" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }} adjustsFontSizeToFit>
          {money(s.spent)} / {money(s.budget)}
        </Text>
      </View>
      <ProgressBar value={s.percent} tone={levelTone(s.level)} label={s.envelope.name} height={8} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
        <Text variant="caption" tone="muted">
          {t('env.consumed', { percent: s.percent })}
        </Text>
        <Text variant="caption" weight="600" tone={s.level === 'over' ? 'danger' : s.level === 'ok' ? 'success' : 'warning'}>
          {t(`env.state.${s.level}` as TKey)}
        </Text>
      </View>
    </Card>
  );
}

function Stat({ label, sub, value, tone, icon, onPress }: { label: string; sub: string; value: string; tone: Tone; icon: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const [bg, fg] = toneColors(colors, tone);
  return (
    <Card style={{ flex: 1, minWidth: 0, padding: 14 }} onPress={onPress} accessibilityLabel={`${label} ${value}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
        <Text variant="small" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} color={fg} />
        </View>
      </View>
      <Text variant="h2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: fg }}>
        {value}
      </Text>
      <Text variant="caption" tone="subtle" numberOfLines={1}>
        {sub}
      </Text>
    </Card>
  );
}
