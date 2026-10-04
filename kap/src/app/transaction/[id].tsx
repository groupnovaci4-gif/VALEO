import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '@/store/app';
import { useI18n } from '@/i18n';
import { EmptyState, Screen } from '@/components/ui';
import { TransactionForm } from '@/features/TransactionForm';
import { withSpaceReady } from '@/components/SpaceReady';

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
  return <TransactionForm existing={tx} />;
}

export default withSpaceReady(EditTransaction);
