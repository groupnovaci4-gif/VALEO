/**
 * Tableau de bord : « je comprends immédiatement ma situation ».
 * Refonte finale (docs/design-pro-maquette-finale, FINAL-accueil.png, DECISIONS.md B1 à B9) :
 *  1. « Bonjour 👋 », ligne Démo, carte compacte (plafond par jour, « Mis de côté » qui se déplie) ;
 *  2. quatre grandes tuiles (Historique, Revenu, Transfert, Parler) ;
 *  3. « À lire » : tous les messages du coach ;
 *  4. dernières opérations groupées par jour ; enveloppes en bulles ; le mois en cours ;
 *     objectifs avec anneaux ; Mes récompenses + DineroX IA ; Rapports.
 * Les cartes qui n'apparaissent que si besoin (solde négatif, « payé ? », tontine…) restent sous
 * la carte d'accueil. Aucune formule ici : tous les chiffres viennent de `useFinance` / `core`.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Banner, Button, Card, EmptyState, Icon, ListCard, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { GoalRingRow } from '@/features/rows';
import { EnvelopeBubbles } from '@/features/budget/EnvelopeBubbles';
import { QuickTiles } from '@/features/home/QuickTiles';
import { ToRead } from '@/features/home/ToRead';
import { RecentByDay } from '@/features/home/RecentByDay';
import { MonthStats } from '@/features/home/MonthStats';
import { RewardsCard } from '@/features/home/RewardsCard';
import { goalPlanFor, sortGoals } from '@/core/goals';
import { isReserve } from '@/core/reserve';
import { sortTransactions } from '@/core/transactions';
import { currencyInWords, formatMoney, type CurrencyCode } from '@/core/money';
import { authErrorKey, resendVerification } from '@/services/auth';
import { DailyAllowanceCard } from '@/features/entry/DailyAllowanceCard';
import { TontineDueCard } from '@/features/tontine/TontineDueCard';
import { NegativeCard, RecurringCards, RegularizeList } from '@/features/money/HomeMoneyCards';
import { CatalogUpdateCard } from '@/features/categories/CatalogUpdateCard';
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
  const { t, lang } = useI18n();
  const { profile, user, mode, activeSpace, signOutLocal, role } = useApp();
  const money = useMoney();
  const toast = useToast();
  const entry = useEntry();
  const f = useFinance();
  const { data, money: pos, monthSum, envelopes, toAllocate, monthNetSavings, now, envelopeSoon } = f;
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
  const show = (n: number) => (hidden ? '••••••' : money(n));

  return (
    <Screen brandSection={t('tab.home')}>
      {/* B1 (`.hello`) : 22/28 Jakarta. */}
      <Text variant="titleL" style={{ fontSize: 22, lineHeight: 28, marginTop: 4, marginBottom: 8 }}>
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

      {/* 2. B4 : quatre grandes tuiles (Historique, Revenu, Transfert, Parler). */}
      <QuickTiles />

      {/* 3. B5 : « À lire », tous les messages du coach au même endroit. */}
      <ToRead />

      {/* 4. B6 : dernières opérations, groupées par jour. */}
      <SectionHeader title={t('home.recent')} action={recent.length ? t('common.seeAll') : undefined} onAction={() => router.push('/transactions?from=home')} />
      {recent.length ? (
        <RecentByDay txs={recent} />
      ) : (
        <Card style={{ paddingVertical: 16 }}>
          <EmptyState icon="receipt-outline" title={t('tx.empty.title')} body={t('tx.empty.body')} action={t('quick.expense')} onAction={() => entry.open('keyboard')} />
        </Card>
      )}
      {data.accounts.length === 0 ? (
        <Card style={{ marginTop: 12 }}>
          <EmptyState icon="wallet-outline" title={t('home.noAccount.title')} body={t('home.noAccount.body')} action={t('home.noAccount.cta')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : null}

      {/* 5. B7 : enveloppes en bulles. */}
      <SectionHeader title={t('home.envelopes')} action={t('common.manageCount', { count: envelopes.length })} onAction={() => router.push('/budget')} />
      {envelopes.length ? (
        <EnvelopeBubbles items={envelopes.slice(0, 6)} hidden={hidden} upcoming={envelopeSoon} />
      ) : (
        <Card>
          <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body', {})} action={t('env.empty.cta')} onAction={() => router.push('/budget/auto')} />
        </Card>
      )}

      {/* 6. B8 : le mois en cours (Revenus, Dépenses, Épargne nette, Reste à répartir). */}
      {/* Reste à répartir : EXACTEMENT le chiffre de l'onglet Budget (`unallocated`, §9) ; masqué chez un enfant (audit B6). */}
      <MonthStats now={now} income={monthSum.income} expense={monthSum.expense} savings={monthNetSavings} toAllocate={toAllocate.amount} child={role === 'child'} hidden={hidden} />
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

      {/* 7. B9 : objectifs en liste avec anneaux. */}
      <SectionHeader title={t('home.goalsTitle')} action={t('common.seeAll')} onAction={() => router.push('/goals')} />
      {goals.length ? (
        <ListCard radius={20}>
          {goals.map(({ g, plan }) => (
            <GoalRingRow key={g.id} goal={g} plan={plan} />
          ))}
        </ListCard>
      ) : (
        <Card>
          <EmptyState icon="flag-outline" title={t('goal.empty.title')} body={t('goal.empty.body')} action={t('goal.empty.cta')} onAction={() => router.push('/goals/new')} />
        </Card>
      )}

      {/* 8. B9 : Mes récompenses + DineroX IA, côte à côte. */}
      <RewardsCard />

      {/* Parrainage : carte discrète après la 5e saisie réussie. */}
      <InviteCard entries={myEntries} />

      {recent.length ? <Button variant="tertiary" label={t('rep.title')} icon="bar-chart-outline" onPress={() => router.push('/reports')} style={{ marginTop: 14, alignSelf: 'center' }} /> : null}
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40, marginBottom: 8 }}>
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

