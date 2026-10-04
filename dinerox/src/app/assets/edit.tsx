import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCurrency } from '@/hooks/useFinance';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, useToast } from '@/components/ui';
import type { AssetType } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';

function AssetEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const currency = useCurrency();
  const actions = useActions();
  const existing = data.assets.find((a) => a.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AssetType>(existing?.type ?? 'land');
  const [value, setValue] = useState<number | null>(existing?.value ?? null);
  const [acquiredAt, setAcquiredAt] = useState<string | null>(existing?.acquiredAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!name.trim()) return setError(t('error.name.required'));
    if (!value) return setError(t('error.amount.invalid'));
    actions.saveAsset({ id: existing?.id, name: name.trim(), type, value, currency: existing?.currency ?? currency, acquiredAt, note: null });
    toast.show(t('common.saved'));
    goBack();
  };
  return (
    <Screen
      back
      title={existing ? t('nw.edit') : t('nw.add')}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {existing ? <Button variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={() => (actions.remove('assets', existing.id), goBack())} /> : null}
          <Button style={{ flex: 1 }} label={t('common.save')} onPress={save} />
        </View>
      }
    >
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <ChipGroup value={type} onChange={setType} options={(['real_estate', 'land', 'vehicle', 'savings', 'investment', 'business', 'other'] as AssetType[]).map((k) => ({ value: k, label: t(`nw.type.${k}` as TKey) }))} />
      <Field label={t('common.name')} value={name} onChangeText={setName} maxLength={120} />
      <AmountField label={t('nw.value')} value={value} onChange={setValue} currency={existing?.currency ?? currency} big />
      <DateField label={`${t('nw.acquiredAt')} (${t('common.optional')})`} value={acquiredAt} onChange={setAcquiredAt} allowClear shortcuts={false} />
    </Screen>
  );
}

export default withSpaceReady(AssetEdit);
