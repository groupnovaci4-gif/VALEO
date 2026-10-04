import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useAccountLabel, useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Badge, Banner, Button, Card, ChipGroup, DateField, EmptyState, ProgressBar, Row, Screen, SectionHeader, Sheet, Text, useToast } from '@/components/ui';
import { debtStatus, validateDebtPayment } from '@/core/debts';
import { today } from '@/core/dates';
import { can } from '@/core/permissions';
import { withSpaceReady } from '@/components/SpaceReady';

function DebtDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, date } = useI18n();
  const toast = useToast();
  const { role } = useApp();
  const money = useMoney();
  const accountLabel = useAccountLabel();
  const actions = useActions();
  const { data, now } = useFinance();
  const debt = data.debts.find((d) => d.id === id);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(debt?.installment ?? null);
  const [accountId, setAccountId] = useState<string>('none');
  const [day, setDay] = useState(today());
  if (!debt) return <Screen back><EmptyState title={t('debt.empty.title')} /></Screen>;
  const s = debtStatus(debt, data.debtPayments, now);
  const payments = data.debtPayments.filter((p) => p.debtId === id).sort((a, b) => b.date.localeCompare(a.date));
  const canEdit = can(role, 'update', 'debts');
  const record = () => {
    const v = validateDebtPayment(amount ?? 0, s.remaining);
    const run = () => {
      actions.recordDebtPayment({ debtId: debt.id, amount: amount!, date: day, accountId: accountId === 'none' ? null : accountId, label: t('debt.paymentNote', { name: debt.counterparty }) });
      setOpen(false);
      toast.show(t('common.saved'));
    };
    if (v === 'invalid') return toast.show(t('error.amount.invalid'), 'error');
    if (v === 'exceeds') return Alert.alert(t('debt.payment.exceeds', { amount: money(s.remaining) }), '', [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm'), onPress: run }]);
    run();
  };
  return (
    <Screen back title={debt.counterparty} right={canEdit ? <Button small variant="ghost" icon="create-outline" label={t('common.edit')} onPress={() => router.push(`/debts/edit?id=${id}`)} /> : undefined}>
      <Card>
        <Badge label={t(debt.direction === 'i_owe' ? 'debt.iOwe' : 'debt.owedToMe')} tone={debt.direction === 'i_owe' ? 'danger' : 'success'} />
        <Text variant="h1" style={{ marginTop: 8 }}>
          {money(s.remaining)}
        </Text>
        <Text tone="muted" style={{ marginBottom: 10 }}>
          {t('debt.paid', { amount: money(s.paid) })} / {money(debt.principal)}
        </Text>
        <ProgressBar value={s.percent} tone="success" height={10} />
        {s.nextDue ? (
          <Text variant="small" tone={s.daysToDue !== null && s.daysToDue < 0 ? 'danger' : 'muted'} style={{ marginTop: 8 }}>
            {s.daysToDue !== null && s.daysToDue < 0 ? t('debt.overdue', { days: -s.daysToDue }) : t('debt.nextDue', { date: date(s.nextDue) })}
          </Text>
        ) : null}
        {s.installmentsLeft ? (
          <Text variant="small" tone="muted">
            {t('debt.installmentsLeft', { count: s.installmentsLeft })}
          </Text>
        ) : null}
        {debt.rate ? (
          <Text variant="small" tone="muted">
            {t('debt.rate')} : {debt.rate} %
          </Text>
        ) : null}
        {s.overpaid > 0 ? <Banner tone="warning" text={money(s.overpaid, { signed: true })} /> : null}
      </Card>
      {canEdit && !s.settled ? (
        <View style={{ gap: 8, marginTop: 14 }}>
          <Button icon="cash-outline" label={t(debt.direction === 'i_owe' ? 'debt.pay' : 'debt.receive')} onPress={() => setOpen(true)} />
          <Button variant="ghost" label={t('debt.close')} onPress={() => actions.saveDebt({ ...debt, status: 'closed' })} />
        </View>
      ) : null}
      <SectionHeader title={t('debt.payments')} />
      <Card>
        {payments.length ? payments.map((p) => <Row key={p.id} title={money(p.amount)} subtitle={[date(p.date), p.accountId ? accountLabel(p.accountId) : null].filter(Boolean).join(' · ')} />) : <EmptyState title={t('debt.payments')} />}
      </Card>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t(debt.direction === 'i_owe' ? 'debt.pay' : 'debt.receive')}>
        <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={debt.currency} big />
        <Text variant="small" weight="600" style={{ marginBottom: 2 }}>
          {t('debt.payment.account')}
        </Text>
        <Text variant="caption" tone="subtle" style={{ marginBottom: 6 }}>
          {t('debt.payment.accountHint')}
        </Text>
        <ChipGroup scroll value={accountId} onChange={setAccountId} options={[{ value: 'none', label: t('common.none') }, ...data.accounts.filter((a) => a.active && a.currency === debt.currency).map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))]} />
        <DateField label={t('common.date')} value={day} onChange={(d) => d && setDay(d)} />
        <Button full label={t('common.save')} onPress={record} />
      </Sheet>
    </Screen>
  );
}

export default withSpaceReady(DebtDetail);
