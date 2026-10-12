/** Créer ou modifier une enveloppe (design system v2). */
import React, { useState } from 'react';
import { Alert, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { useCategoryLabels, useCurrency } from '@/hooks/useFinance';
import { AmountField, Banner, Button, ChipGroup, Field, Screen, Text, useToast } from '@/components/ui';
import { BIG_TEXT, DesignV2, pickableColors } from '@/theme';
import { useActionErrorMessage, useRunAction } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';

const ICONS = ['home', 'restaurant', 'car', 'heart', 'wallet', 'rocket', 'sparkles', 'school', 'medkit', 'shirt', 'game-controller', 'call', 'gift', 'people'];

function EnvelopeEdit() {
  // `categoryId` : proposé par la conversation de saisie (« Vous n'avez pas d'enveloppe pour la Santé »).
  const { id, categoryId } = useLocalSearchParams<{ id?: string; categoryId?: string }>();
  const { t } = useI18n();
  const big = useWindowDimensions().fontScale >= BIG_TEXT;
  const errorMessage = useActionErrorMessage();
  const toast = useToast();
  const data = useData();
  const currency = useCurrency();
  const actions = useActions();
  const run = useRunAction();
  const cats = useCategoryLabels();
  const existing = data.envelopes.find((e) => e.id === id);
  const [name, setName] = useState(existing?.name ?? (categoryId ? cats.byId(categoryId) : ''));
  const [budget, setBudget] = useState<number | null>(existing?.monthlyBudget ?? null);
  const [icon, setIcon] = useState(existing?.icon ?? 'wallet');
  const [color, setColor] = useState(existing?.color ?? pickableColors[0]);
  const [categoryIds, setCategoryIds] = useState<string[]>(existing?.categoryIds ?? (categoryId ? [categoryId] : []));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      actions.saveEnvelope({ id: existing?.id, name: name.trim(), icon, color, monthlyBudget: budget ?? 0, categoryIds, order: existing?.order ?? data.envelopes.length, active: true });
      toast.show(t('common.saved'));
      goBack();
    } catch (e) {
      if (e instanceof ActionError && e.code === 'limit') setError(t('error.limit', { limit: e.details.limit ?? '' }));
      else setError(errorMessage(e, 'error.name.required'));
    }
  };
  const remove = () =>
    Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void (run(() => actions.remove('envelopes', existing!.id)) && goBack()) },
    ]);
  return (
    <Screen
      back
      title={existing ? t('env.edit') : t('env.new')}
      footer={
        // « Enregistrer » est la seule action principale ; « Supprimer » est destructive (teintée),
        // dessous en texte agrandi pour garder les deux libellés entiers.
        <View style={{ flexDirection: big ? 'column-reverse' : 'row', gap: 10 }}>
          {existing ? <Button variant="destructive" icon="trash-outline" label={t('common.delete')} onPress={remove} /> : null}
          <Button style={big ? undefined : { flex: 1 }} label={t('common.save')} onPress={save} />
        </View>
      }
    >
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <Field label={t('common.name')} value={name} onChangeText={setName} maxLength={80} />
      <AmountField label={t('env.budget')} value={budget} onChange={setBudget} currency={currency} />
      <Text variant="label" style={{ marginBottom: 8 }}>
        {t('env.categories')}
      </Text>
      <ChipGroup
        multiple
        options={cats.list('expense').map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
        value={categoryIds}
        onChange={(c) => setCategoryIds((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}
      />
      <Text variant="label" style={{ marginBottom: 8 }}>
        {t('acc.color')}
      </Text>
      <ChipGroup scroll options={pickableColors.map((c, i) => ({ value: c, label: '', color: c, icon: 'ellipse', a11yLabel: `${t('acc.color')} ${i + 1}` }))} value={color} onChange={setColor} />
      <ChipGroup scroll options={ICONS.map((i) => ({ value: i, label: '', icon: i, a11yLabel: `${t('common.icon')} ${i}` }))} value={icon} onChange={setIcon} />
    </Screen>
  );
}

const Ready = withSpaceReady(EnvelopeEdit);

export default function EnvelopeEditScreen() {
  return (
    <DesignV2>
      <Ready />
    </DesignV2>
  );
}
