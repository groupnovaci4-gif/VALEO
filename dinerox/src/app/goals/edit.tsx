import React, { useState } from 'react';
import { useRunAction } from '@/hooks/useRunAction';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/hooks/goBack';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { Banner, Button, EmptyState, Screen, useToast } from '@/components/ui';
import { GoalFields, draftFromGoal, useGoalCategories, type GoalDraft } from '@/features/goals';
import { goalSaved } from '@/core/balance';
import { withSpaceReady } from '@/components/SpaceReady';

/** Modification : montant, date, priorité, rythme… L'historique des changements est conservé. */
function EditGoal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const actions = useActions();
  const run = useRunAction();
  const categories = useGoalCategories();
  const goal = data.goals.find((g) => g.id === id);
  const [draft, setDraft] = useState<GoalDraft | null>(goal ? draftFromGoal(goal) : null);
  const [error, setError] = useState<string | null>(null);
  if (!goal || !draft) return (
      <Screen back>
        <EmptyState emoji="🎯" title={t('goal.notFound')} />
      </Screen>
    );
  const save = () => {
    if (!draft.name.trim()) return setError(t('error.name.required'));
    const targetAmount = draft.targetAmount;
    if (!targetAmount) return setError(t('error.amount.invalid'));
    const cat = categories.find((c) => c.id === draft.categoryId);
    const ok = run(() => actions.updateGoal(goal.id, {
      name: draft.name.trim(),
      targetAmount,
      targetDate: draft.targetDate,
      priority: draft.priority,
      monthlyContribution: draft.monthlyContribution,
      accountId: draft.accountId,
      scope: draft.scope,
      planned: draft.planned.filter((p) => p.monthly > 0),
      icon: draft.icon,
      categoryId: cat ? cat.id : draft.categoryId,
    }));
    if (!ok) return;
    toast.show(t('common.saved'));
    goBack();
  };
  return (
    <Screen back title={t('common.edit')} edges={['top', 'bottom']} footer={<Button full label={t('common.save')} onPress={save} />}>
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}
      <GoalFields draft={draft} onChange={setDraft} categories={categories} saved={goalSaved(goal, data.goalContributions)} editing />
    </Screen>
  );
}

export default withSpaceReady(EditGoal);
