import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import { today } from '@/core/dates';
import { lastOccurrenceBefore } from '@/core/recurring';
import type { Frequency } from '@/core/types';
import { useRunAction } from '@/hooks/useRunAction';
import { CategoryPicker } from '@/features/categories/CategoryPicker';
import { withSpaceReady } from '@/components/SpaceReady';

function RecurringEdit() {
  // `obligation=1` : soutien régulier (écran Famille et obligations) — libellé = bénéficiaire libre.
  const { id, type: typeParam, categoryId: categoryParam, obligation } = useLocalSearchParams<{ id?: string; type?: string; categoryId?: string; obligation?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const { activeSpace } = useApp();
  const actions = useActions();
  const run = useRunAction();
  const existing = data.recurring.find((r) => r.id === id);
  const [type, setType] = useState<'income' | 'expense'>(existing?.type ?? (typeParam === 'expense' ? 'expense' : 'income'));
  const [label, setLabel] = useState(existing?.label ?? '');
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null);
  const [chosenAccount, setAccountId] = useState<string | null>(existing?.accountId ?? null);
  const accountId = chosenAccount ?? data.accounts.find((a) => a.active)?.id ?? null;
  const [categoryId, setCategoryIdRaw] = useState<string | null>(existing?.categoryId ?? categoryParam ?? null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(existing?.subcategoryId ?? null);
  // Changer de catégorie efface la sous-catégorie (elle appartient à l'ancienne).
  const setCategoryId = (v: string | null) => {
    setCategoryIdRaw(v);
    setSubcategoryId(null);
  };
  const isObligation = obligation === '1';
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(existing?.startDate ?? today());
  const [endDate, setEndDate] = useState<string | null>(existing?.endDate ?? null);
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const account = data.accounts.find((a) => a.id === accountId);
  const save = () => {
    if (!label.trim()) return setError(t('error.name.required'));
    if (!amount) return setError(t('error.amount.invalid'));
    // Aucun compte : rattachée à un compte « Espèces » créé automatiquement.
    const accId = account?.id ?? actions.ensureCashAccount(activeSpace?.currency ?? 'XOF');
    const accCurrency = account?.currency ?? activeSpace?.currency ?? 'XOF';
    // Pas de génération rétroactive : une règle commencée dans le passé démarre à la prochaine échéance.
    const lastGenerated = existing && existing.startDate === startDate ? (existing.lastGenerated ?? null) : lastOccurrenceBefore({ frequency, startDate }, today());
    // Les champs non affichés ici (enveloppe choisie, liens) sont CONSERVÉS lors d'une modification.
    const ok = run(() => actions.saveRecurring({ ...(existing ?? {}), id: existing?.id, type, label: label.trim(), amount, currency: accCurrency, accountId: accId, categoryId, subcategoryId, envelopeId: existing?.envelopeId ?? null, frequency, startDate, endDate, active, lastGenerated }));
    if (!ok) return;
    toast.show(t('common.saved'));
    goBack();
  };
  return (
    <Screen
      back
      title={existing ? t('common.edit') : t('rec.new')}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {existing ? <Button variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={() =>
                Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.delete'), style: 'destructive', onPress: () => void (run(() => actions.remove('recurring', existing.id)) && goBack()) },
                ])
              } /> : null}
          <Button style={{ flex: 1 }} label={t('common.save')} onPress={save} />
        </View>
      }
    >
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <Segmented value={type} onChange={(v) => (setType(v), setCategoryId(null))} options={[{ value: 'income', label: t('tx.income') }, { value: 'expense', label: t('tx.expense') }]} />
      <Field label={isObligation ? t('obl.beneficiary') : t('rec.label')} value={label} onChangeText={setLabel} placeholder={isObligation ? t('obl.beneficiary.placeholder') : t('inc.salary')} maxLength={120} />
      <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={account?.currency ?? 'XOF'} big />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('tx.account')}
      </Text>
      <ChipGroup scroll value={accountId} onChange={setAccountId} options={data.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('tx.category')}
      </Text>
      <CategoryPicker kind={type} value={categoryId} onChange={setCategoryId} subValue={subcategoryId} onSubChange={setSubcategoryId} />
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
