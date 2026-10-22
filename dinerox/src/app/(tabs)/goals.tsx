/**
 * Objectifs — refonte finale (docs/design-pro-maquette-finale, FINAL-objectifs.png, DECISIONS.md
 * D1 à D3 ; valeurs : ecrans/objectifs-*.html) :
 *  1. D1 : « Objectifs » + « Nouveau » ; carte verte flottante « Épargne pour vos projets »
 *     (%, montant, visé, reste, barre dorée) ;
 *  2. D2 : « Vos projets » en vignettes sur 2 colonnes (anneau autour de l'icône, étiquette
 *     Priorité N / Moment fort / Réserve, nom, montants, rythme, %, bouton +) : projets, le
 *     prochain moment fort et les réserves ;
 *  3. D3 : « Ordre de priorité » ouvre le réglage de l'ordre (les ↑↓ y restent) ; aide de la
 *     réserve ; « Répartir chaque mois » (le montant reste modifiable) ; objectifs terminés.
 * Les conseils d'épargne (suggestions) sont dans « À lire » sur l'accueil.
 */
import { useRunAction } from '@/hooks/useRunAction';
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Button, Card, EmptyState, GradientCard, Icon, IconButton, Row, Screen, SectionHeader, Sheet, Text, reserveIcon } from '@/components/ui';
import { BIG_TEXT, DesignV2, shadowB, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { GoalTileCard, type GoalTileProps } from '@/features/goals/GoalTileCard';
import { allocateCapacity, goalPlanFor, sortGoals } from '@/core/goals';
import { observedCapacity } from '@/core/intelligence';
import { can } from '@/core/permissions';
import { isClassicGoal, isReserve, reserveState } from '@/core/reserve';
import { activeSeasons, seasonPlanFor } from '@/core/seasons';

export default function Goals() {
  return (
    <DesignV2>
      <GoalsScreen />
    </DesignV2>
  );
}

/** Barre de la carte globale (maquette : or sur la carte verte). */
const GLOBAL_BAR = '#E8B85A';
const ON_HERO_MUTED = '#C9DED6';

function GoalsScreen() {
  const { t, monthYear } = useI18n();
  const { colors, dark } = useTheme();
  const { role } = useApp();
  const money = useMoney();
  const actions = useActions();
  const run = useRunAction();
  const { data, now, currency } = useFinance();
  const { width, fontScale } = useWindowDimensions();
  const columns = width < 340 || fontScale >= BIG_TEXT ? 1 : 2;
  // Objectifs classiques (hors réserves et moments forts) : totaux, ordre et répartition.
  const goalsOnly = useMemo(() => data.goals.filter(isClassicGoal), [data.goals]);
  const active = useMemo(() => sortGoals(goalsOnly.filter((g) => g.status === 'active' || g.status === 'paused')), [goalsOnly]);
  const closed = useMemo(() => goalsOnly.filter((g) => g.status === 'completed' || g.status === 'archived' || g.status === 'abandoned'), [goalsOnly]);
  const detected = useMemo(() => observedCapacity(data, currency, now), [data, currency, now]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const cap = capacity ?? (detected && detected > 0 ? detected : null);
  const allocation = useMemo(() => (cap ? allocateCapacity(cap, goalsOnly, data.goalContributions, now, 1000, currency) : []), [cap, goalsOnly, data.goalContributions, now, currency]);
  const canCreate = can(role, 'create', 'goals');
  const canEdit = can(role, 'update', 'goals');
  // Même droit que sur la fiche : un enfant peut verser, pas modifier.
  const canContribute = can(role, 'create', 'goalContributions');
  // Ordre de priorité des seuls objectifs actifs (ceux en pause sont hors classement).
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
  const reserves = data.goals.filter((g) => !g.deleted && isReserve(g) && (g.status === 'active' || g.status === 'paused'));
  const season = activeSeasons(data.goals)[0] ?? null;

  // D2 : projets (par priorité), puis le prochain moment fort, puis les réserves.
  const contribute = (id: string) => (canContribute ? () => router.push(`/goals/contribute?id=${id}&from=goals`) : null);
  const tiles: (GoalTileProps & { key: string })[] = [
    ...plans.map(({ g, plan }) => {
      const rank = g.status === 'active' ? rankedIds.indexOf(g.id) + 1 : 0;
      const pace = plan.reached ? null : plan.requiredMonthly ? t('goal.perMonthChip', { amount: money(plan.requiredMonthly) }) : plan.estimatedDate ? t('goal.atPaceChip', { date: monthYear(plan.estimatedDate) }) : null;
      const amounts = g.targetAmount > 0 ? `${money(plan.saved)} / ${money(plan.target)}` : t('goal.setAmount');
      return {
        key: g.id,
        kind: 'goal' as const,
        label: rank ? t('goal.rank', { rank }) : t('goal.status.paused'),
        name: g.name,
        amounts,
        pace,
        percent: plan.percent,
        icon: { emoji: g.icon, ids: [g.templateId, `goal.${g.categoryId}`] },
        a11y: [g.name, amounts, pace, `${plan.percent} %`].filter(Boolean).join(', '),
        onPress: () => router.push(`/goals/${g.id}`),
        onAdd: g.status === 'active' ? contribute(g.id) : null,
        addLabel: `${t('goal.contribute')}, ${g.name}`,
      };
    }),
    ...(season
      ? [
          (() => {
            const p = seasonPlanFor(season, data.goalContributions, now);
            const pace = p.plan.remaining <= 0 ? t('season.ready') : p.weekly !== null ? t('goal.perWeekChip', { amount: money(p.weekly) }) : t('season.noDate');
            const amounts = `${money(p.plan.saved)} / ${money(p.plan.target)}`;
            return {
              key: season.id,
              kind: 'season' as const,
              label: t('goal.tile.season'),
              name: season.name,
              amounts,
              pace,
              percent: p.plan.percent,
              icon: { emoji: season.icon, ids: [season.templateId, `goal.${season.categoryId}`] },
              a11y: [t('season.section'), season.name, amounts, pace, `${p.plan.percent} %`].join(', '),
              onPress: () => router.push('/seasons'),
              onAdd: season.status === 'active' ? contribute(season.id) : null,
              addLabel: `${t('goal.contribute')}, ${season.name}`,
            };
          })(),
        ]
      : []),
    ...reserves.map((r) => {
      const s = reserveState(r, data.goalContributions);
      const amounts = `${money(s.balance)} / ${money(s.target)}`;
      const pace = s.monthly ? t('goal.perMonthChip', { amount: money(s.monthly) }) : null;
      return {
        key: r.id,
        kind: 'reserve' as const,
        label: t('goal.tile.reserve'),
        name: r.name,
        amounts,
        pace,
        percent: s.percent,
        icon: reserveIcon(r),
        a11y: [r.name, amounts, pace, `${s.percent} %`].filter(Boolean).join(', '),
        onPress: () => router.push(`/reserve/${r.id}`),
        onAdd: r.status === 'active' ? contribute(r.id) : null,
        addLabel: `${t('reserve.addOther')}, ${r.name}`,
      };
    }),
  ];
  const rows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns));

  return (
    <Screen brandSection={t('tab.goals')}>
      {/* D1 : « Objectifs » + « Nouveau ». */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 8 }}>
        <Text variant="titleL" accessibilityRole="header">
          {t('goal.title')}
        </Text>
        {canCreate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('goal.new')}
            onPress={() => router.push('/goals/new')}
            style={({ pressed }) => ({ minHeight: 44, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pressed ? colors.primaryPressed : colors.primary })}
          >
            <Icon name="add" size={18} color={colors.onPrimary} />
            <Text variant="label" style={{ fontSize: 14, color: colors.onPrimary }}>
              {t('goal.newShort')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {totals.target > 0 ? (
        // D1 : carte verte flottante (A7).
        <GradientCard float style={{ marginTop: 6, padding: 16 }}>
          <View accessible accessibilityLabel={[t('goal.hero.title'), money(totals.saved), t('goal.hero.of', { target: money(totals.target), left: money(Math.max(0, totals.target - totals.saved)) }), t(totals.count === 1 ? 'goal.global.count.one' : 'goal.global.count', { count: totals.count })].join(', ')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text variant="caption" weight="500" style={{ flex: 1, fontSize: 13, lineHeight: 18, color: ON_HERO_MUTED }}>
                {t('goal.hero.title')}
              </Text>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text variant="caption" weight="600" tone="onHero" style={{ fontSize: 12, lineHeight: 16 }}>
                  {`${totals.pct} %`}
                </Text>
              </View>
            </View>
            <Text variant="amountHero" numeric tone="onHero" style={{ marginTop: 4, fontSize: 36, lineHeight: 42 }}>
              {money(totals.saved)}
            </Text>
            <Text variant="caption" weight="500" style={{ fontSize: 13, lineHeight: 18, color: ON_HERO_MUTED }}>
              {t('goal.hero.of', { target: money(totals.target), left: money(Math.max(0, totals.target - totals.saved)) })}
            </Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 12, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, totals.pct)}%`, height: '100%', backgroundColor: GLOBAL_BAR }} />
            </View>
          </View>
        </GradientCard>
      ) : null}

      {/* D2 : vos projets, en vignettes ; D3 : « Ordre de priorité ». */}
      <SectionHeader title={t('goal.projects')} action={canEdit && rankedIds.length > 1 ? t('goal.priorityOrder') : undefined} onAction={() => setOrderOpen(true)} />
      {tiles.length ? (
        <View style={{ gap: 10 }}>
          {rows.map((row) => (
            <View key={row.map((x) => x.key).join('_')} style={{ flexDirection: 'row', gap: 10 }}>
              {row.map(({ key, ...tile }) => (
                <GoalTileCard key={key} {...tile} />
              ))}
              {row.length < columns ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      ) : (
        <Card style={{ marginTop: 4 }}>
          <EmptyState title={t('goal.empty.title')} body={t('goal.empty.body')} action={canCreate ? t('goal.empty.cta') : undefined} onAction={() => router.push('/goals/new')} />
        </Card>
      )}
      {/* D3 : aide de la réserve. */}
      {reserves.length ? (
        <Text variant="small" tone="subtle" style={{ fontSize: 13, lineHeight: 18, marginTop: 10, marginHorizontal: 2 }}>
          {t('reserve.tile.hint')}
        </Text>
      ) : null}
      {/* Rien de perdu : préparer un moment fort, créer la réserve famille (quand ils n'existent pas). */}
      {!season ? (
        <Button variant="tertiary" icon="calendar-outline" label={t('season.add')} onPress={() => router.push('/seasons')} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
      ) : null}
      {!reserves.length && canCreate ? (
        <Card style={{ gap: 8, marginTop: 8 }}>
          <Text variant="bodyStrong">🤝 {t('reserve.defaultName')}</Text>
          <Text variant="small" tone="muted">
            {t('reserve.createCta.body')}
          </Text>
          <Button icon="add-circle-outline" label={t('reserve.create')} onPress={() => router.push('/reserve/new')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      {/* D3 : « Répartir chaque mois » (le montant reste modifiable). */}
      {active.filter((g) => g.status === 'active').length > 1 ? (
        <>
          <SectionHeader title={t('goal.distribute.short')} />
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16, ...(dark ? null : shadowB) }}>
            <Text variant="small" tone="subtle" style={{ fontSize: 13, lineHeight: 18 }}>
              {t('goal.distribute.capacity')}
            </Text>
            <Text variant="titleM" numeric weight="800" style={{ fontSize: 22, lineHeight: 28, marginTop: 2, marginBottom: 12 }}>
              {cap ? money(cap) : '—'}
            </Text>
            {cap ? (
              <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: finalPalette(dark).ringTrack }}>
                {allocation.map((l, i) => (
                  <View key={l.goalId} style={{ width: `${Math.min(100, (l.amount / cap) * 100)}%`, backgroundColor: finalPalette(dark).greenFg, opacity: i === 0 ? 1 : 0.55 }} />
                ))}
              </View>
            ) : null}
            {allocation.map((l) => {
              const g = data.goals.find((x) => x.id === l.goalId)!;
              const funded = l.amount > 0;
              return (
                <View key={l.goalId} accessible accessibilityLabel={[g.name, money(l.amount), l.need ? `${money(l.need)}${t('common.perMonth')}` : null].filter(Boolean).join(', ')} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  <Text variant="small" weight="500" tone={funded ? 'default' : 'subtle'} style={{ flexShrink: 1, fontSize: 13, lineHeight: 18 }}>
                    {`${funded ? '●' : '○'} ${g.name}`}
                  </Text>
                  <Text variant="small" weight="500" numeric tone={funded ? 'default' : 'subtle'} style={{ fontSize: 13, lineHeight: 18 }}>
                    {money(l.amount)}
                  </Text>
                </View>
              );
            })}
            <Text variant="small" tone="subtle" style={{ marginTop: 8, fontSize: 13, lineHeight: 18 }}>
              {t('goal.distribute.hint')}
            </Text>
            {editingCapacity ? (
              <View style={{ marginTop: 10 }}>
                <AmountField label={t('goal.distribute.capacity')} value={cap} onChange={setCapacity} currency={currency} />
              </View>
            ) : (
              <Button small variant="tertiary" icon="create-outline" label={t('goal.distribute.edit')} onPress={() => setEditingCapacity(true)} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
            )}
          </View>
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

      {/* D3 : réglage de l'ordre de priorité (les ↑↓ existants). */}
      <Sheet visible={orderOpen} onClose={() => setOrderOpen(false)} title={t('goal.priorityOrder')}>
        {rankedIds.map((id, i) => {
          const g = data.goals.find((x) => x.id === id)!;
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Text variant="label" tone="primary" style={{ width: 28 }}>
                {i + 1}
              </Text>
              <Text variant="bodyStrong" style={{ flex: 1, minWidth: 0 }}>
                {g.name}
              </Text>
              <IconButton icon="chevron-up" label={`${t('goal.moveUp')}, ${g.name}`} onPress={() => move(id, -1)} size={18} />
              <IconButton icon="chevron-down" label={`${t('goal.moveDown')}, ${g.name}`} onPress={() => move(id, 1)} size={18} />
            </View>
          );
        })}
      </Sheet>
    </Screen>
  );
}
