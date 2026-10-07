/**
 * Création (ou modification, `?id=`) d'une réserve famille et cérémonies.
 * Aide au plafond : chiffres tirés des opérations enregistrées (core/reserve),
 * sinon une question — l'utilisateur fixe toujours lui-même les montants.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Banner, Button, Card, Chip, ChipGroup, Field, Screen, Text, useToast } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { useActionErrorMessage } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';
import { ceilingHelp, isReserve } from '@/core/reserve';
import { hasFeature, withinLimit } from '@/core/subscription';
import { goalSaved } from '@/core/balance';

function NewReserve() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const money = useMoney();
  const toast = useToast();
  const errorMessage = useActionErrorMessage();
  const actions = useActions();
  const { plan, activeSpace } = useApp();
  const { data, currency, now } = useFinance();
  const existing = id ? data.goals.find((g) => g.id === id && isReserve(g)) : undefined;
  const help = useMemo(() => ceilingHelp(data, currency, now), [data, currency, now]);
  const [name, setName] = useState(existing?.name ?? t('reserve.defaultName'));
  const [ceiling, setCeiling] = useState<number | null>(existing?.targetAmount ?? null);
  const [monthly, setMonthly] = useState<number | null>(existing?.monthlyContribution ?? null);
  const [initial, setInitial] = useState<number | null>(null);
  const [lastYear, setLastYear] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<string>(existing?.accountId ?? 'none');
  const [error, setError] = useState<string | null>(null);

  const savingsAccounts = data.accounts.filter((a) => a.active && !a.deleted && a.isSavings && a.currency === currency);
  const openReserves = data.goals.filter((g) => !g.deleted && isReserve(g) && (g.status === 'active' || g.status === 'paused')).length;
  const familyLocked = !existing && activeSpace?.kind === 'family' && !hasFeature(plan, 'family_reserve');
  const limitReached = !existing && !withinLimit(plan, 'reserves', openReserves);

  // Suggestions : historique réel, ou réponse de l'utilisateur ramenée au mois.
  const suggestion = help.kind === 'history' ? { ceiling: help.total, monthly: help.monthly } : lastYear && lastYear > 0 ? { ceiling: lastYear, monthly: Math.round(lastYear / 12) } : null;

  const save = () => {
    setError(null);
    if (!name.trim()) return setError(t('error.name.required'));
    if (!ceiling || ceiling <= 0) return setError(t('error.amount.invalid'));
    try {
      if (existing) {
        actions.updateGoal(existing.id, { name: name.trim(), targetAmount: ceiling, monthlyContribution: monthly && monthly > 0 ? monthly : null, accountId: accountId === 'none' ? null : accountId });
        toast.show(t('common.saved'));
        router.back();
        return;
      }
      const g = actions.createGoal({
        kind: 'reserve',
        name: name.trim(),
        categoryId: 'family',
        templateId: 'family_reserve',
        type: 'family',
        icon: '🤝',
        currency,
        targetAmount: ceiling,
        initialAmount: initial && initial > 0 ? initial : 0,
        targetDate: null,
        priority: 'normal',
        rank: 0,
        accountId: accountId === 'none' ? null : accountId,
        monthlyContribution: monthly && monthly > 0 ? monthly : null,
        scope: activeSpace?.kind === 'family' ? 'family' : 'personal',
        status: 'active',
        history: [],
      });
      router.replace(`/reserve/${g.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (familyLocked || limitReached) {
    return (
      <Screen back title={t('reserve.new')}>
        <UpgradeCard feature={familyLocked ? 'family_reserve' : 'reserve_multiple'} text={familyLocked ? t('reserve.familyLocked') : t('reserve.multipleLocked')} />
      </Screen>
    );
  }

  return (
    <Screen back title={existing ? t('reserve.edit') : t('reserve.new')} edges={['top', 'bottom']} footer={<Button full label={existing ? t('common.save') : t('reserve.save')} onPress={save} />}>
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <Field label={t('reserve.name')} value={name} onChangeText={setName} />

      <Card style={{ marginBottom: 14, gap: 8 }}>
        <Text variant="small" weight="700">
          {t('reserve.help.title')}
        </Text>
        {help.kind === 'history' ? (
          <Text variant="small">{t('reserve.help.history', { months: help.months, amount: money(help.total), monthly: money(help.monthly) })}</Text>
        ) : (
          <>
            <Text variant="small">{t('reserve.help.ask')}</Text>
            <AmountField label={t('reserve.help.lastYear')} value={lastYear} onChange={setLastYear} currency={currency} />
            {lastYear && lastYear > 0 ? (
              <Text variant="caption" tone="subtle">
                {t('reserve.help.monthlyFromYear', { monthly: money(Math.round(lastYear / 12)) })}
              </Text>
            ) : null}
          </>
        )}
        {suggestion ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip icon="flag-outline" label={t('reserve.help.useCeiling', { amount: money(suggestion.ceiling) })} selected={ceiling === suggestion.ceiling} onPress={() => setCeiling(suggestion.ceiling)} />
            <Chip icon="calendar-outline" label={t('reserve.help.useMonthly', { amount: money(suggestion.monthly) })} selected={monthly === suggestion.monthly} onPress={() => setMonthly(suggestion.monthly)} />
          </View>
        ) : null}
        <Text variant="caption" tone="subtle">
          {t('reserve.help.yourChoice')}
        </Text>
      </Card>

      <AmountField label={t('reserve.ceiling')} value={ceiling} onChange={setCeiling} currency={currency} />
      <Text variant="caption" tone="subtle" style={{ marginTop: -8, marginBottom: 12 }}>
        {t('reserve.ceiling.hint')}
      </Text>
      <AmountField label={t('reserve.monthly')} value={monthly} onChange={setMonthly} currency={currency} />
      {!existing ? <AmountField label={t('reserve.initial')} value={initial} onChange={setInitial} currency={currency} /> : null}
      {existing ? (
        <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
          {t('reserve.balance')} : {money(goalSaved(existing, data.goalContributions))}
        </Text>
      ) : null}
      {savingsAccounts.length ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('reserve.account')}
          </Text>
          <ChipGroup scroll value={accountId} onChange={setAccountId} options={[{ value: 'none', label: t('common.none') }, ...savingsAccounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))]} />
          <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
            {t('reserve.account.hint')}
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(NewReserve);
