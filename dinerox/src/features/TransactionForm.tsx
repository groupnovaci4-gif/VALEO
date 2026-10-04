/**
 * Formulaire unique pour dépense / revenu / transfert, en création ou en
 * modification. Saisie en quelques secondes : montant en premier, compte et
 * catégorie pré-sélectionnés, date « aujourd'hui ».
 */
import React, { useMemo, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import * as ImagePicker from 'expo-image-picker';
import { useI18n, type TKey } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { useCategoryLabels, useCurrency } from '@/hooks/useFinance';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import { resolveEnvelopeId } from '@/core/budget';
import { today } from '@/core/dates';
import { canEditDoc } from '@/core/permissions';
import type { Transaction, TransactionType } from '@/core/types';
import { uploadReceipt } from '@/services/receipts';

export interface TxInitial {
  type?: TransactionType;
  amount?: number | null;
  categoryId?: string | null;
  payee?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  date?: string;
  note?: string | null;
}

export function TransactionForm({ existing, initial }: { existing?: Transaction; initial?: TxInitial }) {
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const { role, user, mode, activeSpace } = useApp();
  const currency = useCurrency();
  const actions = useActions();
  const cats = useCategoryLabels();
  const accounts = data.accounts.filter((a) => a.active || a.id === existing?.accountId || a.id === existing?.toAccountId);
  const defaultAccount = accounts.find((a) => !a.isSavings) ?? accounts[0];

  const [type, setType] = useState<TransactionType>(existing?.type ?? initial?.type ?? 'expense');
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? initial?.amount ?? null);
  const [chosenAccount, setAccountId] = useState<string | null>(existing?.accountId ?? initial?.accountId ?? null);
  // Défaut dérivé (et non figé au premier rendu) : les données locales peuvent arriver après l'ouverture.
  const accountId = chosenAccount ?? defaultAccount?.id ?? null;
  const [toAccountId, setToAccountId] = useState<string | null>(existing?.toAccountId ?? initial?.toAccountId ?? null);
  const [toAmount, setToAmount] = useState<number | null>(existing?.toAmount ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? initial?.categoryId ?? null);
  const [envelopeId, setEnvelopeId] = useState<string>(existing?.envelopeId ?? 'auto');
  const [payee, setPayee] = useState(existing?.payee ?? initial?.payee ?? '');
  const [note, setNote] = useState(existing?.note ?? initial?.note ?? '');
  const [date, setDate] = useState<string>(existing?.date ?? initial?.date ?? today());
  const [receipt, setReceipt] = useState<string | null>(existing?.receiptUrl ?? null);
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const from = accounts.find((a) => a.id === accountId);
  const to = accounts.find((a) => a.id === toAccountId);
  const txCurrency = from?.currency ?? currency;
  const crossCurrency = type === 'transfer' && from && to && from.currency !== to.currency;
  const readOnly = !!existing && !canEditDoc(role, 'transactions', existing.createdBy, user?.uid ?? '');
  const categories = cats.list(type === 'income' ? 'income' : 'expense');
  const autoEnvelope = useMemo(() => {
    const id = resolveEnvelopeId({ categoryId, envelopeId: null }, data.envelopes);
    return data.envelopes.find((e) => e.id === id)?.name;
  }, [categoryId, data.envelopes]);

  const pickReceipt = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, allowsEditing: false });
    if (!res.canceled && res.assets[0]) setReceipt(res.assets[0].uri);
  };

  const submit = async () => {
    setErrors([]);
    setBusy(true);
    try {
      let receiptUrl = receipt;
      // Les justificatifs sont envoyés dans Storage (comptes en ligne) ; en local, le fichier reste sur l'appareil.
      if (receipt && receipt !== existing?.receiptUrl && mode === 'firebase' && activeSpace) {
        receiptUrl = await uploadReceipt(activeSpace.id, receipt).catch(() => receipt);
      }
      const saved = actions.saveTransaction({
        id: existing?.id,
        type,
        amount: amount ?? 0,
        currency: txCurrency,
        date,
        accountId: accountId ?? '',
        toAccountId: type === 'transfer' ? toAccountId : null,
        toAmount: crossCurrency ? toAmount : null,
        categoryId: type === 'transfer' ? null : categoryId,
        envelopeId: type === 'expense' && envelopeId !== 'auto' ? envelopeId : null,
        payee: payee.trim() || null,
        note: note.trim() || null,
        receiptUrl: receiptUrl ?? null,
        recurringId: existing?.recurringId ?? null,
        goalId: existing?.goalId ?? null,
        debtId: existing?.debtId ?? null,
      });
      if (recurring && !existing && type !== 'transfer') {
        actions.saveRecurring({
          type,
          label: payee.trim() || cats.byId(categoryId ?? ''),
          amount: saved.amount,
          currency: saved.currency,
          accountId: saved.accountId,
          categoryId: saved.categoryId ?? null,
          envelopeId: saved.envelopeId ?? null,
          frequency: 'monthly',
          startDate: saved.date,
          active: true,
          // L'échéance d'aujourd'hui vient d'être saisie : on ne la regénère pas.
          lastGenerated: saved.date,
        });
      }
      toast.show(t('tx.saved'));
      goBack();
    } catch (e) {
      if (e instanceof ActionError && e.details.errors) setErrors(e.details.errors.map((k) => t(`error.${k}` as TKey)));
      else if (e instanceof ActionError && e.code === 'permission') setErrors([t('error.permission')]);
      else setErrors([t('error.generic')]);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(t('common.deleteConfirmTitle'), t('tx.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          actions.remove('transactions', existing!.id);
          toast.show(t('common.deleted'));
          goBack();
        },
      },
    ]);

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }));
  const titleKey: TKey = existing ? 'tx.edit' : type === 'income' ? 'tx.new.income' : type === 'transfer' ? 'tx.new.transfer' : 'tx.new.expense';

  return (
    <Screen
      back
      title={t(titleKey)}
      edges={['top', 'bottom']}
      footer={
        readOnly ? undefined : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {existing ? <Button variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={remove} /> : null}
            <Button style={{ flex: 1 }} label={t('common.save')} loading={busy} onPress={() => void submit()} />
          </View>
        )
      }
    >
      {!existing && role !== 'child' ? (
        <Segmented
          value={type}
          onChange={(v) => {
            setType(v);
            setCategoryId(null);
          }}
          options={[
            { value: 'expense', label: t('tx.expense') },
            { value: 'income', label: t('tx.income') },
            { value: 'transfer', label: t('tx.transfer') },
          ]}
        />
      ) : null}
      {errors.map((e) => (
        <Banner key={e} tone="danger" icon="alert-circle" text={e} />
      ))}
      {accounts.length === 0 ? <Banner tone="warning" icon="wallet-outline" text={t('ai.noAccount')} action={t('acc.new')} onAction={() => router.push('/accounts/edit')} /> : null}

      <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={txCurrency} big autoFocus={!existing && !initial?.amount} />

      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {type === 'transfer' ? t('tx.fromAccount') : t('tx.account')}
      </Text>
      <ChipGroup scroll options={accountOptions} value={accountId} onChange={setAccountId} />

      {type === 'transfer' ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('tx.toAccount')}
          </Text>
          <ChipGroup scroll options={accountOptions.filter((a) => a.value !== accountId)} value={toAccountId} onChange={setToAccountId} />
          {crossCurrency ? <AmountField label={t('tx.toAmount')} value={toAmount} onChange={setToAmount} currency={to!.currency} hint={t('tx.toAmountHint')} /> : null}
          <Text variant="caption" tone="subtle" style={{ marginBottom: 14 }}>
            {t('tx.transferHint')}
          </Text>
        </>
      ) : (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('tx.category')}
          </Text>
          <ChipGroup options={categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))} value={categoryId} onChange={setCategoryId} />
        </>
      )}

      {type === 'expense' && data.envelopes.length ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('tx.envelope')}
          </Text>
          <ChipGroup
            scroll
            value={envelopeId}
            onChange={setEnvelopeId}
            options={[{ value: 'auto', label: autoEnvelope ? `${t('tx.envelopeAuto')} · ${autoEnvelope}` : t('tx.envelopeAuto') }, ...data.envelopes.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name, icon: e.icon, color: e.color }))]}
          />
        </>
      ) : null}

      <DateField label={t('common.date')} value={date} onChange={(d) => d && setDate(d)} />
      {type !== 'transfer' ? <Field label={type === 'income' ? t('tx.source') : t('tx.payee')} value={payee} onChangeText={setPayee} maxLength={120} /> : null}
      <Field label={`${t('common.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} multiline maxLength={1000} />

      {type === 'expense' ? (
        <View style={{ marginBottom: 14 }}>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('tx.receipt')}
          </Text>
          {receipt ? <Image source={{ uri: receipt }} style={{ width: 120, height: 120, borderRadius: 12, marginBottom: 8 }} accessibilityIgnoresInvertColors /> : null}
          <Button small variant="secondary" icon={receipt ? 'close' : 'camera-outline'} label={receipt ? t('tx.receiptRemove') : t('tx.receiptAdd')} onPress={() => (receipt ? setReceipt(null) : void pickReceipt())} />
        </View>
      ) : null}

      {!existing && type !== 'transfer' && role !== 'child' ? <SwitchRow title={t('tx.recurring')} subtitle={t('tx.recurringHint')} value={recurring} onChange={setRecurring} /> : null}
      {existing?.recurringId ? (
        <Text variant="caption" tone="subtle">
          {t('tx.fromRecurring')}
        </Text>
      ) : null}
    </Screen>
  );
}
