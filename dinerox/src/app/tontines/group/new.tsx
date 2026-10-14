/**
 * « Nouvelle tontine partagée » (étape 3) : tontine TOURNANTE seulement.
 * Réservé aux formules Plus et Family (le serveur le vérifie aussi) ;
 * rejoindre reste gratuit. Mention obligatoire à la création (décision 8).
 * Aucun membre n'est ajouté ici : les places sont libres, les personnes
 * rejoignent avec un code et l'organisateur valide chaque demande.
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { DesignV2 } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { AmountField, Banner, Button, ChipGroup, DateField, Field, Loading, Screen, Text } from '@/components/ui';
import { hasFeature } from '@/core/subscription';
import { today } from '@/core/dates';
import { analytics } from '@/services/analytics';
import { tontineGroupCall } from '@/services/tontineGroups';
import type { TontineFrequency } from '@/core/types';

const FREQS: TontineFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const int = (v: string) => {
  const n = Number(v.replace(/\D/g, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
};

export default function NewTontineGroup() {
  return (
    <DesignV2>
      <NewGroupScreen />
    </DesignV2>
  );
}

function NewGroupScreen() {
  const { profile, mode } = useApp();
  if (mode === 'firebase' && !profile) return <Loading />;
  return <NewGroupForm />;
}

function NewGroupForm() {
  const { t } = useI18n();
  const { plan, profile, online } = useApp();
  const currency = profile?.currency ?? 'XOF';
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<TontineFrequency>('monthly');
  const [startDate, setStartDate] = useState(today());
  const [slots, setSlots] = useState('');
  const [mySlots, setMySlots] = useState('1');
  const [label, setLabel] = useState(profile?.firstName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasFeature(plan, 'tontine_group_create')) {
    return (
      <Screen back title={t('tg.create.title')}>
        <Banner tone="info" icon="sparkles-outline" text={t('tg.create.plan')} />
      </Screen>
    );
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { groupId } = await tontineGroupCall<{ groupId: string }>('create', {
        name,
        currency,
        amountPerShare: amount,
        frequency,
        startDate,
        slotsCount: int(slots),
        organizerSlots: int(mySlots) ?? 1,
        organizerLabel: label,
      });
      analytics.track('tontine_created', { mode: 'group' });
      router.replace(`/tontines/group/${groupId}`);
    } catch {
      // Refus du serveur (formule, paramètres) ou réseau : message dans l'écran.
      setError(t('tg.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const valid = name.trim() && amount && int(slots) && (int(slots) ?? 0) >= 2 && (int(mySlots) ?? 0) >= 1 && (int(mySlots) ?? 0) < (int(slots) ?? 0) && label.trim();
  return (
    <Screen back title={t('tg.create.title')} footer={<Button full label={t('tg.create.submit')} loading={busy} disabled={!online || !valid} onPress={() => void create()} />}>
      <Text tone="muted" style={{ marginBottom: 12 }}>
        {t('tg.create.intro')}
      </Text>
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Field label={t('tg.field.name')} value={name} onChangeText={setName} maxLength={60} />
      <AmountField label={t('tg.field.amount')} value={amount} onChange={setAmount} currency={currency} />
      <Text variant="label" style={{ marginBottom: 8 }}>
        {t('tontine.frequency')}
      </Text>
      <ChipGroup scroll value={frequency} onChange={setFrequency} options={FREQS.map((f) => ({ value: f, label: t(`tontine.freq.${f}` as TKey) }))} />
      <DateField label={t('tg.field.start')} value={startDate} onChange={(v) => v && setStartDate(v)} shortcuts={false} />
      <Field label={t('tg.field.slots')} value={slots} onChangeText={setSlots} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
      <Field label={t('tg.field.mySlots')} value={mySlots} onChangeText={setMySlots} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
      <Field label={t('tg.field.myLabel')} hint={t('tg.field.myLabel.hint')} value={label} onChangeText={setLabel} maxLength={40} />
      {/* Mention obligatoire à la création (décision 8). */}
      <Text variant="small" tone="muted">
        {t('tontine.legal')}
      </Text>
    </Screen>
  );
}
