/**
 * Objectifs : projets de vie, triés par priorité (réordonnables), aide à la
 * répartition de la capacité d'épargne, suggestions, objectifs terminés.
 */
import { useRunAction } from '@/hooks/useRunAction';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Badge, Button, Card, EmptyState, GradientCard, Icon, IconButton, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useInsightText } from '@/hooks/useInsightText';
import { GoalCard, SpaceSwitcher } from '@/features/rows';
import { allocateCapacity, goalPlanFor, sortGoals } from '@/core/goals';
import { observedCapacity } from '@/core/intelligence';
import { can } from '@/core/permissions';
import { isReserve } from '@/core/reserve';
import { ReserveSection } from '@/features/reserve/ReserveSection';

export default function Goals() {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const renderInsight = useInsightText();
  const { role } = useApp();
  const money = useMoney();
  const actions = useActions();
  const run = useRunAction();
  const { data, now, currency, insights } = useFinance();
  // Les réserves ont leur propre section (au-dessus) : hors liste, totaux et répartition des objectifs.
  const goalsOnly = useMemo(() => data.goals.filter((g) => !isReserve(g)), [data.goals]);
  const active = useMemo(() => sortGoals(goalsOnly.filter((g) => g.status === 'active' || g.status === 'paused')), [goalsOnly]);
  const closed = useMemo(() => goalsOnly.filter((g) => g.status === 'completed' || g.status === 'archived' || g.status === 'abandoned'), [goalsOnly]);
  const detected = useMemo(() => observedCapacity(data, currency, now), [data, currency, now]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const cap = capacity ?? (detected && detected > 0 ? detected : null);
  const allocation = useMemo(() => (cap ? allocateCapacity(cap, goalsOnly, data.goalContributions, now, 1000, currency) : []), [cap, goalsOnly, data.goalContributions, now, currency]);
  const suggestions = insights.filter((i) => i.kind === 'suggest_emergency_fund' || i.kind === 'suggest_goal_capacity' || i.kind === 'savings_capacity');
  const canCreate = can(role, 'create', 'goals');
  const canEdit = can(role, 'update', 'goals');
  // Ordre de priorité des seuls objectifs actifs (les objectifs en pause sont
  // listés mais hors classement : l'index d'affichage ne convient donc pas).
  const rankedIds = active.filter((g) => g.status === 'active').map((g) => g.id);
  const move = (goalId: string, dir: -1 | 1) => {
    const ids = [...rankedIds];
    const index = ids.indexOf(goalId);
    const j = index + dir;
    if (index < 0) return;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => actions.reorderGoals(ids));
  };

  const plans = useMemo(() => active.map((g) => ({ g, plan: goalPlanFor(g, data.goalContributions, now) })), [active, data.goalContributions, now]);
  // Synthèse réelle des objectifs actifs chiffrés (aucun chiffre inventé).
  const totals = useMemo(() => {
    const withTarget = plans.filter((p) => p.g.status === 'active' && p.g.targetAmount > 0);
    const saved = withTarget.reduce((n, p) => n + Math.min(p.plan.saved, p.plan.target), 0);
    const target = withTarget.reduce((n, p) => n + p.plan.target, 0);
    return { saved, target, pct: target > 0 ? Math.round((saved / target) * 100) : 0, count: plans.filter((p) => p.g.status === 'active').length };
  }, [plans]);
  const tip = suggestions[0];

  return (
    <Screen brandSection={t('tab.goals')}>
      <SpaceSwitcher />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Text variant="h1">{t('goal.title')}</Text>
          {totals.count ? <Badge tone="success" label={t(totals.count === 1 ? 'goal.activeCount.one' : 'goal.activeCount', { count: totals.count })} /> : null}
        </View>
        {canCreate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('goal.new')}
            onPress={() => router.push('/goals/new')}
            style={({ pressed }) => ({ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
          >
            <Icon name="add" size={28} color={colors.onPrimary} />
          </Pressable>
        ) : null}
      </View>
      <Text tone="muted" style={{ marginBottom: 14 }}>
        {t('goal.tagline')}
      </Text>

      {totals.target > 0 ? (
        <GradientCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="star-outline" size={16} color={colors.onHero} />
            <Text variant="overline" tone="onHero" style={{ flexShrink: 1 }}>
              {t('goal.global.title').toUpperCase()}
            </Text>
            <View style={{ flex: 1 }} />
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text variant="caption" weight="700" tone="onHero">
                {t('goal.global.pct', { pct: totals.pct })}
              </Text>
            </View>
          </View>
          <Text variant="display" tone="onHero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginTop: 8 }}>
            {money(totals.saved)}
          </Text>
          <Text variant="small" tone="heroMuted">
            {t('goal.global.of', { amount: money(totals.target) })}
          </Text>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 14, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, totals.pct)}%`, height: '100%', backgroundColor: colors.secondaryContainer, borderRadius: 5 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <Text variant="caption" weight="600" tone="onHero">
              ● {t(totals.count === 1 ? 'goal.global.count.one' : 'goal.global.count', { count: totals.count })}
            </Text>
            <Text variant="caption" tone="heroMuted">
              {t('goal.left', { amount: money(Math.max(0, totals.target - totals.saved)) })}
            </Text>
          </View>
        </GradientCard>
      ) : null}

      {tip ? (
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 14, marginBottom: 14 }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bulb-outline" size={20} color={colors.secondary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="overline" style={{ color: colors.secondary, marginBottom: 4 }}>
              {t('goal.tip').toUpperCase()}
            </Text>
            <Text variant="small">{renderInsight(tip)}</Text>
          </View>
        </View>
      ) : null}

      <ReserveSection />

      {canCreate ? <Button full icon="add-circle-outline" label={t('goal.createNew')} onPress={() => router.push('/goals/new')} style={{ marginBottom: 6 }} /> : null}

      {active.length === 0 ? (
        <Card style={{ marginTop: 10 }}>
          <EmptyState title={t('goal.empty.title')} body={t('goal.empty.body')} action={canCreate ? t('goal.empty.cta') : undefined} onAction={() => router.push('/goals/new')} />
        </Card>
      ) : (
        <>
          <SectionHeader title={t('goal.running')} action={t('goal.byPriority')} />
          {plans.map(({ g, plan }) => (
            <View key={g.id}>
              {g.status !== 'active' ? (
                <Text variant="caption" tone="subtle">
                  {t('goal.status.paused')}
                </Text>
              ) : null}
              <GoalCard goal={g} plan={plan} rank={g.status === 'active' ? rankedIds.indexOf(g.id) + 1 : undefined} />
              {canEdit && g.status === 'active' && rankedIds.length > 1 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -8, marginBottom: 6 }}>
                  <IconButton icon="chevron-up" label={t('goal.moveUp')} onPress={() => move(g.id, -1)} size={18} />
                  <IconButton icon="chevron-down" label={t('goal.moveDown')} onPress={() => move(g.id, 1)} size={18} />
                </View>
              ) : null}
            </View>
          ))}
        </>
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
    </Screen>
  );
}
