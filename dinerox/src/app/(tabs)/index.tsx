/**
 * Tableau de bord : « je comprends immédiatement ma situation ».
 * Design system v2 (docs/design-system.md §10.1), premier écran migré :
 *  1. carte principale — reste par jour + solde disponible (masquables) ;
 *  2. échéance de tontine, raccourcis (Historique en un toucher, Revenu, Transfert) ;
 *  3. saisie (bulle) et dernières opérations ;
 *  4. alertes, mois en cours, coach, conseil, analyse, enveloppes, objectifs,
 *     récompenses, assistant, rapports.
 * Aucune formule ici : tous les chiffres viennent de `useFinance` / `core`.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BIG_TEXT, DesignV2, useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Badge, Banner, Button, Card, EmptyState, Icon, IconCircle, ProgressBar, Row, Screen, SectionHeader, Text, levelTone, useToast } from '@/components/ui';
import { GoalCard, InsightCard, SpaceSwitcher, TransactionRow } from '@/features/rows';
import type { EnvelopeStatus } from '@/core/budget';
import { useIntelligence } from '@/hooks/useIntelligence';
import { RecommendationCard } from '@/features/Recommendation';
import { CoachSummaryCard } from '@/features/coach/CoachSummaryCard';
import { AdviceOfDay } from '@/features/coach/AdviceOfDay';
import { RewardsTile } from '@/features/coach/RewardsTile';
import { goalPlanFor, sortGoals } from '@/core/goals';
import { isReserve } from '@/core/reserve';
import { sortTransactions } from '@/core/transactions';
import { formatMoney, type CurrencyCode } from '@/core/money';
import { authErrorKey, resendVerification } from '@/services/auth';
import { DailyAllowanceCard } from '@/features/entry/DailyAllowanceCard';
import { TontineDueCard } from '@/features/tontine/TontineDueCard';
import { CatalogUpdateCard } from '@/features/categories/CatalogUpdateCard';
import { EntryPrompt } from '@/features/entry/EntryPrompt';
import { useEntry } from '@/features/entry/EntryProvider';

export default function Home() {
  return (
    <DesignV2>
      <HomeScreen />
    </DesignV2>
  );
}

function HomeScreen() {
  const { colors } = useTheme();
  const { t, monthYear } = useI18n();
  const { profile, user, mode, activeSpace, signOutLocal } = useApp();
  const money = useMoney();
  const toast = useToast();
  const entry = useEntry();
  const { fontScale } = useWindowDimensions();
  const big = fontScale >= BIG_TEXT;
  const f = useFinance();
  const { data, position, flows, envelopes, budget, insights, now } = f;

  const goals = useMemo(
    () => sortGoals(data.goals.filter((g) => g.status === 'active' && !isReserve(g))).slice(0, 3).map((g) => ({ g, plan: goalPlanFor(g, data.goalContributions, now) })),
    [data.goals, data.goalContributions, now],
  );
  const recent = useMemo(() => sortTransactions(data.transactions).slice(0, 5), [data.transactions]);
  const others = Object.entries(position.otherCurrencies).filter(([, v]) => v !== 0);

  // Montants masquables d'un geste (consultation en public).
  const [hidden, setHidden] = useState(false);
  // Erreur du renvoi de l'e-mail de vérification : gardée DANS la page (pas seulement un toast).
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const { recommendations } = useIntelligence();
  const topRec = recommendations[0];
  const monthLabel = monthYear(now);
  const show = (n: number) => (hidden ? '••••••' : money(n));

  return (
    <Screen brandSection={t('tab.home')}>
      <SpaceSwitcher />
      <Text variant="titleL" style={{ marginTop: 4, marginBottom: 12 }}>
        {profile?.firstName ? t('home.hello', { name: profile.firstName }) : t('home.helloAnon')}
      </Text>

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
        <>
          <Banner
            tone="warning"
            icon="mail-unread-outline"
            text={t('auth.verify.banner')}
            action={t('auth.verify.resend')}
            onAction={() =>
              void resendVerification()
                .then(() => {
                  setVerifyError(null);
                  toast.show(t('auth.verify.sent'));
                })
                .catch((e) => {
                  const message = t(authErrorKey(e));
                  setVerifyError(message);
                  toast.show(message, 'error');
                })
            }
          />
          {verifyError ? <Banner tone="danger" icon="alert-circle" text={verifyError} /> : null}
        </>
      ) : null}

      {/* 1. Le repère : reste par jour + solde disponible, dans une seule carte. */}
      <DailyAllowanceCard hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} available={position.free} />
      <TontineDueCard hidden={hidden} />
      <CatalogUpdateCard dismissible />

      {/* 2. Raccourcis : l'Historique en un toucher, puis Revenu et Transfert. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Shortcut icon="time-outline" label={t('history.title')} onPress={() => router.push('/transactions?from=home')} full />
        <Shortcut icon="arrow-down" label={t('tx.income')} onPress={() => router.push('/transaction/new?type=income')} full={big} />
        <Shortcut icon="swap-horizontal" label={t('tx.transfer')} onPress={() => router.push('/transaction/new?type=transfer')} full={big} />
      </View>

      {/* 3. Saisir en parlant (ou au clavier), puis les dernières opérations. */}
      <EntryPrompt />
      <SectionHeader title={t('home.recent')} action={recent.length ? t('common.seeAll') : undefined} onAction={() => router.push('/transactions?from=home')} />
      <Card style={{ paddingVertical: recent.length ? 4 : 16 }}>
        {recent.length ? (
          recent.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
        ) : (
          <EmptyState icon="receipt-outline" title={t('tx.empty.title')} body={t('tx.empty.body')} action={t('quick.expense')} onAction={() => entry.open('keyboard')} />
        )}
      </Card>
      {data.accounts.length === 0 ? (
        <Card style={{ marginTop: 12 }}>
          <EmptyState icon="wallet-outline" title={t('home.noAccount.title')} body={t('home.noAccount.body')} action={t('home.noAccount.cta')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : null}

      {/* 4. Alertes (budget qui déborde, échéances…). */}
      {insights.length ? (
        <>
          <SectionHeader title={t('home.alerts')} action={insights.length > 3 ? t('common.seeAll') : undefined} onAction={() => router.push('/notifications')} />
          {insights.slice(0, 3).map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </>
      ) : null}

      {/* Mois en cours : une ligne par chiffre, montant à droite (deux étages si le texte est agrandi). */}
      <SectionHeader title={t('home.month')} action={monthLabel} onAction={() => router.push('/reports')} />
      <Card style={{ paddingVertical: 4 }}>
        <MonthRow kind="income" label={t('home.stat.income')} sub={t('home.stat.income.sub')} value={show(flows.income)} hidden={hidden} onPress={() => router.push('/transactions?from=home')} />
        <MonthRow kind="expense" label={t('home.stat.expense')} sub={t('home.stat.expense.sub')} value={show(flows.expense)} hidden={hidden} onPress={() => router.push('/transactions?from=home')} />
        <MonthRow kind="savings" label={t('home.stat.savings')} sub={t('home.stat.savings.sub')} value={show(position.savings)} hidden={hidden} onPress={() => router.push('/savings')} />
        <MonthRow kind={budget.remaining < 0 ? 'over' : 'budget'} label={t('home.stat.budget')} sub={t('home.stat.budget.sub')} value={show(budget.remaining)} hidden={hidden} onPress={() => router.push('/budget')} />
      </Card>
      {position.allocatedToGoals > 0 ? (
        <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
          {t('home.goalsAllocated')} : {show(position.allocatedToGoals)}
        </Text>
      ) : null}
      {others.length ? (
        <Text variant="small" tone="muted" style={{ marginTop: 4 }}>
          {t('home.otherCurrencies')} : {others.map(([c, v]) => (hidden ? '••••••' : formatMoney(v, c as CurrencyCode))).join(' · ')}
        </Text>
      ) : null}

      {/* Coach : ce qu'il faut savoir depuis la dernière ouverture (un seul résumé), puis le conseil du jour. */}
      <View style={{ marginTop: 24 }}>
        <CoachSummaryCard />
        <AdviceOfDay excludeId={topRec?.id} />
      </View>

      {/* Intelligence financière : la recommandation la plus importante, à partir des données réelles. */}
      {topRec ? (
        <>
          <SectionHeader title={t('home.analysis')} action={t('common.seeAll')} onAction={() => router.push('/analysis')} />
          <RecommendationCard r={topRec} />
        </>
      ) : null}

      <SectionHeader title={t('home.envelopesActive')} action={t('common.manageCount', { count: envelopes.length })} onAction={() => router.push('/budget')} />
      {envelopes.length ? (
        envelopes.slice(0, 5).map((s) => <EnvelopeCard key={s.envelope.id} s={s} hidden={hidden} />)
      ) : (
        <Card>
          <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body', {})} action={t('env.empty.cta')} onAction={() => router.push('/budget/auto')} />
        </Card>
      )}

      <SectionHeader title={t('home.goals')} action={t('common.seeAll')} onAction={() => router.push('/goals')} />
      {goals.length ? (
        goals.map(({ g, plan }) => <GoalCard key={g.id} goal={g} plan={plan} compact />)
      ) : (
        <Card>
          <EmptyState icon="flag-outline" title={t('goal.empty.title')} body={t('goal.empty.body')} action={t('goal.empty.cta')} onAction={() => router.push('/goals/new')} />
        </Card>
      )}

      {/* Récompenses et assistant : deux lignes simples (une seule carte en dégradé par écran). */}
      <View style={{ marginTop: 24 }}>
        <RewardsTile />
        <Card onPress={() => router.push('/assistant')} accessibilityLabel={t('home.ai.title')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentContainer, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="sparkles" size={22} color={colors.onAccentContainer} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="bodyStrong">{t('home.ai.title')}</Text>
              <Badge tone="ai" label={t('home.ai.badge')} />
            </View>
            <Text variant="small" tone="muted">
              {t('home.askAssistantHint')}
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
        </Card>
      </View>

      {recent.length ? <Button variant="tertiary" label={t('rep.title')} icon="bar-chart-outline" onPress={() => router.push('/reports')} style={{ marginTop: 16, alignSelf: 'center' }} /> : null}
    </Screen>
  );
}

/** Raccourci : icône + texte, 48 dp, contour lisible. `full` : sur toute la largeur. */
function Shortcut({ icon, label, onPress, full }: { icon: string; label: string; onPress: () => void; full?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexBasis: full ? '100%' : '40%',
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: colors.borderStrong,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
      })}
    >
      <Icon name={icon} size={22} color={colors.primary} />
      <Text variant="label" style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

type MonthKind = 'income' | 'expense' | 'savings' | 'budget' | 'over';

/** Ligne « Mois en cours » : pastille (icône + couleur de rôle), libellé, montant à droite. */
function MonthRow({ kind, label, sub, value, hidden, onPress }: { kind: MonthKind; label: string; sub: string; value: string; hidden: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const look = {
    income: { icon: 'arrow-down', bg: colors.successBg, fg: colors.income, tone: 'income' as const },
    expense: { icon: 'arrow-up', bg: colors.dangerBg, fg: colors.expense, tone: 'expense' as const },
    savings: { icon: 'wallet', bg: colors.accentContainer, fg: colors.onAccentContainer, tone: 'default' as const },
    budget: { icon: 'pie-chart', bg: colors.primaryContainer, fg: colors.primary, tone: 'default' as const },
    over: { icon: 'pie-chart', bg: colors.dangerBg, fg: colors.expense, tone: 'expense' as const },
  }[kind];
  return (
    <Row
      title={label}
      subtitle={sub}
      accessibilityLabel={`${label}, ${hidden ? t('common.amountHidden') : value}, ${sub}`}
      left={
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={look.icon} size={20} color={look.fg} />
        </View>
      }
      right={<Amount text={value} hidden={hidden} size="S" tone={look.tone} align="right" />}
      onPress={onPress}
    />
  );
}

const LEVEL_ICON = { ok: 'checkmark-circle', warning: 'warning', reached: 'warning', critical: 'alert-circle' } as const;

/** Enveloppe : nom, reste (ou dépassement), barre, et l'état ÉCRIT avec une icône (jamais la couleur seule). */
function EnvelopeCard({ s, hidden }: { s: EnvelopeStatus; hidden: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const show = (n: number) => (hidden ? '••••••' : money(n));
  const remaining = s.remaining < 0 ? t('env.over', { amount: show(-s.remaining) }) : t('env.left', { amount: show(s.remaining) });
  const state = t(`env.state.${s.level}` as TKey);
  const stateColor = s.level === 'critical' ? colors.danger : s.level === 'ok' ? colors.success : colors.warning;
  return (
    <Card onPress={() => router.push(`/envelopes/${s.envelope.id}`)} accessibilityLabel={`${s.envelope.name}, ${remaining}, ${state}`} style={{ marginBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconCircle icon={s.envelope.icon} color={s.envelope.color} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {s.envelope.name}
          </Text>
          <Text variant="label" tone={s.remaining < 0 ? 'danger' : 'default'}>
            {remaining}
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
      </View>
      <ProgressBar value={s.percent} tone={levelTone(s.level)} label={s.envelope.name} height={8} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={LEVEL_ICON[s.level]} size={18} color={stateColor} />
          <Text variant="small" weight="600" style={{ color: stateColor }}>
            {state}
          </Text>
        </View>
        <Text variant="small" tone="muted">
          {t('env.consumed', { percent: s.percent })}
        </Text>
      </View>
      <Text variant="small" tone="muted">
        {t('env.of', { spent: show(s.spent), budget: show(s.budget) })}
      </Text>
    </Card>
  );
}
