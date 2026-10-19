/**
 * Composants métier réutilisables : opération, enveloppe, objectif,
 * compte, alerte, sélecteur d'espace, verrou de formule.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { Amount, Badge, Button, Card, Icon, IconCircle, ProgressBar, Row, Sheet, Text, Tile, TileCell, TileIcon, TileText } from '@/components/ui';
import { useAccountLabel, useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { useInsightText } from '@/hooks/useInsightText';
import { useApp } from '@/store/app';
import type { Account, Goal, Transaction } from '@/core/types';
import type { GoalPlan } from '@/core/goals';
import type { Insight } from '@/core/insights';
import { minimumPlanFor, type Feature } from '@/core/subscription';
import { findGoalCategory } from '@/core/goalCategories';
import { financingNature } from '@/core/nature';
import { ListenButton } from '@/features/coach/ListenButton';

export function TransactionRow({ tx, onPress, onLongPress, longPressHint }: { tx: Transaction; onPress?: () => void; onLongPress?: () => void; longPressHint?: string }) {
  const { colors, v2 } = useTheme();
  const { t, date } = useI18n();
  const money = useMoney();
  const cats = useCategoryLabels();
  const accountLabel = useAccountLabel();
  // Ajustement de solde (1.8) : ni revenu ni dépense, signé selon son sens, en ton neutre.
  // Financement (emprunt, prêt, remboursements) : la nature, jamais « Autres revenus » (§2.3).
  const financing = financingNature(tx);
  const meta =
    tx.type === 'transfer'
      ? { name: t('tx.transfer'), icon: 'swap-horizontal', color: colors.info }
      : tx.type === 'adjustment'
        ? { name: t('tx.adjustment'), icon: 'create-outline', color: colors.info }
        : financing
          ? { name: t(`nature.${financing}` as TKey), icon: 'people-outline', color: colors.info }
          : cats.meta(tx.categoryId);
  const title = tx.payee || meta.name;
  const sub = tx.type === 'transfer' ? `${accountLabel(tx.accountId)} → ${accountLabel(tx.toAccountId)}` : tx.type === 'adjustment' ? accountLabel(tx.accountId) : `${meta.name} · ${accountLabel(tx.accountId)}`;
  const amount =
    tx.type === 'expense' || (tx.type === 'adjustment' && tx.direction === 'out')
      ? `-${money(tx.amount, { currency: tx.currency })}`
      : tx.type === 'income' || tx.type === 'adjustment'
        ? money(tx.amount, { currency: tx.currency, signed: true })
        : money(tx.amount, { currency: tx.currency });
  const tone = tx.type === 'expense' ? 'expense' : tx.type === 'income' ? 'income' : 'muted';
  if (v2) {
    // v2 : emoji de la catégorie conservé ; le montant (signe + couleur) est lu avec la ligne.
    const subtitle = `${sub} · ${date(tx.date)}`;
    return (
      <Row
        title={title}
        subtitle={subtitle}
        accessibilityLabel={`${title}, ${amount}, ${subtitle}`}
        left={<IconCircle icon={meta.icon} emoji={'emoji' in meta ? meta.emoji : undefined} color={meta.color} />}
        right={<Amount text={amount} size="S" tone={tone} align="right" />}
        onPress={onPress ?? (() => router.push(`/transaction/${tx.id}`))}
        onLongPress={onLongPress}
        accessibilityHint={longPressHint}
      />
    );
  }
  return (
    <Row
      title={title}
      subtitle={`${sub} · ${date(tx.date)}`}
      left={<IconCircle icon={meta.icon} color={meta.color} />}
      right={
        <Text variant="numeric" weight="600" tone={tone}>
          {amount}
        </Text>
      }
      onPress={onPress ?? (() => router.push(`/transaction/${tx.id}`))}
      onLongPress={onLongPress}
      accessibilityHint={longPressHint}
    />
  );
}

/**
 * Objectif en PAVÉ (accueil, onglet Objectifs) : emoji, nom, rang, catégorie et date, montant
 * mis de côté / cible et %, barre ; hors `compact`, le reste et le rythme mensuel.
 */
export function GoalTile({ goal, plan, compact, rank }: { goal: Goal; plan: GoalPlan; compact?: boolean; rank?: number }) {
  const { t, monthYear, lang } = useI18n();
  const money = useMoney();
  const { colors, radius, v2 } = useTheme();
  const tone = plan.reached ? 'success' : plan.overdue ? 'danger' : 'primary';
  const accent = plan.overdue ? colors.danger : colors.primary;
  const category = findGoalCategory(goal.categoryId)?.label[lang];
  const chip = plan.reached
    ? null
    : plan.requiredMonthly
      ? t('goal.perMonthChip', { amount: money(plan.requiredMonthly) })
      : plan.estimatedDate
        ? t('goal.atPaceChip', { date: monthYear(plan.estimatedDate) })
        : null;
  return (
    <Tile
      onPress={() => router.push(`/goals/${goal.id}`)}
      // Le lecteur d'écran entend aussi le montant et la progression (pas seulement le nom).
      accessibilityLabel={v2 && goal.targetAmount > 0 ? `${goal.name}, ${money(plan.saved)} / ${money(plan.target)}, ${plan.percent} %` : goal.name}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <IconCircle emoji={goal.icon} color={colors.primary} size={40} />
        {rank ? (v2 ? <Badge tone={rank === 1 ? 'info' : 'neutral'} label={t('goal.rank', { rank })} /> : <Badge tone={rank === 1 ? 'danger' : 'neutral'} label={t('goal.rank', { rank }).toUpperCase()} />) : null}
      </View>
      <TileText variant="bodyStrong">{goal.name}</TileText>
      {category ? (
        <TileText variant="small" tone="muted">
          {category}
          {goal.targetDate ? ` · ${monthYear(goal.targetDate)}` : ''}
        </TileText>
      ) : null}
      {goal.targetAmount > 0 ? (
        <View>
          <TileText variant="amountS" color={accent}>
            {money(plan.saved)}
          </TileText>
          <TileText variant="small" tone="muted">
            / {money(plan.target)} · {`${plan.percent}\u00A0%`}
          </TileText>
        </View>
      ) : (
        <TileText variant="small" tone="muted">
          {t('goal.setAmount')}
        </TileText>
      )}
      <ProgressBar value={plan.percent} tone={tone} height={10} label={goal.name} />
      {!compact && goal.targetAmount > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TileIcon name="time-outline" size={16} color={colors.textMuted} />
            <TileText variant="small" style={{ flexShrink: 1 }}>
              {t('goal.left', { amount: money(plan.remaining) })}
            </TileText>
          </View>
          {chip ? (
            // « 80 000 FCFA / mois » est insécable : dans un pavé étroit, l'icône passe au-dessus du texte.
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, backgroundColor: colors.infoBg, borderRadius: radius.md, paddingHorizontal: 6, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%' }}>
              <Icon name="repeat" size={14} color={colors.info} />
              <Text variant="caption" weight="600" style={{ color: colors.info, flexShrink: 1 }}>
                {chip}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Tile>
  );
}

export function AccountRow({ account, balance, onPress }: { account: Account; balance: number; onPress?: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  return (
    <Row
      title={account.name}
      subtitle={`${t(`acc.type.${account.type}`)}${account.active ? '' : ` · ${t('common.inactive')}`}`}
      left={<IconCircle icon={account.icon} color={account.color} />}
      right={
        <Text variant="numeric" weight="600" tone={balance < 0 ? 'danger' : 'default'}>
          {money(balance, { currency: account.currency })}
        </Text>
      }
      onPress={onPress ?? (() => router.push(`/accounts/${account.id}`))}
      chevron
    />
  );
}

/**
 * Alerte en PAVÉ (onglet Budget) : icône de gravité et texte ; un toucher ouvre l'élément
 * concerné. « Écouter » reste À CÔTÉ du pavé (jamais un bouton dans un bouton).
 */
export function InsightTile({ insight }: { insight: Insight }) {
  const { colors } = useTheme();
  const render = useInsightText();
  const fg = { info: colors.info, positive: colors.success, warning: colors.warning, danger: colors.danger }[insight.severity];
  const icon = { info: 'information-circle', positive: 'sparkles', warning: 'warning', danger: 'alert-circle' }[insight.severity];
  const r = insight.ref;
  const path = r ? (r.type === 'envelope' ? `/envelopes/${r.id}` : r.type === 'goal' ? `/goals/${r.id}` : r.type === 'debt' ? `/debts/${r.id}` : r.type === 'transaction' ? `/transaction/${r.id}` : null) : null;
  const text = render(insight);
  return (
    <TileCell>
      <Tile onPress={path ? () => router.push(path as never) : undefined} accessibilityLabel={text}>
        <TileIcon name={icon} size={22} color={fg} />
        <TileText variant="small">{text}</TileText>
      </Tile>
      <ListenButton text={text} />
    </TileCell>
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
  const { colors, radius, v2 } = useTheme();
  const render = useInsightText();
  const map = {
    info: [colors.infoBg, colors.info, 'information-circle'],
    positive: [colors.successBg, colors.success, 'sparkles'],
    warning: [colors.warningBg, colors.warning, 'warning'],
    danger: [colors.dangerBg, colors.danger, 'alert-circle'],
  } as const;
  const [bg, fg, icon] = map[insight.severity];
  const onPress = insight.ref
    ? () => {
        const r = insight.ref!;
        const path = r.type === 'envelope' ? `/envelopes/${r.id}` : r.type === 'goal' ? `/goals/${r.id}` : r.type === 'debt' ? `/debts/${r.id}` : r.type === 'transaction' ? `/transaction/${r.id}` : null;
        if (path) router.push(path as never);
      }
    : undefined;
  // « Écouter » à côté de la zone cliquable (jamais un bouton dans un bouton).
  if (v2) {
    return (
      <View style={{ backgroundColor: bg, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: fg, marginBottom: 8, paddingBottom: 4 }}>
        <Pressable
          accessibilityRole={onPress ? 'button' : 'text'}
          onPress={onPress}
          style={({ pressed }) => ({ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, paddingBottom: 4, borderTopRightRadius: radius.md, backgroundColor: pressed && onPress ? colors.surfaceAlt : 'transparent' })}
        >
          <Icon name={icon} size={20} color={fg} />
          <Text variant="small" style={{ flex: 1 }}>
            {render(insight)}
          </Text>
          {onPress ? <Icon name="chevron-forward" size={20} color={colors.textSubtle} /> : null}
        </Pressable>
        <View style={{ alignItems: 'flex-start', paddingLeft: 30 }}>
          <ListenButton text={render(insight)} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: bg, borderRadius: radius.md, marginBottom: 8 }}>
      <Pressable accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress} style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, paddingRight: 4 }}>
        <Icon name={icon} size={18} color={fg} />
        <Text variant="small" style={{ flex: 1, color: colors.text }}>
          {render(insight)}
        </Text>
      </Pressable>
      <View style={{ paddingTop: 6, paddingRight: 6 }}>
        <ListenButton text={render(insight)} />
      </View>
    </View>
  );
}

/** Bascule entre « Mes finances personnelles » et les espaces familiaux. */
export function SpaceSwitcher() {
  const { spaces, activeSpace, setActiveSpace } = useApp();
  const { t } = useI18n();
  const { colors, radius, v2 } = useTheme();
  const [open, setOpen] = useState(false);
  if (spaces.length <= 1 || !activeSpace) return null;
  // v2 : plus d'emoji dans l'interface — l'espace est repéré par une icône à côté de son nom.
  const label = (id: string, kind: string, name: string) => (v2 ? (kind === 'personal' && !id.startsWith('demo_') ? t('fam.private') : name) : id.startsWith('demo_') ? `🧪 ${name}` : kind === 'personal' ? t('fam.private') : `👨‍👩‍👧 ${name}`);
  const iconOf = (id: string, kind: string) => (id.startsWith('demo_') ? 'flask-outline' : kind === 'personal' ? 'person-outline' : 'people-outline');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('fam.switch')} : ${label(activeSpace.id, activeSpace.kind, activeSpace.name)}`}
        onPress={() => setOpen(true)}
        style={
          v2
            ? ({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 48, maxWidth: '100%', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, marginBottom: 12 })
            : { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginBottom: 12 }
        }
      >
        {v2 ? <Icon name={iconOf(activeSpace.id, activeSpace.kind)} size={20} color={colors.primary} /> : null}
        <Text variant={v2 ? 'label' : 'small'} weight="600" style={{ flexShrink: 1 }}>
          {label(activeSpace.id, activeSpace.kind, activeSpace.name)}
        </Text>
        <Icon name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('fam.switch')}>
        {spaces.map((s) => (
          <Row
            key={s.id}
            title={label(s.id, s.kind, s.name)}
            left={v2 ? <Icon name={iconOf(s.id, s.kind)} size={22} color={colors.primary} /> : undefined}
            right={s.id === activeSpace.id ? <Icon name="checkmark-circle" size={22} color={colors.success} /> : undefined}
            onPress={() => {
              setActiveSpace(s.id);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** Fonctionnalité réservée à une formule supérieure. */
export function UpgradeCard({ feature, text }: { feature: Feature; text: string }) {
  const { t } = useI18n();
  const plan = minimumPlanFor(feature);
  return (
    <Card style={{ alignItems: 'center', gap: 10, marginVertical: 12 }}>
      <Badge tone="ai" label={t('sub.locked', { plan: t(plan === 'family' ? 'sub.family' : 'sub.plus') })} />
      <Text tone="muted" align="center">
        {text}
      </Text>
      <Button label={t('common.upgrade')} icon="sparkles" onPress={() => router.push('/subscription')} />
    </Card>
  );
}
