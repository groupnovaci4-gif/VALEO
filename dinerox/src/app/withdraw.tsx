/**
 * « D'où voulez-vous retirer {amount} ? » (cercle fermé, 2026-10-14) : ouvert par
 * « Retirer de mon épargne ou d'un objectif » (disponible passé sous zéro, carte
 * de l'accueil, dépense qui nommait l'épargne). La personne choisit ; le retrait
 * passe par les écrans qui existent déjà (« Mon épargne › Retirer », « Objectif ›
 * Retirer »), préremplis avec le montant. Rien n'est enregistré ici.
 */
import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { Card, EmptyState, Row, Screen, SectionHeader } from '@/components/ui';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { withdrawSources } from '@/core/savingsCircle';
import { withSpaceReady } from '@/components/SpaceReady';

function Withdraw() {
  const { amount: raw } = useLocalSearchParams<{ amount?: string }>();
  const { t } = useI18n();
  const money = useMoney();
  const { data, balances, currency } = useFinance();
  const proposed = Number(raw);
  const amount = Number.isInteger(proposed) && proposed > 0 ? proposed : null;
  const sources = withdrawSources({ accounts: data.accounts, balances, goals: data.goals, contributions: data.goalContributions, currency });
  const accounts = sources.filter((s) => s.kind === 'account');
  const goals = sources.filter((s) => s.kind === 'goal');
  const take = (have: number) => String(amount ? Math.min(amount, have) : have);
  return (
    <Screen back title={t('circle.pick.title', { amount: amount ? money(amount) : '' }).replace(/\s+\?/, ' ?')}>
      {!sources.length ? <EmptyState emoji="🪙" title={t('circle.withdraw')} /> : null}
      {accounts.length ? (
        <>
          <SectionHeader title={t('sav.title')} />
          <Card>
            {accounts.map((s) => (
              <Row key={s.id} title={s.name} subtitle={money(s.amount)} chevron onPress={() => router.replace({ pathname: '/savings/move', params: { mode: 'withdraw', accountId: s.id, amount: take(s.amount) } })} />
            ))}
          </Card>
        </>
      ) : null}
      {goals.length ? (
        <>
          <SectionHeader title={t('goal.title')} />
          <Card>
            {goals.map((s) => (
              <Row key={s.id} title={s.name} subtitle={t('circle.pick.goal', { amount: money(s.amount) })} chevron onPress={() => router.replace({ pathname: '/goals/contribute', params: { id: s.id, withdraw: '1', amount: take(s.amount) } })} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(Withdraw);
