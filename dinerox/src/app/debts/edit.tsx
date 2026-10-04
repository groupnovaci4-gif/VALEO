import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCurrency } from '@/hooks/useFinance';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, Segmented, Text, useToast } from '@/components/ui';
import { today } from '@/core/dates';
import type { DebtDirection, DebtKind } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';

function DebtEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const currency = useCurrency();
  const actions = useActions();
  const existing = data.debts.find((d) => d.id === id);
  const [direction, setDirection] = useState<DebtDirection>(existing?.direction ?? 'i_owe');
  const [kind, setKind] = useState<DebtKind>(existing?.kind ?? 'personal');
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? '');
  const [principal, setPrincipal] = useState<number | null>(existing?.principal ?? null);
  const [startDate, setStartDate] = useState(existing?.startDate ?? today());
  const [dueDate, setDueDate] = useState<string | null>(existing?.dueDate ?? null);
  const [installment, setInstallment] = useState<number | null>(existing?.installment ?? null);
  const [dueDay, setDueDay] = useState(existing?.dueDay ? String(existing.dueDay) : '');
  const [rate, setRate] = useState(existing?.rate ? String(existing.rate) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const kinds: DebtKind[] = direction === 'i_owe' ? ['personal', 'bank', 'family', 'supplier', 'loan_received'] : ['loan_given', 'family', 'personal'];
  const save = () => {
    if (!counterparty.trim()) return setError(t('error.name.required'));
    if (!principal) return setError(t('error.amount.invalid'));
    const day = Number(dueDay);
    actions.saveDebt({
      id: existing?.id,
      direction,
      kind,
      counterparty: counterparty.trim(),
      principal,
      currency: existing?.currency ?? currency,
      startDate,
      dueDate,
      installment,
      dueDay: day >= 1 && day <= 28 ? day : null,
      rate: rate ? Number(rate.replace(',', '.')) || null : null,
      note: note.trim() || null,
      status: existing?.status ?? 'active',
    });
    toast.show(t('common.saved'));
    goBack();
  };
  const remove = () =>
    Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => (actions.remove('debts', existing!.id), router.replace('/debts')) },
    ]);
  return (
    <Screen
      back
      title={existing ? t('debt.edit') : t('debt.new')}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {existing ? <Button variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={remove} /> : null}
          <Button style={{ flex: 1 }} label={t('common.save')} onPress={save} />
        </View>
      }
    >
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <Segmented value={direction} onChange={(d) => (setDirection(d), setKind(d === 'i_owe' ? 'personal' : 'loan_given'))} options={[{ value: 'i_owe', label: t('debt.iOwe') }, { value: 'owed_to_me', label: t('debt.owedToMe') }]} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('debt.kind')}
      </Text>
      <ChipGroup value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: t(`debt.kind.${k}` as TKey) }))} />
      <Field label={t('debt.counterparty')} value={counterparty} onChangeText={setCounterparty} maxLength={120} />
      <AmountField label={t('debt.principal')} value={principal} onChange={setPrincipal} currency={existing?.currency ?? currency} big />
      <AmountField label={`${t('debt.installment')} (${t('common.optional')})`} value={installment} onChange={setInstallment} currency={existing?.currency ?? currency} />
      <Field label={`${t('debt.dueDay')} (${t('common.optional')})`} value={dueDay} onChangeText={(s) => setDueDay(s.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
      <DateField label={t('debt.startDate')} value={startDate} onChange={(d) => d && setStartDate(d)} shortcuts={false} />
      <DateField label={`${t('debt.dueDate')} (${t('common.optional')})`} value={dueDate} onChange={setDueDate} allowClear shortcuts={false} />
      <Field label={`${t('debt.rate')} (${t('common.optional')})`} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
      <Field label={`${t('common.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} multiline />
    </Screen>
  );
}

export default withSpaceReady(DebtEdit);
