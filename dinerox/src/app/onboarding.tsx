/**
 * Création du profil financier, étape par étape. Rien n'est bloquant : pays et
 * devise sont préremplis, chaque autre étape peut être passée (« Passer »), et
 * « Plus tard » crée l'environnement immédiatement. La fin écrit tout en local
 * (synchronisé ensuite) puis ouvre le tableau de bord — aucune attente réseau.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Button, Field, ProgressBar, Screen, Text, useToast } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/theme';
import { ChargesStep, CountryStep, GoalsStep, IncomeStep, MoneyStep, STEP_IDS, SituationStep, useAccountName, type StepId } from '@/features/FinancialProfileSteps';
import { emptyDraft, toFinancialProfile, toOnboardingAnswers, type FinancialDraft } from '@/core/financialProfile';
import { countryProfile } from '@/core/countries';
import { starterStructure } from '@/core/defaults';
import type { CollectionName, SyncedDoc } from '@/core/types';
import { ensurePersonalSpace, updateSpaceInfo } from '@/services/spaces';
import { analytics } from '@/services/analytics';

const TITLES: Record<StepId, [TKey, TKey]> = {
  country: ['fp.country.title', 'fp.country.hint'],
  situation: ['fp.situation.title', 'fp.situation.hint'],
  income: ['fp.income.title', 'fp.income.hint'],
  money: ['fp.money.title', 'fp.money.hint'],
  charges: ['fp.charges.title', 'fp.charges.hint'],
  goals: ['fp.goals.title', 'fp.goals.hint'],
};

/** Ouvre l'espace dans le moteur sans jamais attendre plus de 3 s. */
const withTimeout = (p: Promise<unknown>, ms = 3000) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

export default function Onboarding() {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const accountName = useAccountName();
  const { profile, user, engine, activeSpace, role, mode, updateProfile } = useApp();
  const [draft, setDraft] = useState<FinancialDraft>(() => emptyDraft(profile?.country && profile.country !== 'OTHER' ? profile.country : 'CI'));
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  // Prénom demandé seulement s'il est inconnu (usage sans compte en ligne) ; facultatif.
  // Décision FIGÉE au premier profil reçu : juste après l'inscription, le profil
  // arrive parfois en deux temps (sans prénom, puis avec). Recalculée à chaque
  // rendu, elle faisait disparaître le champ pendant que l'utilisateur y tapait.
  const [name, setName] = useState('');
  const [askNameLatched, setAskNameLatched] = useState<boolean | null>(profile ? !profile.firstName : null);
  if (askNameLatched === null && profile) setAskNameLatched(!profile.firstName);
  // Un champ commencé n'est jamais retiré.
  const askName = !!askNameLatched || name !== '';
  const step = STEP_IDS[index];
  const last = index === STEP_IDS.length - 1;

  const finish = async () => {
    if (!engine || !activeSpace || !user) {
      toast.show(t('error.network'), 'error');
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      const firstName = profile?.firstName || name.trim();
      if (mode === 'firebase' && activeSpace.kind === 'personal') void ensurePersonalSpace(user.uid, firstName, draft.currency).catch(() => undefined);
      await withTimeout(engine.open(activeSpace.id, role ?? 'admin'));
      // Données existantes (réinstallation, 2e appareil) : rien n'est recréé.
      if (engine.getData(activeSpace.id).accounts.length === 0) {
        const answers = { ...toOnboardingAnswers(draft, firstName), accountLabel: (k: string) => accountName(k, draft.country) };
        const structure = starterStructure(answers, { now, uid: user.uid, lang, label: (k) => t(k as TKey) });
        const items: { col: CollectionName; doc: SyncedDoc }[] = [];
        for (const [col, docs] of Object.entries(structure)) for (const doc of docs as SyncedDoc[]) items.push({ col: col as CollectionName, doc });
        engine.writeMany(activeSpace.id, items);
      }
      // Les données sont sauvegardées AVANT de marquer le profil comme terminé :
      // si l'application est fermée juste après, rien n'est perdu.
      await withTimeout(engine.persistNow());
      if (mode === 'firebase' && activeSpace.kind === 'personal') void updateSpaceInfo(activeSpace.id, { currency: draft.currency }).catch(() => undefined);
      await updateProfile({
        country: draft.country,
        currency: draft.currency,
        financial: toFinancialProfile(draft, now),
        ...(askName && name.trim() ? { firstName: name.trim() } : {}),
        onboarding: { ...(profile?.onboarding ?? {}), completed: true },
      });
      analytics.track('onboarding_completed', { method: countryProfile(draft.country).zone });
      router.replace('/');
    } catch {
      toast.show(t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const next = () => (last ? void finish() : setIndex((i) => i + 1));
  const [title, hint] = TITLES[step];
  return (
    <Screen
      syncBanner={false}
      footer={
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {index > 0 ? <Button variant="secondary" icon="arrow-back" label={t('common.back')} onPress={() => setIndex((i) => i - 1)} /> : null}
            <Button style={{ flex: 1 }} label={last ? t('fp.finish') : t('common.continue')} loading={busy} onPress={next} />
          </View>
          {!last && index > 0 ? <Button variant="ghost" full label={t('fp.skip')} onPress={() => setIndex((i) => i + 1)} /> : null}
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Logo size={40} />
        <Text variant="caption" tone="subtle" style={{ flex: 1 }}>
          {t('fp.step', { current: index + 1, total: STEP_IDS.length })}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void finish()} hitSlop={10} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }} disabled={busy}>
          <Text variant="small" weight="700" style={{ color: colors.primary }}>
            {t('fp.later')}
          </Text>
        </Pressable>
      </View>
      <ProgressBar value={((index + 1) / STEP_IDS.length) * 100} tone="success" />
      <Text variant="h1" style={{ marginTop: 20, marginBottom: 6 }} accessibilityRole="header">
        {t(title)}
      </Text>
      <Text tone="muted" style={{ marginBottom: 16 }}>
        {t(hint)}
      </Text>
      {step === 'country' && askName ? <Field label={t('fp.name')} value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" maxLength={80} /> : null}
      {step === 'country' ? <CountryStep draft={draft} onChange={setDraft} currencyTouched={currencyTouched} onCurrencyTouched={() => setCurrencyTouched(true)} /> : null}
      {step === 'situation' ? <SituationStep draft={draft} onChange={setDraft} /> : null}
      {step === 'income' ? <IncomeStep draft={draft} onChange={setDraft} /> : null}
      {step === 'money' ? <MoneyStep draft={draft} onChange={setDraft} /> : null}
      {step === 'charges' ? <ChargesStep draft={draft} onChange={setDraft} /> : null}
      {step === 'goals' ? <GoalsStep draft={draft} onChange={setDraft} /> : null}
    </Screen>
  );
}
