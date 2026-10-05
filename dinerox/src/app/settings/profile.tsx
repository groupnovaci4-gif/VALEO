import React, { useState } from 'react';
import { goBack } from '@/hooks/goBack';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Button, ChipGroup, Field, Loading, Screen, Text, useToast } from '@/components/ui';
import { COUNTRIES, countryProfile } from '@/config/countries';
import { CURRENCIES, type CurrencyCode } from '@/core/money';
import { updateSpaceInfo } from '@/services/spaces';

export default function Profile() {
  const { profile } = useApp();
  // Formulaire initialisé avec le profil chargé : un enregistrement ne peut pas écraser le vrai profil.
  if (!profile) return <Loading />;
  return <ProfileForm key={profile.uid} />;
}

function ProfileForm() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { profile, updateProfile, mode, user, activeSpace } = useApp();
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [country, setCountry] = useState(profile?.country ?? 'CI');
  const [currency, setCurrency] = useState<CurrencyCode>(profile?.currency ?? 'XOF');
  if (!profile) return null;
  const save = async () => {
    await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || null, country, currency });
    // La devise de l'espace personnel suit la devise principale (aucune conversion des montants).
    if (mode === 'firebase' && user && activeSpace?.id === user.uid && activeSpace.currency !== currency) void updateSpaceInfo(user.uid, { currency }).catch(() => undefined);
    toast.show(t('common.saved'));
    goBack();
  };
  return (
    <Screen back title={t('set.profile')} footer={<Button full label={t('common.save')} onPress={() => void save()} />}>
      <Field label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} maxLength={80} />
      <Field label={t('auth.lastName')} value={lastName} onChangeText={setLastName} maxLength={80} />
      {profile.email ? <Field label={t('auth.email')} value={profile.email} editable={false} /> : null}
      <Field label={t('set.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('set.country')}
      </Text>
      <ChipGroup scroll value={country} onChange={setCountry} options={COUNTRIES.map((c) => ({ value: c, label: countryProfile(c).name[lang], emoji: countryProfile(c).flag }))} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('set.currency')}
      </Text>
      <ChipGroup scroll value={currency} onChange={setCurrency} options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: `${c.code} · ${c.name[lang]}` }))} />
      <Text variant="caption" tone="subtle">
        {t('fp.currency.hint')}
      </Text>
      <Field label={t('set.timezone')} value={profile.timezone} editable={false} />
    </Screen>
  );
}
