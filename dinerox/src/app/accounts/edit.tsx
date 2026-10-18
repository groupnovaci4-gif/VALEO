import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Screen, Segmented, Sheet, SwitchRow, Text, useToast } from '@/components/ui';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { HandledError, useMoneyGuard } from '@/features/money/MoneyGuard';
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
  // Argent disponible v2 (§3.1) : provenance de l'ouverture, en texte libre.
  const [openingNote, setOpeningNote] = useState(existing?.openingNote ?? '');
  const money = useMoney();
  const { balances } = useFinance();
  const { guard } = useMoneyGuard();
  const balance = existing ? (balances[existing.id] ?? 0) : 0;
  const used = !!existing && data.transactions.some((x) => !x.deleted && (x.accountId === existing.id || x.toAccountId === existing.id));
  const [correctOpen, setCorrectOpen] = useState(false);
  const [leftoverOpen, setLeftoverOpen] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(existing?.currency ?? activeSpace?.currency ?? 'XOF');
  const [color, setColor] = useState(existing?.color ?? initialTpl.color);
  const [icon, setIcon] = useState(existing?.icon ?? initialTpl.icon);
  const [isSavings, setIsSavings] = useState(existing?.isSavings ?? !!initialTpl.isSavings);
  const [savingsKind, setSavingsKind] = useState<SavingsKind>(existing?.savingsKind ?? 'general');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  // Nouveau compte d'épargne — argent disponible v2 (§3.1) : UN seul choix, « D'où vient cet argent ? ».
  // « Je le prends sur mon argent disponible » : un VRAI versement depuis un compte courant ;
  // « C'est de l'épargne que j'avais déjà » : l'ouverture, avec sa provenance. Jamais les deux.
  const sources = data.accounts.filter((a) => !a.isSavings && a.active && !a.deleted && a.currency === currency);
  const [origin, setOrigin] = useState<'available' | 'already'>(sources.length ? 'available' : 'already');
  const [addFromId, setAddFromId] = useState<string | null>(null);
  const fromId = (sources.find((a) => a.id === addFromId) ?? sources[0])?.id ?? null;
  const withDeposit = !existing && isSavings && origin === 'available' && !!opening && opening > 0 && !!fromId;

  const save = () => {
    let created;
    try {
      created = actions.saveAccount({
        id: existing?.id,
        name: name.trim(),
        type,
        provider,
        currency,
        // Ouverture : l'argent qui existait déjà (jamais celui pris sur le disponible, qui est un versement).
        openingBalance: !existing && isSavings && origin === 'available' ? 0 : (opening ?? 0),
        openingNote: openingNote.trim() || null,
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
      const savingsId = created.id;
      // Pris sur le disponible : contrôlé comme toute sortie (feuille de complément s'il manque de l'argent).
      guard(
        (choices) => {
          try {
            actions.depositToSavings({ savingsAccountId: savingsId, amount: opening!, date: today(), fromAccountId: fromId, choices });
          } catch (e) {
            if (e instanceof ActionError && (e.code === 'noMoney' || e.code === 'shortfall')) throw e;
            // Le compte existe déjà : on ouvre le versement prérempli pour réessayer (jamais de doublon de compte).
            router.replace({ pathname: '/savings/move', params: { mode: 'deposit', accountId: savingsId, amount: String(opening) } });
            throw new HandledError();
          }
        },
        {
          onDone: () => {
            toast.show(t('sav.move.deposited'));
            goBack();
          },
        },
      );
      return;
    }
    toast.show(t('common.saved'));
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
      {existing ? (
        // Argent disponible v2 (§3.2) : le solde s'affiche ; il ne se corrige que par un ajustement avec motif.
        <View style={{ gap: 6, marginBottom: 12 }}>
          <Text variant="bodyStrong">{t('acc.balanceNow', { amount: money(balance, { currency: existing.currency }) })}</Text>
          {existing.openingBalance ? (
            <Text variant="caption" tone="subtle">
              {t('acc.openingShown', { amount: money(existing.openingBalance, { currency: existing.currency }) })}
              {existing.openingNote ? ` · ${existing.openingNote}` : ''}
            </Text>
          ) : null}
          {existing.active ? <Button variant="secondary" icon="create-outline" label={t('acc.correct')} onPress={() => setCorrectOpen(true)} /> : null}
        </View>
      ) : null}
      {!existing && isSavings ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('acc.origin.title')}
          </Text>
          <Segmented value={origin} onChange={setOrigin} options={[...(sources.length ? [{ value: 'available' as const, label: t('acc.origin.available') }] : []), { value: 'already' as const, label: t('acc.origin.already') }]} />
          <View style={{ height: 10 }} />
          <AmountField label={t('common.amount')} value={opening} onChange={setOpening} currency={currency} />
          {origin === 'available' && sources.length ? (
            <ChipGroup scroll value={fromId} onChange={setAddFromId} options={sources.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
          ) : (
            <Field label={t('acc.opening.note')} hint={t('acc.opening.noteHint')} value={openingNote} onChangeText={setOpeningNote} maxLength={200} />
          )}
        </>
      ) : !existing || !used ? (
        <>
          <AmountField label={t('acc.openingBalance')} value={opening} onChange={setOpening} currency={currency} hint={t('acc.openingBalanceHint')} />
          <Field label={t('acc.opening.note')} hint={t('acc.opening.noteHint')} value={openingNote} onChangeText={setOpeningNote} maxLength={200} />
        </>
      ) : null}
      {/* §3.3 : la devise ne change plus dès la première écriture ou une ouverture non nulle. */}
      {!existing || (!used && !existing.openingBalance) ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('acc.currency')}
          </Text>
          <ChipGroup scroll value={currency} onChange={setCurrency} options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: c.code }))} />
        </>
      ) : null}
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
      <ChipGroup scroll value={color} onChange={setColor} options={pickableColors.map((c, i) => ({ value: c, label: ' ', icon: 'ellipse', color: c, a11yLabel: `${t('acc.color')} ${i + 1}` }))} />
      {existing ? (
        <SwitchRow
          title={t('acc.active')}
          value={active}
          // §3.3 : désactiver un compte qui a encore un solde : « Transférer le reste vers… » ou « Constater une perte ».
          onChange={(v) => (!v && balance !== 0 ? setLeftoverOpen(true) : setActive(v))}
        />
      ) : null}
      {existing ? <CorrectSheet visible={correctOpen} accountId={existing.id} currency={existing.currency} balance={balance} onClose={() => setCorrectOpen(false)} /> : null}
      {existing ? <LeftoverSheet visible={leftoverOpen} accountId={existing.id} currency={existing.currency} balance={balance} onClose={() => setLeftoverOpen(false)} onDone={() => (setLeftoverOpen(false), setActive(false))} /> : null}
      <Text variant="caption" tone="subtle">
        {t('acc.manualNotice')}
      </Text>
    </Screen>
  );
}

/** « Corriger le solde » (§3.2) : le solde réel constaté, la date et un motif obligatoire ; l'écart devient un ajustement. */
function CorrectSheet({ visible, accountId, currency, balance, onClose }: { visible: boolean; accountId: string; currency: string; balance: number; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const actions = useActions();
  const errorMessage = useActionErrorMessage();
  const [actual, setActual] = useState<number | null>(balance);
  const [day, setDay] = useState(today());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    try {
      actions.correctBalance({ accountId, actual: actual ?? 0, date: day, reason });
      toast.show(t('acc.correct.done'));
      setReason('');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('acc.correct')}>
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <AmountField label={t('acc.correct.actual')} value={actual} onChange={setActual} currency={currency} big />
      <DateField label={t('common.date')} value={day} onChange={(d) => d && setDay(d)} />
      <Field label={t('acc.correct.reason')} hint={t('acc.correct.reasonHint')} value={reason} onChangeText={setReason} maxLength={200} />
      <Button full label={t('common.save')} onPress={submit} />
    </Sheet>
  );
}

/**
 * Désactiver un compte qui a encore un solde (§3.3) : « Transférer le reste vers… » (un transfert)
 * ou « Constater une perte » (un ajustement à la baisse, avec motif) ; ensuite le compte se désactive.
 */
function LeftoverSheet({ visible, accountId, currency, balance, onClose, onDone }: { visible: boolean; accountId: string; currency: string; balance: number; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const data = useData();
  const actions = useActions();
  const errorMessage = useActionErrorMessage();
  const targets = data.accounts.filter((a) => a.id !== accountId && a.active && !a.deleted && a.currency === currency);
  const [to, setTo] = useState<string | null>(targets[0]?.id ?? null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => void) => {
    try {
      fn();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('acc.leftover.title', { amount: money(balance, { currency }) })}>
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      {balance > 0 && targets.length ? (
        <>
          <ChipGroup scroll value={to} onChange={setTo} options={targets.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
          <Button full label={t('acc.leftover.transfer')} onPress={() => act(() => void (to && actions.saveTransaction({ type: 'transfer', amount: balance, currency: currency as CurrencyCode, date: today(), accountId, toAccountId: to })))} />
        </>
      ) : null}
      <Field label={t('acc.correct.reason')} hint={t('acc.correct.reasonHint')} value={reason} onChangeText={setReason} maxLength={200} />
      <Button full variant="secondary" label={t('acc.leftover.loss')} onPress={() => act(() => void actions.correctBalance({ accountId, actual: 0, date: today(), reason }))} />
      <Button full variant="ghost" label={t('common.cancel')} onPress={onClose} />
    </Sheet>
  );
}

export default withSpaceReady(AccountEdit);
