import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, EmptyState, ProgressBar, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { AccountRow } from '@/features/rows';
import { goalPlanFor } from '@/core/goals';
import { can } from '@/core/permissions';

/**
 * « Mon épargne » (1.8) : les comptes où l'argent est mis de côté, leur total,
 * et les ACTIONS : verser (action principale), retirer, ajuster le solde,
 * historique, nouveau compte d'épargne. Les objectifs liés montrent leur
 * progression (un versement peut les alimenter).
 */
export default function Savings() {
  const { t } = useI18n();
  const money = useMoney();
  const { role } = useApp();
  const { data, balances, position, now } = useFinance();
  const accounts = data.accounts.filter((a) => a.isSavings && a.active && !a.deleted);
  const kinds = ['emergency', 'project', 'child', 'retirement', 'general'] as const;
  const canMove = can(role, 'create', 'transactions');
  const move = (mode: 'deposit' | 'withdraw' | 'adjust', accountId?: string) => router.push({ pathname: '/savings/move', params: { mode, ...(accountId ? { accountId } : {}) } });
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
      {accounts.length && canMove ? <Button icon="add-circle" label={t('sav.deposit')} style={{ marginTop: 14 }} onPress={() => move('deposit')} /> : null}
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
                      <AccountRow account={a} balance={balances[a.id] ?? 0} onPress={() => router.push(`/accounts/${a.id}`)} />
                      {canMove ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 8 }}>
                          <Button small icon="add" label={t('sav.row.deposit')} onPress={() => move('deposit', a.id)} />
                          <Button small variant="secondary" icon="remove" label={t('sav.row.withdraw')} onPress={() => move('withdraw', a.id)} />
                          <Button small variant="ghost" icon="create-outline" label={t('sav.row.adjust')} onPress={() => move('adjust', a.id)} />
                          <Button small variant="ghost" icon="list-outline" label={t('sav.row.history')} onPress={() => router.push(`/accounts/${a.id}`)} />
                        </View>
                      ) : null}
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
      <Button variant={accounts.length ? 'ghost' : 'secondary'} icon="wallet-outline" label={t('sav.newAccount')} onPress={() => router.push('/accounts/edit?savings=1')} style={{ marginTop: 8 }} />
    </Screen>
  );
}
