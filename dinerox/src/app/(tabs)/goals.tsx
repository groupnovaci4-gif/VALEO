/**
 * Objectifs : projets de vie, triés par priorité (réordonnables), aide à la
 * répartition de la capacité d'épargne, suggestions, objectifs terminés.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Button, Card, EmptyState, IconButton, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { GoalCard, InsightCard, SpaceSwitcher } from '@/features/rows';
import { allocateCapacity, goalPlanFor, sortGoals } from '@/core/goals';
import { savingsCapacity } from '@/core/insights';
import { can } from '@/core/permissions';

export default function Goals() {
  const { t } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const actions = useActions();
  const { data, now, currency, insights } = useFinance();
  const active = useMemo(() => sortGoals(data.goals.filter((g) => g.status === 'active' || g.status === 'paused')), [data.goals]);
  const closed = useMemo(() => data.goals.filter((g) => g.status === 'completed' || g.status === 'archived' || g.status === 'abandoned'), [data.goals]);
  const detected = useMemo(() => savingsCapacity(data.transactions, now, currency), [data.transactions, now, currency]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const cap = capacity ?? (detected && detected > 0 ? detected : null);
  const allocation = useMemo(() => (cap ? allocateCapacity(cap, data.goals, data.goalContributions, now) : []), [cap, data.goals, data.goalContributions, now]);
  const suggestions = insights.filter((i) => i.kind === 'suggest_emergency_fund' || i.kind === 'suggest_goal_capacity' || i.kind === 'savings_capacity');
  const canCreate = can(role, 'create', 'goals');
  const canEdit = can(role, 'update', 'goals');
  const move = (index: number, dir: -1 | 1) => {
    const ids = active.filter((g) => g.status === 'active').map((g) => g.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    actions.reorderGoals(ids);
  };

  return (
    <Screen title={t('goal.title')} subtitle={t('goal.tagline')} right={canCreate ? <IconButton icon="add-circle" label={t('goal.new')} onPress={() => router.push('/goals/new')} size={30} /> : undefined}>
      <SpaceSwitcher />
      {suggestions.slice(0, 2).map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
      {active.length === 0 ? (
        <Card>
          <EmptyState title={t('goal.empty.title')} body={t('goal.empty.body')} action={canCreate ? t('goal.empty.cta') : undefined} onAction={() => router.push('/goals/new')} />
        </Card>
      ) : (
        active.map((g, i) => (
          <View key={g.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="caption" tone="subtle">
                {g.status === 'active' ? t('goal.rank', { rank: i + 1 }) : t('goal.status.paused')}
              </Text>
              {canEdit && g.status === 'active' && active.length > 1 ? (
                <View style={{ flexDirection: 'row' }}>
                  <IconButton icon="chevron-up" label={t('goal.moveUp')} onPress={() => move(i, -1)} size={18} />
                  <IconButton icon="chevron-down" label={t('goal.moveDown')} onPress={() => move(i, 1)} size={18} />
                </View>
              ) : null}
            </View>
            <GoalCard goal={g} plan={goalPlanFor(g, data.goalContributions, now)} />
          </View>
        ))
      )}

      {active.filter((g) => g.status === 'active').length > 1 ? (
        <>
          <SectionHeader title={t('goal.distribute.title')} />
          <Card>
            <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
              {t('goal.distribute.hint')}
            </Text>
            <AmountField label={t('goal.distribute.capacity')} value={cap} onChange={setCapacity} currency={currency} />
            {allocation.map((l) => {
              const g = data.goals.find((x) => x.id === l.goalId)!;
              return <Row key={l.goalId} title={`${g.icon} ${g.name}`} subtitle={l.need ? `${money(l.need)}${t('common.perMonth')}` : undefined} right={<Text weight="700">{money(l.amount)}</Text>} />;
            })}
          </Card>
        </>
      ) : null}

      {closed.length ? (
        <>
          <SectionHeader title={t('goal.closed')} />
          <Card>
            {closed.map((g) => (
              <Row key={g.id} title={`${g.icon} ${g.name}`} subtitle={t(`goal.status.${g.status}`)} chevron onPress={() => router.push(`/goals/${g.id}`)} />
            ))}
          </Card>
        </>
      ) : null}
      {canCreate && active.length ? <Button variant="secondary" icon="add" label={t('goal.new')} onPress={() => router.push('/goals/new')} style={{ marginTop: 16 }} /> : null}
    </Screen>
  );
}
