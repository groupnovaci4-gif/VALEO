/**
 * Création d'un objectif :
 *  A. choisir une catégorie puis un modèle (cartes) ;
 *  B. « ✏️ Créer mon propre objectif » — TOUJOURS proposé — avec
 *     suggestion automatique de catégorie (Oui | Modifier) ;
 * puis le formulaire avec calcul en direct.
 * Paramètres optionnels (assistant IA) : name, amount, targetDate.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { useCurrency } from '@/hooks/useFinance';
import { Banner, Button, Card, Field, Screen, Text, useToast } from '@/components/ui';
import { CategorySuggestion, GoalFields, useGoalCategories, type GoalDraft } from '@/features/goals';
import { CUSTOM_GOAL_CATEGORY, type GoalCategory, type GoalTemplate } from '@/core/goalCategories';
import { UpgradeCard } from '@/features/rows';
import { withSpaceReady } from '@/components/SpaceReady';

type Step = 'choose' | 'custom' | 'form';

const emptyDraft = (): GoalDraft => ({
  name: '',
  categoryId: CUSTOM_GOAL_CATEGORY,
  templateId: null,
  icon: '🎯',
  targetAmount: null,
  initialAmount: null,
  targetDate: null,
  priority: 'normal',
  monthlyContribution: null,
  accountId: null,
  scope: 'personal',
  planned: [],
});

function NewGoal() {
  const p = useLocalSearchParams<{ name?: string; amount?: string; targetDate?: string; ai?: string }>();
  const { t, lang } = useI18n();
  const { colors, radius } = useTheme();
  const toast = useToast();
  const { activeSpace } = useApp();
  const currency = useCurrency();
  const actions = useActions();
  const categories = useGoalCategories();
  const fromAi = !!p.name;
  const [step, setStep] = useState<Step>(fromAi ? 'custom' : 'choose');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(() => ({
    ...emptyDraft(),
    name: p.name ?? '',
    targetAmount: p.amount ? Number(p.amount) : null,
    targetDate: p.targetDate ?? null,
    scope: activeSpace?.kind === 'family' ? 'family' : 'personal',
  }));
  const [error, setError] = useState<string | null>(null);

  const pickTemplate = (cat: GoalCategory, tpl: GoalTemplate) => {
    setDraft((d) => ({ ...d, categoryId: cat.id, templateId: tpl.id, icon: tpl.icon ?? cat.icon, name: tpl.defaultName?.[lang] ?? tpl.label[lang] }));
    setStep('form');
  };

  const create = () => {
    setError(null);
    if (!draft.name.trim()) return setError(t('error.name.required'));
    if (!draft.targetAmount) return setError(t('error.amount.invalid'));
    const cat = categories.find((c) => c.id === draft.categoryId);
    try {
      const g = actions.createGoal({
        name: draft.name.trim(),
        categoryId: draft.categoryId,
        templateId: draft.templateId,
        type: cat?.type ?? 'custom',
        icon: draft.icon,
        currency,
        targetAmount: draft.targetAmount,
        initialAmount: draft.initialAmount ?? 0,
        targetDate: draft.targetDate,
        priority: draft.priority,
        rank: 0,
        accountId: draft.accountId,
        monthlyContribution: draft.monthlyContribution,
        scope: draft.scope,
        planned: draft.planned.filter((x) => x.monthly > 0),
        status: 'active',
        history: [],
      });
      toast.show(t('common.saved'));
      router.replace(`/goals/${g.id}`);
    } catch (e) {
      if (e instanceof ActionError && e.code === 'limit') setError('limit');
      else if (e instanceof ActionError && e.code === 'permission') setError(t('error.permission'));
      else setError(t('error.generic'));
    }
  };

  if (step === 'choose') {
    return (
      <Screen back title={t('goal.choose')} edges={['top', 'bottom']}>
        <Text tone="muted" style={{ marginBottom: 14 }}>
          {t('goal.tagline')}
        </Text>
        <Card onPress={() => setStep('custom')} style={{ marginBottom: 12, borderColor: colors.ai, borderWidth: 1.5 }} accessibilityLabel={t('goal.custom')}>
          <Text variant="bodyStrong">{t('goal.custom')}</Text>
          <Text variant="small" tone="muted">
            {t('goal.customHint')}
          </Text>
        </Card>
        {categories.map((c) => (
          <Card key={c.id} style={{ marginBottom: 10 }} onPress={() => setOpen(open === c.id ? null : c.id)} accessibilityLabel={c.label[lang]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 28 }}>{c.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{c.label[lang]}</Text>
                <Text variant="caption" tone="muted">
                  {c.description[lang]}
                </Text>
              </View>
            </View>
            {open === c.id ? (
              <View style={{ marginTop: 10, gap: 6 }}>
                {c.templates.map((tpl) => (
                  <Pressable
                    key={tpl.id}
                    accessibilityRole="button"
                    onPress={() => pickTemplate(c, tpl)}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 48, borderRadius: radius.md, backgroundColor: pressed ? colors.border : colors.surfaceAlt })}
                  >
                    <Text>{tpl.icon ?? c.icon}</Text>
                    <Text variant="small" weight="600">
                      {tpl.label[lang]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ))}
      </Screen>
    );
  }

  if (step === 'custom') {
    return (
      <Screen back title={t('goal.custom')} edges={['top', 'bottom']} footer={<Button full label={t('common.continue')} disabled={!draft.name.trim()} onPress={() => setStep('form')} />}>
        <Text tone="muted" style={{ marginBottom: 14 }}>
          {t('goal.customHint')}
        </Text>
        <Field value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} placeholder={t('goal.customPlaceholder')} autoFocus={!fromAi} />
        <CategorySuggestion
          text={draft.name}
          categories={categories}
          onAccept={(c, icon) => {
            setDraft((d) => ({ ...d, categoryId: c.id, icon: icon ?? c.icon }));
            setStep('form');
          }}
          onChange={() => setStep('form')}
        />
        {p.ai ? <Banner tone="info" icon="information-circle" text={t('goal.ai.estimate')} /> : null}
      </Screen>
    );
  }

  return (
    <Screen back title={t('goal.new')} edges={['top', 'bottom']} footer={<Button full label={t('goal.create')} onPress={create} />}>
      {error === 'limit' ? <UpgradeCard feature="multiple_goals" text={t('error.limit', { limit: '' })} /> : error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <GoalFields draft={draft} onChange={setDraft} categories={categories} />
    </Screen>
  );
}

export default withSpaceReady(NewGoal);
