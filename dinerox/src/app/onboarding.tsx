/**
 * Onboarding progressif : une question par écran, chaque étape est
 * facultative sauf le prénom. À la fin, une première structure financière
 * (comptes, enveloppes budgétées, salaire récurrent, objectifs) est créée.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { AmountField, Button, Card, ChipGroup, Field, ProgressBar, Screen, SwitchRow, Text } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { ACCOUNT_TEMPLATES, EXPENSE_CATEGORIES, buildInitialStructure } from '@/core/defaults';
import { DEFAULT_GOAL_CATEGORIES } from '@/core/goalCategories';
import { CURRENCIES, type CurrencyCode } from '@/core/money';
import { newId } from '@/core/sync';
import type { BudgetMethod, FamilySituation, IncomeFrequency, CollectionName, SyncedDoc } from '@/core/types';
import { COUNTRIES, currencyForCountry } from '@/config/countries';
import { updateSpaceInfo } from '@/services/spaces';
import { analytics } from '@/services/analytics';
import { TERMS_VERSION } from '@/config/legal';

type Step = 'name' | 'country' | 'currency' | 'family' | 'income' | 'accounts' | 'expenses' | 'goals' | 'budget' | 'done';
const STEPS: Step[] = ['name', 'country', 'currency', 'family', 'income', 'accounts', 'expenses', 'goals', 'budget'];

export default function Onboarding() {
  const { t, lang } = useI18n();
  const { profile, user, engine, activeSpace, mode, updateProfile } = useApp();
  const [step, setStep] = useState<Step>('name');
  const [firstName, setFirstName] = useState(profile?.firstName ?? user?.displayName ?? '');
  const [country, setCountry] = useState(profile?.country ?? 'CI');
  const [currency, setCurrency] = useState<CurrencyCode>(profile?.currency ?? 'XOF');
  const [family, setFamily] = useState<FamilySituation | null>(null);
  const [income, setIncome] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly');
  const [payDay, setPayDay] = useState('25');
  const [accounts, setAccounts] = useState<string[]>(['acc.cash']);
  const [expenses, setExpenses] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [method, setMethod] = useState<BudgetMethod>('envelopes');
  const [terms, setTerms] = useState(!!profile?.termsAcceptedVersion || mode === 'local');
  const [busy, setBusy] = useState(false);

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[index + 1] ?? 'done');
  const back = () => index > 0 && setStep(STEPS[index - 1]);

  const goalOptions = useMemo(
    () =>
      DEFAULT_GOAL_CATEGORIES.flatMap((c) => c.templates.slice(0, 2)).map((tpl) => ({ value: tpl.id, label: tpl.label[lang], emoji: tpl.icon })),
    [lang],
  );

  const finish = async () => {
    if (!engine || !activeSpace || !user) return;
    setBusy(true);
    try {
      await engine.open(activeSpace.id, 'admin');
      const existing = engine.getData(activeSpace.id);
      // Ne recrée pas de structure si des données existent déjà (réinstallation, 2e appareil).
      if (existing.accounts.length === 0) {
        const structure = buildInitialStructure(
          {
            firstName,
            currency,
            monthlyIncome: income ?? 0,
            incomeFrequency: frequency,
            payDay: Number(payDay) || 25,
            mainExpenses: expenses,
            goals,
            budgetMethod: method,
            accounts,
          },
          { now: Date.now(), uid: user.uid, lang, id: (p) => newId(p), label: (k) => t(k as TKey) },
        );
        const items: { col: CollectionName; doc: SyncedDoc }[] = [];
        for (const [col, docs] of Object.entries(structure)) for (const doc of docs as SyncedDoc[]) items.push({ col: col as CollectionName, doc });
        engine.writeMany(activeSpace.id, items);
      }
      if (mode === 'firebase' && activeSpace.kind === 'personal') void updateSpaceInfo(activeSpace.id, { name: firstName.trim(), currency }).catch(() => undefined);
      await updateProfile({
        firstName: firstName.trim(),
        country,
        currency,
        termsAcceptedVersion: profile?.termsAcceptedVersion ?? TERMS_VERSION,
        preferences: { ...profile!.preferences, budgetMethod: method },
        onboarding: { completed: true, familySituation: family, incomeFrequency: frequency, mainExpenses: expenses, goals, budgetPreference: method },
      });
      analytics.track('onboarding_completed', { method });
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <Screen syncBanner={false} contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 18 }}>
          <Logo size={72} />
          <Text variant="h1" align="center">
            {t('onb.done.title')}
          </Text>
          <Text tone="muted" align="center">
            {t('onb.done.body')}
          </Text>
          {!terms ? <SwitchRow title={t('auth.signup.terms')} value={terms} onChange={setTerms} /> : null}
          <Button full label={t('onb.done.cta')} loading={busy} disabled={!terms} onPress={() => void finish()} />
        </View>
      </Screen>
    );
  }

  const title: Record<Exclude<Step, 'done'>, TKey> = {
    name: 'onb.name.title',
    country: 'onb.country.title',
    currency: 'onb.currency.title',
    family: 'onb.family.title',
    income: 'onb.income.title',
    accounts: 'onb.accounts.title',
    expenses: 'onb.expenses.title',
    goals: 'onb.goals.title',
    budget: 'onb.budget.title',
  };
  const canContinue = step !== 'name' || firstName.trim().length > 0;

  return (
    <Screen
      syncBanner={false}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {index > 0 ? <Button variant="secondary" label={t('common.back')} onPress={back} /> : null}
          <Button style={{ flex: 1 }} label={t('common.continue')} disabled={!canContinue} onPress={next} />
        </View>
      }
    >
      <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
        {t('onb.step', { current: index + 1, total: STEPS.length })}
      </Text>
      <ProgressBar value={((index + 1) / STEPS.length) * 100} />
      <Text variant="h1" style={{ marginTop: 22, marginBottom: 8 }} accessibilityRole="header">
        {t(title[step])}
      </Text>

      {step === 'name' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.name.hint')}
          </Text>
          <Field value={firstName} onChangeText={setFirstName} placeholder={t('auth.firstName')} autoFocus autoComplete="given-name" onSubmitEditing={() => canContinue && next()} />
        </>
      ) : null}

      {step === 'country' ? (
        <ChipGroup
          options={COUNTRIES.map((c) => ({ value: c, label: t(`country.${c}` as TKey) }))}
          value={country}
          onChange={(c) => {
            setCountry(c);
            setCurrency(currencyForCountry(c));
          }}
        />
      ) : null}

      {step === 'currency' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.currency.hint')}
          </Text>
          <ChipGroup options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: `${c.code} · ${c.name[lang]}` }))} value={currency} onChange={setCurrency} />
        </>
      ) : null}

      {step === 'family' ? (
        <ChipGroup
          options={(['single', 'couple', 'couple_children', 'single_parent', 'extended'] as FamilySituation[]).map((f) => ({ value: f, label: t(`onb.family.${f}` as TKey) }))}
          value={family}
          onChange={setFamily}
        />
      ) : null}

      {step === 'income' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.income.hint')}
          </Text>
          <AmountField label={t('onb.income.amount')} value={income} onChange={setIncome} currency={currency} big />
          <Text variant="small" weight="600" style={{ marginBottom: 8 }}>
            {t('onb.freq.title')}
          </Text>
          <ChipGroup
            options={(['monthly', 'biweekly', 'weekly', 'daily', 'irregular'] as IncomeFrequency[]).map((f) => ({ value: f, label: t(`onb.freq.${f}` as TKey) }))}
            value={frequency}
            onChange={setFrequency}
          />
          {frequency === 'monthly' ? <Field label={t('onb.income.payDay')} value={payDay} onChangeText={(s) => setPayDay(s.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /> : null}
        </>
      ) : null}

      {step === 'accounts' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.accounts.hint')}
          </Text>
          <ChipGroup
            multiple
            options={ACCOUNT_TEMPLATES.map((a) => ({ value: a.key, label: t(a.key as TKey), icon: a.icon, color: a.color }))}
            value={accounts}
            onChange={(k) => setAccounts((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))}
          />
        </>
      ) : null}

      {step === 'expenses' ? (
        <ChipGroup
          multiple
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: t(c.key as TKey), icon: c.icon, color: c.color }))}
          value={expenses}
          onChange={(k) => setExpenses((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))}
        />
      ) : null}

      {step === 'goals' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.goals.hint')}
          </Text>
          <ChipGroup multiple options={goalOptions} value={goals} onChange={(k) => setGoals((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))} />
        </>
      ) : null}

      {step === 'budget' ? (
        <View style={{ gap: 10 }}>
          {(['envelopes', '50_30_20', 'zero_based', 'custom'] as BudgetMethod[]).map((m) => (
            <Card key={m} onPress={() => setMethod(m)} accessibilityLabel={t(`onb.budget.${m}` as TKey)} style={method === m ? { borderColor: '#16A34A', borderWidth: 2 } : undefined}>
              <Text variant="bodyStrong">{t(`onb.budget.${m}` as TKey)}</Text>
              <Text variant="small" tone="muted">
                {t(`onb.budget.${m}.desc` as TKey)}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
