/**
 * Contribution à un objectif (ou retrait). L'utilisateur choisit s'il
 * DÉPLACE réellement l'argent vers le compte associé (transfert) ou s'il le
 * met simplement de côté (il n'est alors plus compté comme disponible).
 */
import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { useAccountLabel, useCurrency } from '@/hooks/useFinance';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, SwitchRow, Text, useToast } from '@/components/ui';
import { today } from '@/core/dates';
import { withSpaceReady } from '@/components/SpaceReady';

function Contribute() {
  const { id, withdraw } = useLocalSearchParams<{ id: string; withdraw?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const currency = useCurrency();
  const accountLabel = useAccountLabel();
  const actions = useActions();
  const goal = data.goals.find((g) => g.id === id);
  const isWithdraw = withdraw === '1';
  const sources = data.accounts.filter((a) => a.active && a.id !== goal?.accountId && a.currency === goal?.currency);
  const [amount, setAmount] = useState<number | null>(null);
  const [chosenAccount, setAccountId] = useState<string | null>(null);
  const accountId = chosenAccount ?? sources.find((a) => !a.isSavings)?.id ?? sources[0]?.id ?? null;
  const [moveChoice, setMove] = useState<boolean | null>(null);
  const move = moveChoice ?? !!goal?.accountId;
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!goal) return null;
  const save = () => {
    setError(null);
    try {
      actions.contributeToGoal({ goalId: goal.id, amount: amount ?? 0, date, accountId, note: note.trim() || null, moveTo: move ? goal.accountId : null, withdraw: isWithdraw });
      toast.show(t('goal.contribution.saved'));
      router.back();
    } catch (e) {
      setError(e instanceof ActionError && e.code === 'permission' ? t('error.permission') : t('error.amount.invalid'));
    }
  };
  return (
    <Screen back title={isWithdraw ? t('goal.withdraw') : t('goal.contribution.title', { name: goal.name })} edges={['top', 'bottom']} footer={<Button full label={t('common.save')} disabled={!amount} onPress={save} />}>
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={currency} big autoFocus />
      {sources.length ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('goal.contribution.from')}
          </Text>
          <ChipGroup scroll value={accountId} onChange={setAccountId} options={sources.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
        </>
      ) : null}
      {goal.accountId && accountId ? (
        <SwitchRow
          title={t('goal.contribution.move')}
          subtitle={t('goal.contribution.moveHint', { from: isWithdraw ? accountLabel(goal.accountId) : accountLabel(accountId), to: isWithdraw ? accountLabel(accountId) : accountLabel(goal.accountId) })}
          value={move}
          onChange={setMove}
        />
      ) : null}
      <DateField label={t('common.date')} value={date} onChange={(d) => d && setDate(d)} />
      <Field label={`${t('common.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} />
    </Screen>
  );
}

export default withSpaceReady(Contribute);
