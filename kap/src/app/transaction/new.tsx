import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '@/features/TransactionForm';
import type { TransactionType } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';

function NewTransaction() {
  const p = useLocalSearchParams<{ type?: string; amount?: string; categoryId?: string; payee?: string; accountId?: string; toAccountId?: string; date?: string }>();
  const type = (['expense', 'income', 'transfer'].includes(p.type ?? '') ? p.type : 'expense') as TransactionType;
  return (
    <TransactionForm
      initial={{
        type,
        amount: p.amount ? Number(p.amount) : null,
        categoryId: p.categoryId ?? null,
        payee: p.payee ?? null,
        accountId: p.accountId ?? null,
        toAccountId: p.toAccountId ?? null,
        date: p.date,
      }}
    />
  );
}

export default withSpaceReady(NewTransaction);
