import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { HandledError, useMoneyGuard } from '@/features/money/MoneyGuard';
import { useCurrency, useMoney } from '@/hooks/useFinance';
import { debtDeletion } from '@/core/debts';
import { removalWouldOverdraw } from '@/core/writePlans';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, Segmented, Text, useToast } from '@/components/ui';
import { today } from '@/core/dates';
import type { DebtDirection, DebtKind } from '@/core/types';
import { useRunAction } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';

function DebtEdit() {
  const { id, direction: dirParam, accountId: accountParam, amount: amountParam } = useLocalSearchParams<{ id?: string; direction?: string; accountId?: string; amount?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const currency = useCurrency();
  const actions = useActions();
  const run = useRunAction();
  const existing = data.debts.find((d) => d.id === id);
  const [direction, setDirection] = useState<DebtDirection>(existing?.direction ?? (dirParam === 'owed_to_me' ? 'owed_to_me' : 'i_owe'));
  const { guard } = useMoneyGuard();
  // Argent disponible v2 (§5.5) : une NOUVELLE dette dit sur quel compte l'argent est arrivé (emprunt) ou
  // d'où il est parti (prêt) — une vraie opération liée ; « Hors de mes comptes » seulement par choix.
  const movementAccounts = data.accounts.filter((a) => a.active && !a.deleted && !a.isSavings && a.currency === (existing?.currency ?? currency));
  const [movement, setMovement] = useState<string | null>(accountParam && movementAccounts.some((a) => a.id === accountParam) ? accountParam : null);
  const [kind, setKind] = useState<DebtKind>(existing?.kind ?? 'personal');
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? '');
  const [principal, setPrincipal] = useState<number | null>(existing?.principal ?? (Number(amountParam) > 0 ? Number(amountParam) : null));
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
    if (dueDay.trim() && !(day >= 1 && day <= 31)) return setError(t('error.dueDay'));
    if (!existing && !movement) return setError(t('debt.movement.required'));
    const draft = {
      id: existing?.id,
      direction,
      kind,
      counterparty: counterparty.trim(),
      principal,
      currency: existing?.currency ?? currency,
      startDate,
      dueDate,
      installment,
      // 29 à 31 acceptés : l'échéance tombe le dernier jour des mois plus courts.
      dueDay: day >= 1 && day <= 31 ? day : null,
      rate: rate ? Number(rate.replace(',', '.')) || null : null,
      note: note.trim() || null,
      status: existing?.status ?? ('active' as const),
    };
    const done = () => {
      toast.show(t('common.saved'));
      goBack();
    };
    if (existing || movement === 'outside') {
      if (run(() => actions.saveDebt(draft))) done();
      return;
    }
    // Prêt accordé : une sortie d'argent — la feuille de complément s'ouvre s'il en manque (§6.3).
    guard(
      (choices) => {
        try {
          actions.saveDebt(draft, { accountId: movement, date: startDate, choices });
        } catch (e) {
          if (e instanceof ActionError && (e.code === 'noMoney' || e.code === 'shortfall')) throw e;
          setError(e instanceof ActionError && e.details.errors?.[0] ? t(`error.${e.details.errors[0]}` as TKey) : t('error.generic'));
          throw new HandledError();
        }
      },
      { onDone: done },
    );
  };
  const money = useMoney();
  const remove = () => {
    const plan = debtDeletion(data, existing!.id);
    // Une dette qui a des remboursements ne se supprime pas : on la clôture (§5.5) — dit tout de suite.
    if (!plan.allowed) return Alert.alert(t('common.deleteConfirmTitle'), t('error.debt.hasPayments'), [{ text: t('common.close'), style: 'cancel' }]);
    // L'opération créée avec la dette (emprunt reçu ou prêt versé) est supprimée avec elle.
    const lines = plan.openingIds.flatMap((txId) => {
      const tx = data.transactions.find((x) => x.id === txId);
      if (!tx) return [];
      const account = data.accounts.find((a) => a.id === tx.accountId)?.name ?? '';
      const over = removalWouldOverdraw(data, txId);
      return [
        t(existing!.direction === 'i_owe' ? 'debt.deleteConfirm.borrowed' : 'debt.deleteConfirm.lent', { amount: money(tx.amount, { currency: tx.currency }), account }),
        ...(over ? [t('money.willBeNegative', { account: data.accounts.find((a) => a.id === over.accountId)?.name ?? '', amount: money(over.balance) })] : []),
      ];
    });
    Alert.alert(t('common.deleteConfirmTitle'), [...lines, t('common.deleteConfirmBody')].join('\n\n'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void (run(() => actions.deleteDebt(existing!.id)) && router.replace('/debts')) },
    ]);
  };
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
      {!existing ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 2 }}>
            {t(direction === 'i_owe' ? 'debt.movement.received' : 'debt.movement.given')}
          </Text>
          <Text variant="caption" tone="subtle" style={{ marginBottom: 6 }}>
            {t('debt.movement.hint')}
          </Text>
          <ChipGroup scroll value={movement ?? ''} onChange={(v) => setMovement(v || null)} options={[...movementAccounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color })), { value: 'outside', label: t('debt.movement.outside') }]} />
        </>
      ) : null}
      <AmountField label={`${t('debt.installment')} (${t('common.optional')})`} value={installment} onChange={setInstallment} currency={existing?.currency ?? currency} />
      <Field label={`${t('debt.dueDay')} (${t('common.optional')})`} value={dueDay} onChangeText={(s) => setDueDay(s.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" maxLength={2} />
      <DateField label={t('debt.startDate')} value={startDate} onChange={(d) => d && setStartDate(d)} shortcuts={false} />
      <DateField label={`${t('debt.dueDate')} (${t('common.optional')})`} value={dueDate} onChange={setDueDate} allowClear shortcuts={false} />
      <Field label={`${t('debt.rate')} (${t('common.optional')})`} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
      <Field label={`${t('common.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} multiline />
    </Screen>
  );
}

export default withSpaceReady(DebtEdit);
