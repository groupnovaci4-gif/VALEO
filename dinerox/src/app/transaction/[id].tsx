import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApp, useData } from '@/store/app';
import { useI18n } from '@/i18n';
import { Button, Card, EmptyState, Screen, Text, useToast } from '@/components/ui';
import { TransactionForm } from '@/features/TransactionForm';
import { withSpaceReady } from '@/components/SpaceReady';
import { useAccountLabel, useMoney } from '@/hooks/useFinance';
import { ActionError, useActions } from '@/store/actions';
import { goBack } from '@/hooks/goBack';
import { can } from '@/core/permissions';
import type { Transaction } from '@/core/types';

function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useData();
  const { t } = useI18n();
  const tx = data.transactions.find((x) => x.id === id);
  if (!tx) {
    return (
      <Screen back>
        <EmptyState emoji="🔎" title={t('tx.empty.filtered')} />
      </Screen>
    );
  }
  if (tx.type === 'adjustment') return <AdjustmentDetail tx={tx} />;
  return <TransactionForm existing={tx} />;
}

/**
 * Ajustement de solde (1.8) : ni revenu ni dépense, il n'a ni catégorie ni
 * bénéficiaire — pas de formulaire d'opération. On le consulte ; pour le
 * corriger, on le supprime puis on ajuste à nouveau depuis « Mon épargne ».
 */
function AdjustmentDetail({ tx }: { tx: Transaction }) {
  const { t, date } = useI18n();
  const money = useMoney();
  const toast = useToast();
  const actions = useActions();
  const accountLabel = useAccountLabel();
  const { role } = useApp();
  const remove = () =>
    Alert.alert(t('common.deleteConfirmTitle'), t('tx.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          try {
            actions.remove('transactions', tx.id);
          } catch (e) {
            toast.show(e instanceof ActionError && e.code === 'permission' ? t('error.permission') : t('error.generic'), 'error');
            return;
          }
          toast.show(t('common.deleted'));
          goBack();
        },
      },
    ]);
  return (
    <Screen back title={t('tx.adjustment')} footer={can(role, 'delete', 'transactions') ? <Button full variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={remove} /> : undefined}>
      <Card>
        <Text variant="h1" tone="muted">
          {tx.direction === 'out' ? `-${money(tx.amount, { currency: tx.currency })}` : money(tx.amount, { currency: tx.currency, signed: true })}
        </Text>
        <Text variant="small" tone="muted">
          {`${accountLabel(tx.accountId)} · ${date(tx.date)}`}
        </Text>
        <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
          {t('tx.adjustment.hint')}
        </Text>
      </Card>
    </Screen>
  );
}

export default withSpaceReady(EditTransaction);
