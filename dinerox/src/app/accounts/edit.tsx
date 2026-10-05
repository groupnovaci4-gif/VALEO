import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { AmountField, Banner, Button, ChipGroup, Field, Screen, SwitchRow, Text, useToast } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { ACCOUNT_TEMPLATES } from '@/core/defaults';
import { CURRENCIES, type CurrencyCode } from '@/core/money';
import type { AccountType, SavingsKind } from '@/core/types';
import { pickableColors } from '@/theme';
import { countryProfile } from '@/core/countries';
import { useAccountName } from '@/features/FinancialProfileSteps';
import { withSpaceReady } from '@/components/SpaceReady';

function AccountEdit() {
  const { id, savings } = useLocalSearchParams<{ id?: string; savings?: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const { activeSpace, profile } = useApp();
  const accountName = useAccountName();
  const country = profile?.country ?? 'CI';
  // Sources d'argent du pays en premier, puis toutes les autres (rien n'est interdit).
  const preferred = countryProfile(country).paymentMethods;
  const templates = [...preferred.map((k) => ACCOUNT_TEMPLATES.find((a) => a.key === k)!).filter(Boolean), ...ACCOUNT_TEMPLATES.filter((a) => !preferred.includes(a.key))];
  const actions = useActions();
  const existing = data.accounts.find((a) => a.id === id);
  const initialTpl = ACCOUNT_TEMPLATES.find((x) => x.key === (savings ? 'acc.savings' : 'acc.cash'))!;
  const [tpl, setTpl] = useState(existing ? null : initialTpl.key);
  const [name, setName] = useState(existing?.name ?? t(initialTpl.key as TKey));
  const [type, setType] = useState<AccountType>(existing?.type ?? initialTpl.type);
  const [provider, setProvider] = useState(existing?.provider ?? initialTpl.provider);
  const [opening, setOpening] = useState<number | null>(existing?.openingBalance ?? null);
  const [currency, setCurrency] = useState<CurrencyCode>(existing?.currency ?? activeSpace?.currency ?? 'XOF');
  const [color, setColor] = useState(existing?.color ?? initialTpl.color);
  const [icon, setIcon] = useState(existing?.icon ?? initialTpl.icon);
  const [isSavings, setIsSavings] = useState(existing?.isSavings ?? !!initialTpl.isSavings);
  const [savingsKind, setSavingsKind] = useState<SavingsKind>(existing?.savingsKind ?? 'general');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      actions.saveAccount({
        id: existing?.id,
        name: name.trim(),
        type,
        provider,
        currency,
        openingBalance: opening ?? 0,
        color,
        icon,
        active,
        isSavings,
        savingsKind: isSavings ? savingsKind : undefined,
        order: existing?.order ?? data.accounts.length,
      });
      toast.show(t('common.saved'));
      goBack();
    } catch (e) {
      if (e instanceof ActionError && e.code === 'limit') setError('limit');
      else if (e instanceof ActionError && e.code === 'permission') setError(t('error.permission'));
      else setError(t('error.name.required'));
    }
  };
  const remove = () =>
    Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (actions.deleteAccount(existing!.id) === 'blocked') Alert.alert(t('acc.deleteBlocked'));
          else goBack();
        },
      },
    ]);
  return (
    <Screen
      back
      title={existing ? t('acc.edit') : t('acc.new')}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {existing ? <Button variant="secondary" icon="trash-outline" label={t('common.delete')} onPress={remove} /> : null}
          <Button style={{ flex: 1 }} label={t('common.save')} onPress={save} />
        </View>
      }
    >
      {error === 'limit' ? <UpgradeCard feature="multiple_accounts" text={t('error.limit', { limit: '' })} /> : error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      {!existing ? (
        <ChipGroup
          value={tpl}
          onChange={(k) => {
            const x = ACCOUNT_TEMPLATES.find((a) => a.key === k)!;
            setTpl(k);
            setName(accountName(k, country));
            setType(x.type);
            setProvider(x.provider);
            setColor(x.color);
            setIcon(x.icon);
            setIsSavings(!!x.isSavings);
          }}
          options={templates.map((a) => ({ value: a.key, label: accountName(a.key, country), icon: a.icon, color: a.color }))}
        />
      ) : null}
      <Field label={t('acc.name')} value={name} onChangeText={setName} maxLength={80} />
      <AmountField label={t('acc.openingBalance')} value={opening} onChange={setOpening} currency={currency} hint={t('acc.openingBalanceHint')} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('acc.currency')}
      </Text>
      <ChipGroup scroll value={currency} onChange={setCurrency} options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: c.code }))} />
      <SwitchRow title={t('acc.isSavings')} subtitle={t('acc.isSavingsHint')} value={isSavings} onChange={setIsSavings} />
      {isSavings ? (
        <ChipGroup
          value={savingsKind}
          onChange={setSavingsKind}
          options={(['general', 'emergency', 'project', 'child', 'retirement'] as SavingsKind[]).map((k) => ({ value: k, label: t(`sav.kind.${k}` as TKey) }))}
        />
      ) : null}
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('acc.color')}
      </Text>
      <ChipGroup scroll value={color} onChange={setColor} options={pickableColors.map((c) => ({ value: c, label: ' ', icon: 'ellipse', color: c }))} />
      {existing ? <SwitchRow title={t('acc.active')} value={active} onChange={setActive} /> : null}
      <Text variant="caption" tone="subtle">
        {t('acc.manualNotice')}
      </Text>
    </Screen>
  );
}

export default withSpaceReady(AccountEdit);
