/**
 * Tableau de bord : « je comprends immédiatement ma situation ».
 * Design system v2 (docs/design-system.md §10.1), premier écran migré :
 *  1. carte principale — reste par jour + solde disponible (masquables) ;
 *  2. échéance de tontine, raccourcis (Historique en un toucher, Revenu, Transfert) ;
 *  3. saisie (bulle) et dernières opérations ;
 *  4. alertes, mois en cours, coach, conseil, analyse ; enveloppes, objectifs,
 *     récompenses et assistant en PAVÉS (grille de deux colonnes) ; rapports.
 * Aucune formule ici : tous les chiffres viennent de `useFinance` / `core`.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BIG_TEXT, DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Badge, Banner, Button, Card, EmptyState, Icon, Row, Screen, SectionHeader, Text, Tile, TileGrid, TileText, useToast } from '@/components/ui';
import { GoalTile, InsightCard, SpaceSwitcher, TransactionRow } from '@/features/rows';
import { EnvelopeTile } from '@/features/budget/EnvelopeCard';
import { useIntelligence } from '@/hooks/useIntelligence';
import { RecommendationCard } from '@/features/Recommendation';
import { CoachSummaryCard } from '@/features/coach/CoachSummaryCard';
import { AdviceOfDay } from '@/features/coach/AdviceOfDay';
import { RewardsTile } from '@/features/coach/RewardsTile';
import { goalPlanFor, sortGoals } from '@/core/goals';
import { isReserve } from '@/core/reserve';
import { sortTransactions } from '@/core/transactions';
import { currencyInWords, formatMoney, type CurrencyCode } from '@/core/money';
import { authErrorKey, resendVerification } from '@/services/auth';
import { DailyAllowanceCard } from '@/features/entry/DailyAllowanceCard';
import { TontineDueCard } from '@/features/tontine/TontineDueCard';
import { NegativeCard, RecurringCards, RegularizeList } from '@/features/money/HomeMoneyCards';
import { CatalogUpdateCard } from '@/features/categories/CatalogUpdateCard';
import { EntryPrompt } from '@/features/entry/EntryPrompt';
import { InviteCard } from '@/features/referral/InviteCard';
import { WeekCard } from '@/features/referral/WeekCard';
import { IncomeSavingCard } from '@/features/money/IncomeSavingCard';
import { useEntry } from '@/features/entry/EntryProvider';
import { useStoreReviewPrompt } from '@/features/storeReview/useStoreReviewPrompt';

export default function Home() {
  return (
    <DesignV2>
      <HomeScreen />
    </DesignV2>
  );
}

function HomeScreen() {
  const { colors } = useTheme();
  const { t, lang, monthYear } = useI18n();
  const { profile, user, mode, activeSpace, signOutLocal, role } = useApp();
  const money = useMoney();
  const toast = useToast();
  const entry = useEntry();
  const { fontScale } = useWindowDimensions();
  const big = fontScale >= BIG_TEXT;
  const f = useFinance();
  const { data, money: pos, monthSum, envelopes, toAllocate, monthNetSavings, insights, now, envelopeSoon } = f;
  // Étape 4 : demande d'avis possible au retour ici après un moment positif (règles : core/storeReview.ts).
  useStoreReviewPrompt(data.transactions);

  const goals = useMemo(
    () => sortGoals(data.goals.filter((g) => g.status === 'active' && !isReserve(g))).slice(0, 3).map((g) => ({ g, plan: goalPlanFor(g, data.goalContributions, now) })),
    [data.goals, data.goalContributions, now],
  );
  const recent = useMemo(() => sortTransactions(data.transactions).slice(0, 5), [data.transactions]);
  const myEntries = useMemo(() => data.transactions.filter((tx) => !tx.deleted && tx.createdBy === user?.uid).length, [data.transactions, user?.uid]);
  // Audit I5 : une ligne par autre devise (mois en cours + comptes), jamais convertie ni additionnée.
  const others = useMemo(() => {
    const curs = new Set<CurrencyCode>([...monthSum.others.map((o) => o.currency), ...(Object.keys(pos.otherCurrencies) as CurrencyCode[])]);
    return [...curs].sort().map((c) => ({ currency: c, income: 0, expense: 0, ...monthSum.others.find((o) => o.currency === c), balance: pos.otherCurrencies[c]?.totalAccounts ?? 0 }));
  }, [monthSum.others, pos.otherCurrencies]);

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

      {/* Mode démonstration : une ligne discrète (maquette validée, point 7), plus de grand encadré. */}
      {activeSpace?.id.startsWith('demo_') ? <DemoLine onCreate={mode === 'local' ? () => void signOutLocal().then(() => router.replace('/sign-up')) : undefined} /> : null}
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
      <DailyAllowanceCard hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} position={f.money} />
      {/* Argent disponible v2 : solde négatif à régulariser (§6.4), « payé ? » / « reçu ? » (§8), « À régulariser » (§7.2). */}
      <NegativeCard hidden={hidden} />
      <RecurringCards hidden={hidden} />
      <RegularizeList hidden={hidden} />
      {/* §11.2 : revenus irréguliers — après un revenu reçu, « Mettre X de côté maintenant ? ». */}
      <IncomeSavingCard hidden={hidden} />
      <TontineDueCard hidden={hidden} />
      <CatalogUpdateCard dismissible />
      {/* Filleul : « Votre semaine DineroX » (compteurs du serveur, aucun montant). */}
      <WeekCard />

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
        <MonthRow kind="income" label={t('home.stat.income')} sub={t('home.stat.income.sub')} value={show(monthSum.income)} hidden={hidden} onPress={() => router.push('/transactions?from=home')} />
        <MonthRow kind="expense" label={t('home.stat.expense')} sub={t('home.stat.expense.sub')} value={show(monthSum.expense)} hidden={hidden} onPress={() => router.push('/transactions?from=home')} />
        {/* Épargne nette du mois (grand livre, mêmes natures que les rapports). */}
        <MonthRow kind="savings" label={t('home.stat.savings')} sub={t('home.stat.savings.sub')} value={show(monthNetSavings)} hidden={hidden} onPress={() => router.push('/savings')} />
        {/* Reste à répartir : EXACTEMENT le chiffre de l'onglet Budget (`unallocated`, §9). */}
        {/* Audit B6 : masqué chez un enfant (engagements de l'espace invisibles pour lui). */}
        {role === 'child' ? (
          <MonthRow kind="budget" label={t('home.stat.budget')} value={t('child.askParent')} hidden={false} onPress={() => router.push('/budget')} />
        ) : (
          <MonthRow kind={toAllocate.amount < 0 ? 'over' : 'budget'} label={t('home.stat.budget')} value={show(toAllocate.amount)} hidden={hidden} onPress={() => router.push('/budget')} />
        )}
      </Card>
      {/* Audit I1 : les opérations datées après aujourd'hui, sous la carte (la carte ne change pas). */}
      {monthSum.upcoming.income || monthSum.upcoming.expense ? (
        <Text variant="small" tone="muted" style={{ marginTop: 4 }}>
          {t('home.upcomingMonth', { income: show(monthSum.upcoming.income), expense: show(monthSum.upcoming.expense) })}
        </Text>
      ) : null}
      {others.map((o) => (
        <Text key={o.currency} variant="small" tone="muted" style={{ marginTop: 4 }}>
          {t('home.otherCurrency', { inCur: currencyInWords(o.currency, lang === 'en' ? 'en' : 'fr'), income: hidden ? '••••••' : formatMoney(o.income, o.currency), expense: hidden ? '••••••' : formatMoney(o.expense, o.currency), balance: hidden ? '••••••' : formatMoney(o.balance, o.currency) })}
        </Text>
      ))}

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
        <TileGrid>
          {envelopes.slice(0, 5).map((s) => (
            <EnvelopeTile key={s.envelope.id} s={s} hidden={hidden} upcoming={envelopeSoon[s.envelope.id] ?? 0} />
          ))}
        </TileGrid>
      ) : (
        <Card>
          <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body', {})} action={t('env.empty.cta')} onAction={() => router.push('/budget/auto')} />
        </Card>
      )}

      <SectionHeader title={t('home.goals')} action={t('common.seeAll')} onAction={() => router.push('/goals')} />
      {goals.length ? (
        <TileGrid>
          {goals.map(({ g, plan }) => (
            <GoalTile key={g.id} goal={g} plan={plan} compact />
          ))}
        </TileGrid>
      ) : (
        <Card>
          <EmptyState icon="flag-outline" title={t('goal.empty.title')} body={t('goal.empty.body')} action={t('goal.empty.cta')} onAction={() => router.push('/goals/new')} />
        </Card>
      )}

      {/* Récompenses et assistant : deux pavés côte à côte. */}
      <TileGrid style={{ marginTop: 24 }}>
        <RewardsTile />
        <Tile onPress={() => router.push('/assistant')} accessibilityLabel={t('home.ai.title')}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentContainer, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="sparkles" size={22} color={colors.onAccentContainer} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TileText variant="bodyStrong">{t('home.ai.title')}</TileText>
            <Badge tone="ai" label={t('home.ai.badge')} />
          </View>
          <TileText variant="small" tone="muted">
            {t('home.askAssistantHint')}
          </TileText>
        </Tile>
      </TileGrid>

      {/* Parrainage : carte discrète après la 5e saisie réussie. */}
      <InviteCard entries={myEntries} />

      {recent.length ? <Button variant="tertiary" label={t('rep.title')} icon="bar-chart-outline" onPress={() => router.push('/reports')} style={{ marginTop: 16, alignSelf: 'center' }} /> : null}
    </Screen>
  );
}

/**
 * Mode démonstration (étape 4, point 7) : pastille « Démo » (fiole) à gauche, lien
 * « Créer mon profil › » à droite (même action qu'avant). Le texte explicatif de l'ancien
 * encadré est le libellé d'accessibilité de la pastille (lecteur d'écran).
 */
function DemoLine({ onCreate }: { onCreate?: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, marginTop: -4, marginBottom: 12 }}>
      <View accessible accessibilityLabel={t('home.demoBanner')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Icon name="flask-outline" size={15} color={colors.textMuted} />
        <Text variant="caption" weight="600" tone="muted">
          {t('home.demoPill')}
        </Text>
      </View>
      {onCreate ? (
        <Pressable accessibilityRole="link" accessibilityLabel={t('home.demoCta')} onPress={onCreate} hitSlop={{ top: 4, bottom: 4 }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, paddingLeft: 8, opacity: pressed ? 0.6 : 1 })}>
          <Text variant="label" tone="primary" style={{ fontSize: 14 }}>
            {t('home.demoCta')}
          </Text>
          <Icon name="chevron-forward" size={15} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
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
function MonthRow({ kind, label, sub, value, hidden, onPress }: { kind: MonthKind; label: string; sub?: string; value: string; hidden: boolean; onPress: () => void }) {
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
      accessibilityLabel={[label, hidden ? t('common.amountHidden') : value, sub].filter(Boolean).join(', ')}
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
