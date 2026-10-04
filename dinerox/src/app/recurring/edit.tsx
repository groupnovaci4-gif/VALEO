import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels } from '@/hooks/useFinance';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import { today } from '@/core/dates';
import { lastOccurrenceBefore } from '@/core/recurring';
import type { Frequency } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';

function RecurringEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const actions = useActions();
  const cats = useCategoryLabels();
  const existing = data.recurring.find((r) => r.id === id);
  const [type, setType] = useState<'income' | 'expense'>(existing?.type ?? 'income');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null);
  const [chosenAccount, setAccountId] = useState<string | null>(existing?.accountId ?? null);
  const accountId = chosenAccount ?? data.accounts.find((a) => a.active)?.id ?? null;
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(existing?.startDate ?? today());
  const [endDate, setEndDate] = useState<string | null>(existing?.endDate ?? null);
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const account = data.accounts.find((a) => a.id === accountId);
  const save = () => {
    if (!label.trim()) return setError(t('error.name.required'));
    if (!amount) return setError(t('error.amount.invalid'));
    if (!account) return setError(t('error.account.missing'));
    // Pas de génération rétroactive : une règle commencée dans le passé démarre à la prochaine échéance.
    const lastGenerated = existing && existing.startDate === startDate ? (existing.lastGenerated ?? null) : lastOccurrenceBefore({ frequency, startDate }, today());
    actions.saveRecurring({ id: existing?.id, type, label: label.trim(), amount, currency: account.currency, accountId: account.id, categoryId, envelopeId: null, frequency, startDate, endDate, active, lastGenerated });
    toast.show(t('common.saved'));
    router.back();
  };
  return (
    <Screen
      back
      title={existing ? t('common.edit') : t('rec.new')}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {existing ? <Button variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={() => (actions.remove('recurring', existing.id), router.back())} /> : null}
          <Button style={{ flex: 1 }} label={t('common.save')} onPress={save} />
        </View>
      }
    >
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <Segmented value={type} onChange={(v) => (setType(v), setCategoryId(null))} options={[{ value: 'income', label: t('tx.income') }, { value: 'expense', label: t('tx.expense') }]} />
      <Field label={t('rec.label')} value={label} onChangeText={setLabel} placeholder={t('inc.salary')} />
      <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={account?.currency ?? 'XOF'} big />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('tx.account')}
      </Text>
      <ChipGroup scroll value={accountId} onChange={setAccountId} options={data.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('tx.category')}
      </Text>
      <ChipGroup value={categoryId} onChange={setCategoryId} options={cats.list(type).map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('rec.frequency')}
      </Text>
      <ChipGroup value={frequency} onChange={setFrequency} options={(['weekly', 'monthly', 'yearly'] as Frequency[]).map((f) => ({ value: f, label: t(`rec.freq.${f}` as TKey) }))} />
      <DateField label={t('rec.start')} value={startDate} onChange={(d) => d && setStartDate(d)} shortcuts={false} />
      <DateField label={t('rec.end')} value={endDate} onChange={setEndDate} allowClear shortcuts={false} />
      {existing ? <SwitchRow title={t('common.active')} value={active} onChange={setActive} /> : null}
    </Screen>
  );
}

export default withSpaceReady(RecurringEdit);
