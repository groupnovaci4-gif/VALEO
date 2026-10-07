/**
 * Ajouter un moment fort : date du catalogue distant (modifiable) ou « date à
 * préciser », montant fixé par l'utilisateur (prérempli seulement s'il existe
 * des dépenses à la même période l'an dernier), plan d'épargne immédiat.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Banner, Button, Card, Chip, DateField, Field, Screen, Text } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { useActionErrorMessage } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';
import { activeSeasons, lastYearDate, lastYearSpending, nextSeasonDate, PERSONAL_SEASON, SEASON_EVENTS, SEASON_GOAL_CATEGORY, seasonPlan, type SeasonDate } from '@/core/seasons';
import { withinLimit } from '@/core/subscription';
import { loadSeasonDates } from '@/services/seasonCatalog';

function NewSeason() {
  const { event = PERSONAL_SEASON } = useLocalSearchParams<{ event?: string }>();
  const { t, date } = useI18n();
  const money = useMoney();
  const errorMessage = useActionErrorMessage();
  const actions = useActions();
  const { plan, profile, mode, activeSpace } = useApp();
  const { data, currency, now } = useFinance();
  const def = SEASON_EVENTS.find((e) => e.id === event);
  const [catalog, setCatalog] = useState<SeasonDate[]>([]);
  const [name, setName] = useState(def ? t(`season.event.${def.id}` as TKey) : '');
  const [amount, setAmount] = useState<number | null>(null);
  // undefined : date du catalogue (pas encore touchée) ; null : « date à préciser ».
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSeasonDates(mode === 'firebase').then((items) => alive && setCatalog(items));
    return () => {
      alive = false;
    };
  }, [mode]);

  const catalogDate = def ? nextSeasonDate(def.id, profile?.country, now, catalog) : null;
  const targetDate = chosen === undefined ? catalogDate : chosen;
  const lastYear = useMemo(() => (def ? lastYearSpending(data, def, lastYearDate(def.id, profile?.country, targetDate ?? now, catalog), currency) : null), [def, data, profile?.country, targetDate, now, catalog, currency]);
  const preview = amount && amount > 0 ? seasonPlan({ targetAmount: amount, saved: 0, date: targetDate ?? null, currency }, now) : null;
  const open = activeSeasons(data.goals).length;

  if (!withinLimit(plan, 'seasons', open)) {
    return (
      <Screen back title={t('season.new')}>
        <UpgradeCard feature="seasonal_planning" text={t('season.limit')} />
      </Screen>
    );
  }

  const save = () => {
    setError(null);
    if (!name.trim()) return setError(t('error.name.required'));
    if (!amount || amount <= 0) return setError(t('error.amount.invalid'));
    try {
      const g = actions.createGoal({
        kind: 'goal',
        name: name.trim(),
        categoryId: SEASON_GOAL_CATEGORY,
        templateId: def?.id ?? PERSONAL_SEASON,
        type: 'family',
        icon: def?.icon ?? '✨',
        currency,
        targetAmount: amount,
        initialAmount: 0,
        targetDate: targetDate ?? null,
        priority: 'normal',
        rank: 0,
        accountId: null,
        monthlyContribution: null,
        scope: activeSpace?.kind === 'family' ? 'family' : 'personal',
        status: 'active',
        history: [],
      });
      router.replace(`/goals/${g.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen back title={t('season.new')} edges={['top', 'bottom']} footer={<Button full label={t('season.save')} onPress={save} />}>
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <Field label={t('season.name')} placeholder={def ? undefined : t('season.name.placeholder')} value={name} onChangeText={setName} />

      {/* Toujours affiché (jamais selon le catalogue qui arrive en différé) : vide = « date à préciser ». */}
      <DateField label={t('season.date')} value={targetDate ?? null} allowClear shortcuts={false} minimumDate={now} onChange={(d) => setChosen(d)} />
      <Text variant="caption" tone="subtle" style={{ marginTop: -8, marginBottom: 12 }}>
        {targetDate === null ? t('season.noDate.hint') : chosen === undefined && catalogDate ? t('season.date.catalog', { date: date(catalogDate) }) : t('season.date.yours')}
      </Text>

      <AmountField label={t('season.amount')} value={amount} onChange={setAmount} currency={currency} />
      {lastYear ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -6, marginBottom: 12 }}>
          <Chip icon="time-outline" label={t('season.lastYear', { amount: money(lastYear) })} selected={amount === lastYear} onPress={() => setAmount(lastYear)} />
        </View>
      ) : null}

      {preview ? (
        <Card style={{ gap: 4 }} accessibilityLabel={t('season.preview')}>
          <Text variant="small" tone="muted">
            {t('season.preview')}
          </Text>
          <Text variant="bodyStrong">
            {preview.weeksLeft !== null && preview.weekly !== null ? t('season.planFull', { name: name.trim() || t('season.event.personal'), weeks: preview.weeksLeft, target: money(amount ?? 0), weekly: money(preview.weekly) }) : t('season.noDatePlan', { target: money(amount ?? 0) })}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(NewSeason);
