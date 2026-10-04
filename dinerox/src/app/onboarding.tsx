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
import { AmountField, Button, Card, ChipGroup, Field, ProgressBar, Screen, SwitchRow, Text, useToast } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { ACCOUNT_TEMPLATES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, buildInitialStructure } from '@/core/defaults';
import { DEFAULT_GOAL_CATEGORIES } from '@/core/goalCategories';
import { CURRENCIES, type CurrencyCode } from '@/core/money';
import { newId } from '@/core/sync';
import type { BudgetMethod, FamilySituation, IncomeFrequency, CollectionName, SyncedDoc } from '@/core/types';
import { COUNTRIES, currencyForCountry } from '@/config/countries';
import { ensurePersonalSpace, updateSpaceInfo } from '@/services/spaces';
import { analytics } from '@/services/analytics';
import { TERMS_VERSION } from '@/config/legal';
import { defaultPreferences } from '@/services/profile';
import { brand } from '@/config/brand';

const brandColors = brand.colors;

type Step = 'name' | 'country' | 'currency' | 'family' | 'sources' | 'income' | 'accounts' | 'expenses' | 'goals' | 'budget' | 'done';
const STEPS: Step[] = ['name', 'country', 'currency', 'family', 'sources', 'income', 'accounts', 'expenses', 'goals', 'budget'];

export default function Onboarding() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { profile, user, engine, activeSpace, mode, updateProfile } = useApp();
  const [step, setStep] = useState<Step>('name');
  // Nom et prénom : valeur du profil (saisie à l'inscription, éventuellement reçue du
  // serveur après l'ouverture de l'écran) tant que l'utilisateur n'a rien modifié.
  const [lastNameEdit, setLastName] = useState<string | null>(null);
  const [firstNameEdit, setFirstName] = useState<string | null>(null);
  const lastName = lastNameEdit ?? profile?.lastName ?? '';
  const firstName = firstNameEdit ?? profile?.firstName ?? '';
  const [country, setCountry] = useState(profile?.country ?? 'CI');
  const [currency, setCurrency] = useState<CurrencyCode>(profile?.currency ?? 'XOF');
  const [family, setFamily] = useState<FamilySituation[]>([]);
  const [sources, setSources] = useState<string[]>(['inc_salary']);
  const [income, setIncome] = useState<number | null>(null);
  const [frequencies, setFrequencies] = useState<IncomeFrequency[]>(['monthly']);
  const [payDay, setPayDay] = useState('25');
  const [accounts, setAccounts] = useState<string[]>(['acc.cash']);
  const [expenses, setExpenses] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [method, setMethod] = useState<BudgetMethod>('envelopes');
  // Conditions déjà acceptées à l'inscription : lu en direct (le profil peut arriver après l'ouverture).
  const [termsEdit, setTerms] = useState<boolean | null>(null);
  const terms = termsEdit ?? (!!profile?.termsAcceptedVersion || mode === 'local');
  const [busy, setBusy] = useState(false);

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[index + 1] ?? 'done');
  const back = () => index > 0 && setStep(STEPS[index - 1]);
  const fullName = () => `${firstName.trim()} ${lastName.trim()}`.trim();
  /** Ajoute ou retire une valeur d'une sélection multiple. */
  const toggle = <T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) => (v: T) => set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const goalOptions = useMemo(
    () => DEFAULT_GOAL_CATEGORIES.flatMap((c) => c.templates).map((tpl) => ({ value: tpl.id, label: tpl.label[lang], emoji: tpl.icon })),
    [lang],
  );

  const finish = async () => {
    if (!engine || !activeSpace || !user) {
      // Jamais de bouton muet : on explique et on propose de réessayer.
      toast.show(t('error.network'), 'error');
      return;
    }
    setBusy(true);
    try {
      // Création côté serveur en arrière-plan : les écritures sont déjà autorisées
      // (id = uid) et un réseau lent ne doit jamais bloquer ce bouton.
      if (mode === 'firebase' && activeSpace.kind === 'personal') void ensurePersonalSpace(user.uid, fullName(), currency).catch(() => undefined);
      await engine.open(activeSpace.id, 'admin');
      const existing = engine.getData(activeSpace.id);
      // Ne recrée pas de structure si des données existent déjà (réinstallation, 2e appareil).
      if (existing.accounts.length === 0) {
        const structure = buildInitialStructure(
          {
            firstName,
            currency,
            monthlyIncome: income ?? 0,
            // Le salaire récurrent n'est créé que pour un revenu mensuel de type salaire.
            incomeFrequency: frequencies.includes('monthly') && sources.includes('inc_salary') ? 'monthly' : (frequencies[0] ?? 'irregular'),
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
      if (mode === 'firebase' && activeSpace.kind === 'personal') void updateSpaceInfo(activeSpace.id, { name: fullName(), currency }).catch(() => undefined);
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        country,
        currency,
        termsAcceptedVersion: profile?.termsAcceptedVersion ?? TERMS_VERSION,
        preferences: { ...(profile?.preferences ?? defaultPreferences()), budgetMethod: method },
        onboarding: {
          completed: true,
          familySituations: family,
          incomeSources: sources,
          incomeFrequencies: frequencies,
          mainExpenses: expenses,
          goals,
          budgetPreference: method,
        },
      });
      analytics.track('onboarding_completed', { method });
      router.replace('/');
    } catch {
      toast.show(t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <Screen syncBanner={false} contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 18 }}>
          <Logo size={88} />
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
    sources: 'onb.sources.title',
    income: 'onb.income.title',
    accounts: 'onb.accounts.title',
    expenses: 'onb.expenses.title',
    goals: 'onb.goals.title',
    budget: 'onb.budget.title',
  };
  const canContinue = step !== 'name' || (firstName.trim().length > 0 && lastName.trim().length > 0);
  const multiHint = (
    <Text variant="caption" tone="subtle" style={{ marginBottom: 10 }}>
      {t('common.multiSelect')}
    </Text>
  );

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
      <ProgressBar value={((index + 1) / STEPS.length) * 100} tone="success" />
      <Text variant="h1" style={{ marginTop: 22, marginBottom: 8 }} accessibilityRole="header">
        {t(title[step])}
      </Text>

      {step === 'name' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.name.hint')}
          </Text>
          <Field label={t('auth.lastName')} value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" autoFocus maxLength={80} />
          <Field label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" onSubmitEditing={() => canContinue && next()} maxLength={80} />
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
        <>
          {multiHint}
          <ChipGroup
            multiple
            options={(['single', 'couple', 'couple_children', 'single_parent', 'extended'] as FamilySituation[]).map((f) => ({ value: f, label: t(`onb.family.${f}` as TKey) }))}
            value={family}
            onChange={toggle(setFamily)}
          />
        </>
      ) : null}

      {step === 'sources' ? (
        <>
          {multiHint}
          <ChipGroup
            multiple
            options={INCOME_CATEGORIES.map((c) => ({ value: c.id, label: t(c.key as TKey), icon: c.icon, color: c.color }))}
            value={sources}
            onChange={toggle(setSources)}
          />
        </>
      ) : null}

      {step === 'income' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 16 }}>
            {t('onb.income.hint')}
          </Text>
          <AmountField label={t('onb.income.amount')} value={income} onChange={setIncome} currency={currency} big />
          <Text variant="small" weight="600" style={{ marginBottom: 4 }}>
            {t('onb.freq.title')}
          </Text>
          {multiHint}
          <ChipGroup
            multiple
            options={(['monthly', 'biweekly', 'weekly', 'daily', 'irregular'] as IncomeFrequency[]).map((f) => ({ value: f, label: t(`onb.freq.${f}` as TKey) }))}
            value={frequencies}
            onChange={toggle(setFrequencies)}
          />
          {frequencies.includes('monthly') ? <Field label={t('onb.income.payDay')} value={payDay} onChangeText={(s) => setPayDay(s.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /> : null}
        </>
      ) : null}

      {step === 'accounts' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 8 }}>
            {t('onb.accounts.hint')}
          </Text>
          {multiHint}
          <ChipGroup multiple options={ACCOUNT_TEMPLATES.map((a) => ({ value: a.key, label: t(a.key as TKey), icon: a.icon, color: a.color }))} value={accounts} onChange={toggle(setAccounts)} />
        </>
      ) : null}

      {step === 'expenses' ? (
        <>
          {multiHint}
          <ChipGroup multiple options={EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: t(c.key as TKey), icon: c.icon, color: c.color }))} value={expenses} onChange={toggle(setExpenses)} />
        </>
      ) : null}

      {step === 'goals' ? (
        <>
          <Text tone="muted" style={{ marginBottom: 8 }}>
            {t('onb.goals.hint')}
          </Text>
          {multiHint}
          <ChipGroup multiple options={goalOptions} value={goals} onChange={toggle(setGoals)} />
        </>
      ) : null}

      {step === 'budget' ? (
        <View style={{ gap: 10 }}>
          {(['envelopes', '50_30_20', 'zero_based', 'custom'] as BudgetMethod[]).map((m) => (
            <Card key={m} onPress={() => setMethod(m)} accessibilityLabel={t(`onb.budget.${m}` as TKey)} style={method === m ? { borderColor: brandColors.green, borderWidth: 2 } : undefined}>
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
