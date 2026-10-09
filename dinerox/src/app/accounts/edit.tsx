import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { AmountField, Banner, Button, ChipGroup, Field, Screen, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { ACCOUNT_TEMPLATES } from '@/core/defaults';
import { CURRENCIES, type CurrencyCode } from '@/core/money';
import type { AccountType, SavingsKind } from '@/core/types';
import { pickableColors } from '@/theme';
import { countryProfile } from '@/core/countries';
import { useAccountName } from '@/features/FinancialProfileSteps';
import { useActionErrorMessage, useRunAction } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';
import { PLANS } from '@/core/subscription';
import { today } from '@/core/dates';

function AccountEdit() {
  const { id, savings } = useLocalSearchParams<{ id?: string; savings?: string }>();
  const { t } = useI18n();
  const errorMessage = useActionErrorMessage();
  const toast = useToast();
  const data = useData();
  const { activeSpace, profile, plan } = useApp();
  const accountName = useAccountName();
  const country = profile?.country ?? 'CI';
  // Sources d'argent du pays en premier, puis toutes les autres (rien n'est interdit).
  const preferred = countryProfile(country).paymentMethods;
  const templates = [...preferred.map((k) => ACCOUNT_TEMPLATES.find((a) => a.key === k)!).filter(Boolean), ...ACCOUNT_TEMPLATES.filter((a) => !preferred.includes(a.key))];
  const actions = useActions();
  const run = useRunAction();
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
  // Nouveau compte d'épargne (1.8) : un montant à verser tout de suite devient
  // un VRAI versement (transfert depuis un compte, ou ajustement de solde si
  // l'argent y est déjà), visible dans l'historique — jamais un simple chiffre.
  const [addNow, setAddNow] = useState<number | null>(null);
  const sources = data.accounts.filter((a) => !a.isSavings && a.active && !a.deleted && a.currency === currency);
  const [addFrom, setAddFrom] = useState<'account' | 'already'>('account');
  const [addFromId, setAddFromId] = useState<string | null>(null);
  const fromId = addFrom === 'account' ? (sources.find((a) => a.id === addFromId) ?? sources[0])?.id ?? null : null;
  const withDeposit = !existing && isSavings && !!addNow && addNow > 0;

  const save = () => {
    let created;
    try {
      created = actions.saveAccount({
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
    } catch (e) {
      if (e instanceof ActionError && e.code === 'limit') setError('limit');
      else setError(errorMessage(e, 'error.name.required'));
      return;
    }
    if (withDeposit) {
      try {
        actions.depositToSavings({ savingsAccountId: created.id, amount: addNow!, date: today(), fromAccountId: fromId });
        toast.show(t('sav.move.deposited'));
      } catch {
        // Le compte existe déjà : on ouvre le versement prérempli pour réessayer (jamais de doublon de compte).
        router.replace({ pathname: '/savings/move', params: { mode: 'deposit', accountId: created.id, amount: String(addNow) } });
        return;
      }
    } else toast.show(t('common.saved'));
    goBack();
  };
  const remove = () =>
    Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          let result: string | undefined;
          if (!run(() => (result = actions.deleteAccount(existing!.id)))) return;
          if (result === 'blocked') Alert.alert(t('acc.deleteBlocked'));
          // L'écran du compte supprimé n'existe plus : retour à la liste des comptes.
          else router.replace('/accounts');
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
      {error === 'limit' ? (
        <UpgradeCard
          feature="multiple_accounts"
          text={plan === 'free' ? t('acc.limitClear', { limit: PLANS.free.limits.accounts, count: data.accounts.length }) : t('error.limit', { limit: PLANS[plan].limits.accounts })}
        />
      ) : error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
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
            // Depuis « Créer un compte d'épargne », un modèle (« Compte bancaire »…) ne retire jamais l'option épargne.
            setIsSavings(savings ? true : !!x.isSavings);
          }}
          options={templates.map((a) => ({ value: a.key, label: accountName(a.key, country), icon: a.icon, color: a.color }))}
        />
      ) : null}
      <Field label={t('acc.name')} value={name} onChangeText={setName} maxLength={80} />
      <AmountField label={t(isSavings ? 'acc.openingSavings' : 'acc.openingBalance')} value={opening} onChange={setOpening} currency={currency} hint={t('acc.openingBalanceHint')} />
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
      {!existing && isSavings ? (
        <>
          <AmountField label={t('acc.addNow')} value={addNow} onChange={setAddNow} currency={currency} hint={t('acc.addNowHint')} />
          {addNow ? (
            <>
              <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
                {t('sav.move.from')}
              </Text>
              <Segmented value={sources.length ? addFrom : 'already'} onChange={setAddFrom} options={[...(sources.length ? [{ value: 'account' as const, label: t('sav.move.from.account') }] : []), { value: 'already' as const, label: t('sav.move.from.already') }]} />
              <View style={{ height: 10 }} />
              {addFrom === 'account' && sources.length ? (
                <ChipGroup scroll value={fromId} onChange={setAddFromId} options={sources.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
              ) : (
                <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
                  {t('sav.move.from.alreadyHint')}
                </Text>
              )}
            </>
          ) : null}
        </>
      ) : null}
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('acc.color')}
      </Text>
      <ChipGroup scroll value={color} onChange={setColor} options={pickableColors.map((c, i) => ({ value: c, label: ' ', icon: 'ellipse', color: c, a11yLabel: `${t('acc.color')} ${i + 1}` }))} />
      {existing ? <SwitchRow title={t('acc.active')} value={active} onChange={setActive} /> : null}
      <Text variant="caption" tone="subtle">
        {t('acc.manualNotice')}
      </Text>
    </Screen>
  );
}

export default withSpaceReady(AccountEdit);
