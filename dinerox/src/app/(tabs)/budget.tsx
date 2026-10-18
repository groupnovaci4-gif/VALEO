/**
 * Budget du mois (design system v2, docs/design-system.md §10.3) :
 *  1. un seul titre (« Budget ») et le mois ;
 *  2. carte héros : le RESTANT en grand, la barre et le % écrit, puis prévu / dépensé ;
 *  3. alertes d'enveloppes ;
 *  4. enveloppes : nom, reste, état écrit + icône (jamais la couleur seule).
 * Action principale contextuelle : sans enveloppe, « Proposer un budget » ; avec
 * enveloppes, « Nouvelle enveloppe » et « Budget automatique » en boutons texte.
 * Aucune formule ici : tous les chiffres viennent de `useFinance`.
 */
import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BIG_TEXT, DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Button, Card, EmptyState, GradientCard, Icon, ProgressBar, Screen, SectionHeader, Text } from '@/components/ui';
import { InsightCard, SpaceSwitcher } from '@/features/rows';
import { EnvelopeCard } from '@/features/budget/EnvelopeCard';
import { shareOfDeclared } from '@/core/allowance';
import { can } from '@/core/permissions';

export default function Budget() {
  return (
    <DesignV2>
      <BudgetScreen />
    </DesignV2>
  );
}

function BudgetScreen() {
  const { t, monthYear } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const { envelopes, budget, insights, now, toAllocate, spaceKind } = useFinance();
  const { profile } = useApp();
  const declared = profile?.financial?.monthlyIncome ?? null;
  const pct = budget.planned > 0 ? Math.round((budget.spent / budget.planned) * 100) : 0;
  const alerts = insights.filter((i) => i.kind === 'envelope_threshold' || i.kind === 'envelope_over_streak');
  const editable = can(role, 'create', 'envelopes');
  return (
    <Screen brandSection={t('tab.budget')}>
      <SpaceSwitcher />
      <View style={{ marginTop: 4, marginBottom: 12 }}>
        <Text variant="titleL" accessibilityRole="header">
          {t('budget.title')}
        </Text>
        <Text variant="small" tone="muted">
          {monthYear(now)}
        </Text>
      </View>

      {envelopes.length ? (
        <BudgetHero planned={budget.planned} spent={budget.spent} remaining={budget.remaining} unassigned={budget.unassigned} pct={pct} />
      ) : null}
      {/* Argent disponible v2 (§9) : reste à répartir = D − enveloppes restantes − engagements hors enveloppes. */}
      {envelopes.length ? (
        <Text variant="small" weight="600" tone={toAllocate.amount < 0 ? 'danger' : 'default'} style={{ marginTop: 8 }} accessibilityRole="summary">
          {toAllocate.amount < 0 ? t('budget.toAllocateOver', { amount: money(-toAllocate.amount) }) : t('budget.toAllocate', { amount: money(toAllocate.amount) })}
        </Text>
      ) : null}

      {alerts.length ? <View style={{ marginTop: 14 }}>{alerts.slice(0, 4).map((i) => <InsightCard key={i.id} insight={i} />)}</View> : null}

      <SectionHeader title={t('env.title')} action={editable ? t('env.new') : undefined} onAction={() => router.push('/envelopes/edit')} />
      {envelopes.length ? (
        <>
          {envelopes.map((s) => (
            <EnvelopeCard key={s.envelope.id} s={s} declaredShare={shareOfDeclared(s.budget, declared, spaceKind)} />
          ))}
          {editable ? <Button variant="tertiary" icon="sparkles" label={t('budget.auto')} onPress={() => router.push('/budget/auto')} style={{ alignSelf: 'center' }} /> : null}
        </>
      ) : (
        <Card>
          <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body')} action={editable ? t('env.empty.cta') : undefined} onAction={() => router.push('/budget/auto')} />
        </Card>
      )}
      {!envelopes.length && budget.unassigned > 0 ? (
        <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
          {t('budget.unassigned')} : {money(budget.unassigned)}
        </Text>
      ) : null}
    </Screen>
  );
}

/** Carte héros : restant en grand (audit B1), barre + % écrit, prévu et dépensé sur une ligne chacun. */
function BudgetHero({ planned, spent, remaining, unassigned, pct }: { planned: number; spent: number; remaining: number; unassigned: number; pct: number }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const big = useWindowDimensions().fontScale >= BIG_TEXT;
  const over = remaining < 0;
  return (
    <GradientCard style={{ gap: 4 }}>
      <Text variant="small" tone="heroMuted">
        {t('budget.remaining')}
      </Text>
      <Amount text={money(remaining)} size="hero" tone="onHero" />
      {over ? (
        // Dépassement : écrit, avec une icône (jamais la couleur seule).
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="alert-circle" size={20} color={colors.onHero} />
          <Text variant="bodyStrong" tone="onHero" style={{ flexShrink: 1 }}>
            {t('env.over', { amount: money(-remaining) })}
          </Text>
        </View>
      ) : null}
      <View style={{ marginTop: 10, gap: 6 }}>
        <ProgressBar value={pct} color={colors.onHero} trackColor={colors.heroTrack} height={10} label={t('budget.spent')} />
        <Text variant="small" tone="onHero">
          {t('env.consumed', { percent: pct })}
        </Text>
      </View>
      <View style={{ height: 1, backgroundColor: colors.heroTrack, marginVertical: 12 }} />
      <HeroLine label={t('budget.planned')} value={money(planned)} big={big} />
      <HeroLine label={t('budget.spent')} value={money(spent)} big={big} />
      {unassigned > 0 ? (
        <Text variant="small" tone="heroMuted" style={{ marginTop: 8 }}>
          {t('budget.unassigned')} : {money(unassigned)}
        </Text>
      ) : null}
    </GradientCard>
  );
}

/** Ligne de la carte héros : libellé à gauche, montant à droite ; texte agrandi : le montant passe dessous. */
function HeroLine({ label, value, big }: { label: string; value: string; big: boolean }) {
  return (
    <View style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'center', justifyContent: 'space-between', columnGap: 12, minHeight: 32 }}>
      <Text variant="small" tone="heroMuted">
        {label}
      </Text>
      <Amount text={value} size="M" tone="onHero" />
    </View>
  );
}
