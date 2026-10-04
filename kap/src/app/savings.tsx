import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, EmptyState, ProgressBar, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { AccountRow } from '@/features/rows';
import { goalPlanFor } from '@/core/goals';

/** Épargne : comptes d'épargne par type, objectifs liés, alimentation par transfert. */
export default function Savings() {
  const { t } = useI18n();
  const money = useMoney();
  const { data, balances, position, now } = useFinance();
  const accounts = data.accounts.filter((a) => a.isSavings && a.active);
  const kinds = ['emergency', 'project', 'child', 'retirement', 'general'] as const;
  return (
    <Screen back title={t('sav.title')}>
      <Card>
        <Text variant="caption" tone="muted">
          {t('sav.total')}
        </Text>
        <Text variant="h1" tone="success">
          {money(position.savings)}
        </Text>
      </Card>
      {accounts.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState emoji="🐷" title={t('sav.empty.title')} body={t('sav.empty.body')} action={t('sav.empty.cta')} onAction={() => router.push('/accounts/edit?savings=1')} />
        </Card>
      ) : (
        kinds.map((k) => {
          const list = accounts.filter((a) => (a.savingsKind ?? 'general') === k);
          if (!list.length) return null;
          return (
            <React.Fragment key={k}>
              <SectionHeader title={t(`sav.kind.${k}` as TKey)} />
              <Card>
                {list.map((a) => {
                  const goals = data.goals.filter((g) => g.accountId === a.id && g.status === 'active');
                  return (
                    <React.Fragment key={a.id}>
                      <AccountRow account={a} balance={balances[a.id] ?? 0} />
                      {goals.map((g) => {
                        const p = goalPlanFor(g, data.goalContributions, now);
                        return (
                          <Row
                            key={g.id}
                            title={`${g.icon} ${g.name}`}
                            subtitle={`${money(p.saved)} / ${money(p.target)}`}
                            right={<View style={{ width: 80 }}><ProgressBar value={p.percent} /></View>}
                            onPress={() => router.push(`/goals/${g.id}`)}
                          />
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </Card>
            </React.Fragment>
          );
        })
      )}
      {accounts.length ? (
        <Button
          icon="arrow-forward"
          label={t('sav.add')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/transaction/new', params: { type: 'transfer', toAccountId: accounts[0].id } })}
        />
      ) : null}
      <Button variant="ghost" label={t('acc.new')} onPress={() => router.push('/accounts/edit?savings=1')} style={{ marginTop: 8 }} />
    </Screen>
  );
}
