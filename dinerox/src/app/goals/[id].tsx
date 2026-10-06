import React, { useEffect, useMemo, useState } from 'react';
import { useRunAction } from '@/hooks/useRunAction';
import { Alert, Modal, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useAccountLabel, useFinance, useMoney } from '@/hooks/useFinance';
import { Badge, Button, Card, EmptyState, ProgressBar, Row, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { GoalPlanPanel } from '@/features/goals';
import { goalPlanFor, shouldCelebrate } from '@/core/goals';
import { can } from '@/core/permissions';
import type { GoalStatus } from '@/core/types';
import { withSpaceReady } from '@/components/SpaceReady';
import { useCoach } from '@/features/coach/CoachProvider';

function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, date, monthYear } = useI18n();
  const { colors, radius } = useTheme();
  const toast = useToast();
  const { role } = useApp();
  const money = useMoney();
  const accountLabel = useAccountLabel();
  const actions = useActions();
  const runAction = useRunAction();
  const { data, now } = useFinance();
  const goal = data.goals.find((g) => g.id === id);
  const plan = useMemo(() => (goal ? goalPlanFor(goal, data.goalContributions, now) : null), [goal, data.goalContributions, now]);
  const contributions = useMemo(() => data.goalContributions.filter((c) => c.goalId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), [data.goalContributions, id]);
  const [dismissed, setDismissed] = useState(false);
  const celebrate = !dismissed && !!goal && shouldCelebrate(goal, data.goalContributions);
  const setCelebrate = (open: boolean) => setDismissed(!open);
  // Objectif atteint : la récompense est enregistrée (une seule fois par objectif) ;
  // cette fenêtre reste la célébration, le coach n'en ajoute pas une seconde.
  const { checkRewards } = useCoach();
  useEffect(() => {
    if (celebrate) void checkRewards({ overlay: false }).catch(() => undefined);
  }, [celebrate, checkRewards]);

  if (!goal || !plan) {
    return (
      <Screen back>
        <EmptyState emoji="🎯" title={t('goal.empty.title')} />
      </Screen>
    );
  }
  const canEdit = can(role, 'update', 'goals');
  const canContribute = can(role, 'create', 'goalContributions');
  const setStatus = (s: GoalStatus, confirmKey?: TKey) => {
    const run = () => {
      if (runAction(() => actions.setGoalStatus(goal.id, s))) toast.show(t(`goal.status.${s}` as TKey));
    };
    if (!confirmKey) return run();
    Alert.alert(t(confirmKey), goal.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: run },
    ]);
  };
  const statusTone = goal.status === 'completed' ? 'success' : goal.status === 'paused' ? 'warning' : goal.status === 'abandoned' ? 'danger' : goal.status === 'archived' ? 'neutral' : 'info';

  return (
    <Screen back title={`${goal.icon} ${goal.name}`} right={canEdit ? <Button small variant="ghost" icon="create-outline" label={t('common.edit')} onPress={() => router.push(`/goals/edit?id=${goal.id}`)} /> : undefined}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Badge label={t(`goal.status.${goal.status}` as TKey)} tone={statusTone} />
          <Text variant="caption" tone="muted">
            {t(`goal.priority.${goal.priority}` as TKey)} · {t(`goal.scope.${goal.scope}` as TKey)}
          </Text>
        </View>
        <Text variant="h1">{money(plan.saved)}</Text>
        <Text tone="muted" style={{ marginBottom: 12 }}>
          / {money(plan.target)}
        </Text>
        <ProgressBar value={plan.percent} tone={plan.reached ? 'success' : 'primary'} height={12} label={goal.name} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text variant="small">{plan.percent} %</Text>
          <Text variant="small">{t('goal.left', { amount: money(plan.remaining) })}</Text>
        </View>
        {goal.targetDate ? (
          <Text variant="small" tone="muted" style={{ marginTop: 6 }}>
            {t('goal.planned.date', { date: monthYear(goal.targetDate) })}
          </Text>
        ) : null}
        {goal.accountId ? (
          <Text variant="small" tone="muted">
            {t('goal.account')} : {accountLabel(goal.accountId)}
          </Text>
        ) : null}
      </Card>

      {canContribute && goal.status === 'active' ? (
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
          <Button style={{ flex: 1 }} icon="add" label={t('goal.contribute')} onPress={() => router.push(`/goals/contribute?id=${goal.id}`)} />
          {plan.saved > 0 && canEdit ? <Button variant="secondary" icon="remove" label={t('goal.withdraw')} onPress={() => router.push(`/goals/contribute?id=${goal.id}&withdraw=1`)} /> : null}
        </View>
      ) : (
        <View style={{ height: 14 }} />
      )}

      <GoalPlanPanel plan={plan} targetDate={goal.targetDate} onAskMonthly={canEdit ? () => router.push(`/goals/edit?id=${goal.id}`) : undefined} />

      <SectionHeader title={t('goal.history')} />
      <Card>
        {contributions.length ? (
          contributions.map((c) => (
            <Row
              key={c.id}
              title={money(c.amount, { signed: true })}
              subtitle={[date(c.date), c.accountId ? accountLabel(c.accountId) : null, c.note].filter(Boolean).join(' · ')}
              right={c.transferId ? <Badge label={t('tx.transfer')} tone="info" /> : undefined}
            />
          ))
        ) : (
          <EmptyState title={t('goal.contribute')} body={t('goal.calc.askMonthly')} />
        )}
      </Card>

      {goal.history.length ? (
        <>
          <SectionHeader title={t('goal.changes')} />
          <Card>
            {[...goal.history].reverse().map((h, i) => {
              const fmt = (v: string | number | null) =>
                v === null ? '—' : h.field === 'targetAmount' || h.field === 'monthlyContribution' ? money(Number(v)) : h.field === 'targetDate' ? monthYear(String(v)) : h.field === 'status' ? t(`goal.status.${v}` as TKey) : h.field === 'priority' ? t(`goal.priority.${v}` as TKey) : String(v);
              return <Row key={i} title={t(`goal.change.${h.field}` as TKey)} subtitle={`${fmt(h.from)} → ${fmt(h.to)} · ${date(new Date(h.at).toISOString().slice(0, 10))}`} />;
            })}
          </Card>
        </>
      ) : null}

      {canEdit ? (
        <View style={{ gap: 8, marginTop: 20 }}>
          {goal.status === 'active' ? (
            <>
              {plan.reached ? <Button variant="success" icon="trophy" label={t('goal.action.complete')} onPress={() => setStatus('completed')} /> : null}
              <Button variant="secondary" icon="pause" label={t('goal.action.pause')} onPress={() => setStatus('paused')} />
              <Button variant="ghost" label={t('goal.action.abandon')} onPress={() => setStatus('abandoned', 'goal.action.abandon')} />
            </>
          ) : null}
          {goal.status === 'paused' ? <Button variant="secondary" icon="play" label={t('goal.action.resume')} onPress={() => setStatus('active')} /> : null}
          {goal.status === 'abandoned' || goal.status === 'archived' ? <Button variant="secondary" label={t('goal.action.reactivate')} onPress={() => setStatus('active')} /> : null}
          {goal.status !== 'archived' ? <Button variant="ghost" icon="archive-outline" label={t('goal.action.archive')} onPress={() => setStatus('archived', 'goal.action.archive')} /> : null}
        </View>
      ) : null}

      <Modal visible={celebrate} transparent animationType="fade" onRequestClose={() => setCelebrate(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 12, width: '100%', maxWidth: 420 }} accessibilityViewIsModal>
            <Text style={{ fontSize: 56 }}>🎉</Text>
            <Text variant="h2" align="center">
              {t('goal.celebrate.title')}
            </Text>
            <Text tone="muted" align="center">
              {t('goal.celebrate.body')}
            </Text>
            <Text variant="h3" align="center">
              {goal.icon} {goal.name}
            </Text>
            <Text align="center">{t('goal.celebrate.amount', { amount: money(goal.targetAmount) })}</Text>
            <Text variant="small" tone="muted" align="center">
              🏆 {t('reward.goal_achieved.name')}
            </Text>
            {canEdit ? (
              <>
                <Button full variant="success" icon="trophy" label={t('goal.action.complete')} onPress={() => (setCelebrate(false), setStatus('completed'))} />
                <Button full variant="secondary" icon="archive-outline" label={t('goal.action.archive')} onPress={() => (setCelebrate(false), runAction(() => (actions.setGoalStatus(goal.id, 'completed'), actions.setGoalStatus(goal.id, 'archived'))))} />
              </>
            ) : null}
            <Button full variant="ghost" label={t('goal.celebrate.new')} onPress={() => (setCelebrate(false), router.push('/goals/new'))} />
            <Button full variant="ghost" label={t('common.close')} onPress={() => setCelebrate(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

export default withSpaceReady(GoalDetail);
