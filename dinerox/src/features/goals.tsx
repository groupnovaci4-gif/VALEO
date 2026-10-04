/**
 * Briques du module Objectifs : panneau de calcul, formulaire, catégories.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { useCurrency, useMoney } from '@/hooks/useFinance';
import { AmountField, Banner, Button, Card, ChipGroup, DateField, Field, Icon, IconButton, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { computeGoalPlan, plannedMonthly, type GoalPlan } from '@/core/goals';
import { CUSTOM_GOAL_CATEGORY, DEFAULT_GOAL_CATEGORIES, resolveGoalCategories, suggestGoalCategory, type GoalCategory } from '@/core/goalCategories';
import { loadRemoteGoalCategories } from '@/services/remoteConfig';
import type { Goal, GoalPriority, GoalScope, PlannedContribution } from '@/core/types';
import { today } from '@/core/dates';

/** Catégories d'objectifs : défauts + publications admin (cache local). */
export function useGoalCategories(): GoalCategory[] {
  const [cats, setCats] = useState<GoalCategory[]>(() => resolveGoalCategories());
  useEffect(() => {
    let alive = true;
    void loadRemoteGoalCategories().then((remote) => alive && setCats(resolveGoalCategories(remote)));
    return () => {
      alive = false;
    };
  }, []);
  return cats;
}

/**
 * Explications chiffrées du plan, en phrases simples (spécification §3-4).
 */
export function GoalPlanPanel({ plan, targetDate, onAskMonthly }: { plan: GoalPlan; targetDate?: string | null; onAskMonthly?: () => void }) {
  const { t, monthYear } = useI18n();
  const money = useMoney();
  const { colors, radius } = useTheme();
  if (plan.target <= 0) return null;
  const lines: string[] = [];
  if (plan.reached) lines.push(t('goal.celebrate.amount', { amount: money(plan.target) }));
  else if (plan.overdue) lines.push(t('goal.calc.overdue', { amount: money(plan.remaining) }));
  else if (plan.requiredMonthly !== null && plan.monthsToTarget) {
    lines.push(t('goal.calc.needMonthly', { months: plan.monthsToTarget, amount: money(plan.requiredMonthly) }));
    if (plan.requiredWeekly) lines.push(t('goal.calc.needWeekly', { amount: money(plan.requiredWeekly) }));
  } else if (!targetDate) lines.push(t('goal.calc.noDate', { amount: money(plan.remaining) }));
  if (!plan.reached && plan.pace && plan.monthsAtPace && plan.estimatedDate) {
    lines.push(targetDate ? t('goal.calc.atPace', { months: plan.monthsAtPace, date: monthYear(plan.estimatedDate) }) : t('goal.calc.estimated', { months: plan.monthsAtPace }));
    if (targetDate && plan.monthlyGap) lines.push(t('goal.calc.gap', { date: monthYear(targetDate), amount: money(plan.monthlyGap) }));
    else if (targetDate && plan.monthlyGap === 0) lines.push(t('goal.calc.onTrack'));
  }
  return (
    <View style={{ backgroundColor: colors.aiBg, borderRadius: radius.md, padding: 14, gap: 8, marginBottom: 14 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="small" tone="muted">
          {t('goal.calc.remaining')}
        </Text>
        <Text variant="bodyStrong">{money(plan.remaining)}</Text>
      </View>
      {lines.map((l) => (
        <View key={l} style={{ flexDirection: 'row', gap: 8 }}>
          <Icon name="sparkles" size={14} color={colors.ai} />
          <Text variant="small" style={{ flex: 1 }}>
            {l}
          </Text>
        </View>
      ))}
      {!plan.reached && !plan.pace && !targetDate && onAskMonthly ? <Button small variant="ghost" label={t('goal.calc.askMonthly')} onPress={onAskMonthly} /> : null}
    </View>
  );
}

export interface GoalDraft {
  name: string;
  categoryId: string;
  templateId: string | null;
  icon: string;
  targetAmount: number | null;
  initialAmount: number | null;
  targetDate: string | null;
  priority: GoalPriority;
  monthlyContribution: number | null;
  accountId: string | null;
  scope: GoalScope;
  planned: PlannedContribution[];
}

export function draftFromGoal(g: Goal): GoalDraft {
  return {
    name: g.name,
    categoryId: g.categoryId,
    templateId: g.templateId ?? null,
    icon: g.icon,
    targetAmount: g.targetAmount || null,
    initialAmount: g.initialAmount || null,
    targetDate: g.targetDate ?? null,
    priority: g.priority,
    monthlyContribution: g.monthlyContribution ?? null,
    accountId: g.accountId ?? null,
    scope: g.scope,
    planned: g.planned ?? [],
  };
}

/** Formulaire d'objectif avec calcul en direct. */
export function GoalFields({ draft, onChange, categories, saved, editing }: { draft: GoalDraft; onChange: (d: GoalDraft) => void; categories: GoalCategory[]; saved?: number; editing?: boolean }) {
  const { t, lang } = useI18n();
  const data = useData();
  const currency = useCurrency();
  const money = useMoney();
  const set = <K extends keyof GoalDraft>(k: K, v: GoalDraft[K]) => onChange({ ...draft, [k]: v });
  const plan = useMemo(
    () =>
      computeGoalPlan(
        { targetAmount: draft.targetAmount ?? 0, saved: saved ?? draft.initialAmount ?? 0, targetDate: draft.targetDate, monthlyContribution: draft.monthlyContribution, planned: draft.planned },
        today(),
        currency === 'XOF' || currency === 'XAF' ? 1000 : 100,
      ),
    [draft, saved, currency],
  );
  const savings = data.accounts.filter((a) => a.active);
  const familyTotal = plannedMonthly(draft.planned);
  return (
    <View>
      <Field label={t('goal.name')} value={draft.name} onChangeText={(v) => set('name', v)} placeholder={t('goal.customPlaceholder')} maxLength={120} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('goal.category')}
      </Text>
      <ChipGroup
        scroll
        value={draft.categoryId}
        onChange={(c) => {
          const cat = categories.find((x) => x.id === c);
          onChange({ ...draft, categoryId: c, icon: draft.templateId ? draft.icon : (cat?.icon ?? '🎯') });
        }}
        options={[...categories.map((c) => ({ value: c.id, label: c.label[lang], emoji: c.icon })), { value: CUSTOM_GOAL_CATEGORY, label: t('goal.category.custom'), emoji: '✏️' }]}
      />
      <AmountField label={t('goal.target')} value={draft.targetAmount} onChange={(v) => set('targetAmount', v)} currency={currency} big />
      {!editing ? <AmountField label={`${t('goal.initial')} (${t('common.optional')})`} value={draft.initialAmount} onChange={(v) => set('initialAmount', v)} currency={currency} /> : null}
      <DateField label={`${t('goal.targetDate')} (${t('common.optional')})`} value={draft.targetDate} onChange={(d) => set('targetDate', d)} allowClear shortcuts={false} minimumDate={today()} />
      <AmountField label={`${t('goal.monthly')} (${t('common.optional')})`} value={draft.monthlyContribution} onChange={(v) => set('monthlyContribution', v)} currency={currency} />
      <GoalPlanPanel plan={plan} targetDate={draft.targetDate} />
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('common.priority')}
      </Text>
      <ChipGroup
        value={draft.priority}
        onChange={(p) => set('priority', p)}
        options={(['low', 'normal', 'high', 'urgent'] as GoalPriority[]).map((p) => ({ value: p, label: t(`goal.priority.${p}` as TKey) }))}
      />
      {savings.length ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 2 }}>
            {t('goal.account')}
          </Text>
          <Text variant="caption" tone="subtle" style={{ marginBottom: 6 }}>
            {t('goal.accountHint')}
          </Text>
          <ChipGroup
            scroll
            value={draft.accountId ?? 'none'}
            onChange={(v) => set('accountId', v === 'none' ? null : v)}
            options={[{ value: 'none', label: t('common.none') }, ...savings.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))]}
          />
        </>
      ) : null}
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('goal.scope')}
      </Text>
      <ChipGroup value={draft.scope} onChange={(s) => set('scope', s)} options={(['personal', 'couple', 'family'] as GoalScope[]).map((s) => ({ value: s, label: t(`goal.scope.${s}` as TKey) }))} />
      {draft.scope !== 'personal' ? (
        <Card style={{ marginBottom: 14 }}>
          <Text variant="bodyStrong" style={{ marginBottom: 8 }}>
            {t('goal.planned')}
          </Text>
          {draft.planned.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Field label={t('goal.plannedLabel')} value={p.label} onChangeText={(v) => set('planned', draft.planned.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
              </View>
              <View style={{ flex: 1 }}>
                <AmountField label={t('common.perMonth')} value={p.monthly || null} onChange={(v) => set('planned', draft.planned.map((x, j) => (j === i ? { ...x, monthly: v ?? 0 } : x)))} currency={currency} />
              </View>
              <View style={{ paddingTop: 26 }}>
                <IconButton icon="close" label={t('common.delete')} onPress={() => set('planned', draft.planned.filter((_, j) => j !== i))} />
              </View>
            </View>
          ))}
          <Button small variant="secondary" icon="person-add-outline" label={t('goal.plannedAdd')} onPress={() => set('planned', [...draft.planned, { label: `${t('fam.role.partner')} ${draft.planned.length + 1}`, monthly: 0 }])} />
          {familyTotal > 0 ? (
            <Text variant="small" style={{ marginTop: 10 }}>
              {t('goal.plannedTotal', { amount: money(familyTotal) })}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

/** Suggestion de catégorie pour un objectif libre (« Oui | Modifier »). */
export function CategorySuggestion({ text, categories, onAccept, onChange }: { text: string; categories: GoalCategory[]; onAccept: (c: GoalCategory, templateIcon?: string) => void; onChange: () => void }) {
  const { t, lang } = useI18n();
  const s = useMemo(() => (text.trim().length >= 4 ? suggestGoalCategory(text, categories) : null), [text, categories]);
  if (!s) return null;
  return (
    <View>
      <Banner tone="ai" icon="sparkles" text={t('goal.suggestion', { category: `${s.category.icon} ${s.category.label[lang]}` })} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Button small label={t('goal.suggestion.yes')} onPress={() => onAccept(s.category, s.template?.icon)} />
        <Button small variant="secondary" label={t('goal.suggestion.change')} onPress={onChange} />
      </View>
    </View>
  );
}

export { DEFAULT_GOAL_CATEGORIES };
