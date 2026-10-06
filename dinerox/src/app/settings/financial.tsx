/**
 * Mon profil financier : les informations de l'inscription, modifiables à tout
 * moment et complétables progressivement. N'écrit aucune opération.
 */
import React, { useState } from 'react';
import { goBack } from '@/hooks/goBack';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Button, Card, Loading, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { ChargesStep, CountryStep, GoalsStep, IncomeStep, SituationStep } from '@/features/FinancialProfileSteps';
import { draftFromProfile, toFinancialProfile, type FinancialDraft } from '@/core/financialProfile';

export default function FinancialProfileScreen() {
  const { profile } = useApp();
  // Le formulaire s'initialise avec le profil chargé (jamais avec des valeurs par défaut).
  if (!profile) return <Loading />;
  return <FinancialProfileForm key={profile.uid} />;
}

function FinancialProfileForm() {
  const { t } = useI18n();
  const toast = useToast();
  const { profile, updateProfile } = useApp();
  const [draft, setDraft] = useState<FinancialDraft>(() => draftFromProfile(profile?.country ?? 'CI', profile?.currency ?? 'XOF', profile?.financial));
  const [touched, setTouched] = useState(true);
  const save = () => {
    void updateProfile({ country: draft.country, currency: draft.currency, financial: { ...(profile?.financial ?? {}), ...toFinancialProfile(draft, Date.now()), paymentMethods: profile?.financial?.paymentMethods ?? [] } });
    toast.show(t('fp.saved'));
    goBack();
  };
  return (
    <Screen back title={t('fp.edit.title')} edges={['top', 'bottom']} footer={<Button full label={t('common.save')} onPress={save} />}>
      <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
        {t('fp.edit.saveHint')}
      </Text>
      <SectionHeader title={t('fp.country.title')} />
      <CountryStep draft={draft} onChange={setDraft} currencyTouched={touched} onCurrencyTouched={() => setTouched(true)} />
      <SectionHeader title={t('fp.situation.title')} />
      <SituationStep draft={draft} onChange={setDraft} />
      <SectionHeader title={t('fp.income.title')} />
      <IncomeStep draft={draft} onChange={setDraft} />
      <SectionHeader title={t('fp.charges.title')} />
      <Card padded={false} style={{ borderWidth: 0, backgroundColor: 'transparent' }}>
        <ChargesStep draft={draft} onChange={setDraft} />
      </Card>
      <SectionHeader title={t('fp.goals.title')} />
      <GoalsStep draft={draft} onChange={setDraft} />
    </Screen>
  );
}
