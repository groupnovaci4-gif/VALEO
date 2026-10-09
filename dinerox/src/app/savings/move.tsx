/**
 * « Mon épargne » (1.8) : VERSER, RETIRER ou AJUSTER LE SOLDE d'un compte
 * d'épargne.
 *  - Verser depuis un de mes comptes → transfert (la source baisse, l'épargne
 *    monte, le reste par jour baisse) ; argent déjà sur le compte →
 *    ajustement de solde (ni revenu ni dépense). Option : affecter tout ou
 *    partie à un objectif (contribution liée : jamais comptée deux fois).
 *  - Retirer vers un compte courant (transfert) ou en dépense directe
 *    (catégorie) ; un objectif lié peut être diminué (garde-fou « pas plus que
 *    ce qui y est mis de côté »).
 *  - Ajuster le solde : on saisit le solde réel, l'écart devient un ajustement.
 * Chaque refus a un message clair ; double toucher : un seul enregistrement.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n, type TKey } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useActions, ActionError } from '@/store/actions';
import { AmountField, Banner, Button, ChipGroup, DateField, Screen, Segmented, SwitchRow, Text, useToast } from '@/components/ui';
import { CategoryPicker } from '@/features/categories/CategoryPicker';
import { withSpaceReady } from '@/components/SpaceReady';
import { isISODate, today } from '@/core/dates';
import { goalSaved } from '@/core/balance';
import { adjustmentFor } from '@/core/savings';

type Mode = 'deposit' | 'withdraw' | 'adjust';

function SavingsMove() {
  // `ask=1` (phrase ou voix « J'ai épargné 20 000 ») : le compte d'épargne n'est jamais deviné
  // s'il y en a plusieurs et qu'aucun n'a été cité — l'utilisateur le choisit.
  const p = useLocalSearchParams<{ mode?: string; accountId?: string; amount?: string; goalId?: string; fromId?: string; date?: string; ask?: string }>();
  const { t } = useI18n();
  const money = useMoney();
  const toast = useToast();
  const actions = useActions();
  const { data, balances, currency } = useFinance();
  const savings = data.accounts.filter((a) => a.isSavings && a.active && !a.deleted);
  const current = data.accounts.filter((a) => !a.isSavings && a.active && !a.deleted);
  const [mode, setMode] = useState<Mode>(p.mode === 'withdraw' || p.mode === 'adjust' ? p.mode : 'deposit');
  const [accountId, setAccountId] = useState<string | null>(p.accountId && savings.some((a) => a.id === p.accountId) ? p.accountId : p.ask && savings.length > 1 ? null : (savings[0]?.id ?? null));
  const account = savings.find((a) => a.id === accountId);
  const sameCurrency = current.filter((a) => a.currency === (account?.currency ?? currency));
  const [amount, setAmount] = useState<number | null>(p.amount ? Number(p.amount) : null);
  const [date, setDate] = useState(p.date && isISODate(p.date) ? p.date : today());
  // Verser : d'où vient l'argent ; Retirer : où il va.
  const [source, setSource] = useState<'account' | 'already'>(sameCurrency.length ? 'account' : 'already');
  const [otherId, setOtherId] = useState<string | null>(p.fromId && sameCurrency.some((a) => a.id === p.fromId) ? p.fromId : (sameCurrency[0]?.id ?? null));
  const [dest, setDest] = useState<'account' | 'expense'>(sameCurrency.length ? 'account' : 'expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const goalCurrency = account?.currency ?? currency;
  const goals = data.goals.filter((g) => !g.deleted && (g.status === 'active' || g.status === 'paused') && g.currency === goalCurrency);
  const [withGoal, setWithGoal] = useState(!!p.goalId);
  // Objectif : celui cité, sinon celui lié au compte, sinon le seul objectif ; jamais deviné parmi plusieurs.
  const [goalId, setGoalId] = useState<string | null>(p.goalId ?? goals.find((g) => g.accountId === accountId)?.id ?? (goals.length === 1 ? goals[0].id : null));
  const [goalPart, setGoalPart] = useState<number | null>(null);
  const [real, setReal] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!savings.length) {
    return (
      <Screen back title={t('sav.move.title')}>
        <Banner tone="info" icon="wallet-outline" text={t('sav.move.noAccount')} action={t('sav.newAccount')} onAction={() => router.replace('/accounts/edit?savings=1')} />
      </Screen>
    );
  }
  const balance = account ? (balances[account.id] ?? 0) : 0;
  const goal = goals.find((g) => g.id === goalId);
  const part = withGoal && goal ? (goalPart ?? amount ?? 0) : 0;
  const adjustment = mode === 'adjust' && real !== null ? adjustmentFor(balance, real) : null;

  const submit = () => {
    if (busy) return;
    if (!account) return void setErrors([t('sav.move.pickAccount')]);
    // Interrupteur « objectif » activé sans objectif choisi : jamais d'enregistrement sans lui.
    if (mode !== 'adjust' && withGoal && !goal) return void setErrors([t('sav.move.pickGoal')]);
    setErrors([]);
    setBusy(true);
    try {
      if (mode === 'deposit') {
        actions.depositToSavings({ savingsAccountId: account.id, amount: amount ?? 0, date, fromAccountId: source === 'account' ? otherId : null, goal: withGoal && goal ? { goalId: goal.id, amount: part } : null });
        toast.show(t('sav.move.deposited'));
      } else if (mode === 'withdraw') {
        actions.withdrawFromSavings({ savingsAccountId: account.id, amount: amount ?? 0, date, toAccountId: dest === 'account' ? otherId : null, categoryId: dest === 'expense' ? categoryId : null, subcategoryId: dest === 'expense' ? subcategoryId : null, goal: withGoal && goal ? { goalId: goal.id, amount: part } : null });
        toast.show(t('sav.move.withdrawn'));
      } else {
        if (!adjustment) return void setErrors([t('sav.move.noChange')]);
        actions.adjustSavingsBalance({ accountId: account.id, date, ...adjustment });
        toast.show(t('sav.move.adjusted'));
      }
      goBack();
    } catch (e) {
      if (e instanceof ActionError && e.details.errors) setErrors(e.details.errors.map((k) => t(`error.${k}` as TKey)));
      else if (e instanceof ActionError && e.code === 'permission') setErrors([t('error.permission')]);
      else setErrors([t('error.generic')]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title={t(`sav.move.${mode}` as TKey)}
      footer={<Button full loading={busy} disabled={busy} label={t(`sav.move.${mode}.cta` as TKey)} onPress={submit} />}
    >
      {errors.length ? <Banner tone="danger" icon="alert-circle" text={errors.join('\n')} /> : null}
      <Segmented value={mode} onChange={(m) => (setMode(m), setErrors([]))} options={[{ value: 'deposit', label: t('sav.move.deposit.short') }, { value: 'withdraw', label: t('sav.move.withdraw.short') }, { value: 'adjust', label: t('sav.move.adjust.short') }]} />
      <View style={{ height: 12 }} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('sav.move.account')}
      </Text>
      <ChipGroup scroll value={accountId} onChange={setAccountId} options={savings.map((a) => ({ value: a.id, label: `${a.name} · ${money(balances[a.id] ?? 0, { currency: a.currency })}`, icon: a.icon, color: a.color }))} />
      {mode === 'adjust' ? (
        <>
          <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
            {t('sav.move.adjust.current', { amount: money(balance, { currency: account?.currency }) })}
          </Text>
          <AmountField label={t('sav.move.adjust.real')} value={real} onChange={setReal} currency={account?.currency ?? currency} big hint={t('sav.move.adjust.hint')} />
          {adjustment ? (
            <Text variant="small" style={{ marginBottom: 12 }}>
              {t(adjustment.direction === 'in' ? 'sav.move.adjust.plus' : 'sav.move.adjust.minus', { amount: money(adjustment.amount, { currency: account?.currency }) })}
            </Text>
          ) : null}
        </>
      ) : (
        <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={account?.currency ?? currency} big />
      )}
      <DateField label={t('common.date')} value={date} onChange={(d) => d && setDate(d)} />
      {mode === 'deposit' ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('sav.move.from')}
          </Text>
          <Segmented value={source} onChange={setSource} options={[{ value: 'account', label: t('sav.move.from.account') }, { value: 'already', label: t('sav.move.from.already') }]} />
          <View style={{ height: 10 }} />
          {source === 'account' ? (
            sameCurrency.length ? (
              <ChipGroup scroll value={otherId} onChange={setOtherId} options={sameCurrency.map((a) => ({ value: a.id, label: `${a.name} · ${money(balances[a.id] ?? 0, { currency: a.currency })}`, icon: a.icon, color: a.color }))} />
            ) : (
              <Banner tone="info" icon="information-circle-outline" text={t('sav.move.noCurrentAccount')} />
            )
          ) : (
            <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
              {t('sav.move.from.alreadyHint')}
            </Text>
          )}
        </>
      ) : null}
      {mode === 'withdraw' ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('sav.move.to')}
          </Text>
          <Segmented value={dest} onChange={setDest} options={[{ value: 'account', label: t('sav.move.to.account') }, { value: 'expense', label: t('sav.move.to.expense') }]} />
          <View style={{ height: 10 }} />
          {dest === 'account' ? (
            <ChipGroup scroll value={otherId} onChange={setOtherId} options={sameCurrency.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
          ) : (
            <CategoryPicker kind="expense" scroll value={categoryId} onChange={(v) => (setCategoryId(v), setSubcategoryId(null))} subValue={subcategoryId} onSubChange={setSubcategoryId} />
          )}
        </>
      ) : null}
      {mode !== 'adjust' && goals.length ? (
        <>
          <SwitchRow title={t(mode === 'deposit' ? 'sav.move.goal.deposit' : 'sav.move.goal.withdraw')} value={withGoal} onChange={setWithGoal} />
          {withGoal ? (
            <>
              <ChipGroup scroll value={goalId} onChange={setGoalId} options={goals.map((g) => ({ value: g.id, label: `${g.icon} ${g.name} · ${money(goalSaved(g, data.goalContributions), { currency: g.currency })}` }))} />
              <AmountField label={t('sav.move.goal.part')} value={goalPart ?? amount} onChange={setGoalPart} currency={account?.currency ?? currency} hint={t('sav.move.goal.partHint')} />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(SavingsMove);
