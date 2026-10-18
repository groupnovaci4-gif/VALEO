/**
 * Carte principale de l'accueil (design system v2) : « Reste par jour » en très grand,
 * la phrase « Il vous reste X par jour jusqu'au … », puis le solde disponible, et le
 * bouton « Masquer les montants ». Sous la carte : la part prise sur une réserve et la
 * source des chiffres (toujours visibles), et le détail du calcul, replié derrière
 * « Comment c'est calculé ? ».
 * Chiffres calculés par core/allowance (`dailyAllowanceV2` : argent disponible D − engagements E,
 * horizon de paie ; aucun calcul ici). Textes actuels gardés : la carte est refaite à l'étape 3.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Card, GradientCard, Icon, Text } from '@/components/ui';
import { dailyAllowanceV2, type Commitment } from '@/core/allowance';
import { OpeningCard } from '@/features/money/HomeMoneyCards';
import type { Position } from '@/core/position';
import { BIG_TEXT, useTheme } from '@/theme';

const HIDDEN = '••••••';

export function DailyAllowanceCard({ hidden, onToggleHidden, position }: { hidden?: boolean; onToggleHidden: () => void; position: Position }) {
  const available = position.available;
  const { t, date } = useI18n();
  const { colors } = useTheme();
  const { profile } = useApp();
  const money = useMoney();
  const { fontScale } = useWindowDimensions();
  const { data, currency, now } = useFinance();
  const payDay = profile?.financial?.payDay ?? null;
  const r = useMemo(() => dailyAllowanceV2({ data, currency, today: now, payDay }), [data, currency, now, payDay]);
  const [open, setOpen] = useState(false);
  const show = (n: number) => (hidden ? HIDDEN : money(n));
  const big = fontScale >= BIG_TEXT;

  /** Une ligne « libellé + montant » : sur une ligne, ou deux étages si le texte est agrandi. */
  const line = (onHero: boolean, label: string, value: number, size: 'M' | 'S' = 'S') => (
    <View key={label} style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'center', justifyContent: 'space-between', gap: big ? 0 : 8, flexWrap: 'wrap' }}>
      <Text variant="small" tone={onHero ? 'heroMuted' : 'muted'}>
        {label}
      </Text>
      <Amount text={money(value)} hidden={hidden} size={size} tone={onHero ? 'onHero' : 'default'} />
    </View>
  );
  /** Argent disponible v2 (§4) : trois montants, jamais additionnés par erreur ; autres devises côte à côte. */
  const others = Object.entries(position.otherCurrencies);
  const availableRow = (onHero: boolean) => (
    <View style={{ gap: 4 }}>
      {line(onHero, t('home.available'), available, 'M')}
      {line(onHero, t('home.setAside'), position.setAside)}
      {line(onHero, t('home.totalAccounts'), position.totalAccounts)}
      {others.map(([cur, v]) => (
        <Text key={cur} variant="caption" tone={onHero ? 'heroMuted' : 'subtle'}>
          {hidden ? HIDDEN : `${money(v!.available, { currency: cur })} · ${money(v!.totalAccounts, { currency: cur })}`}
        </Text>
      ))}
    </View>
  );
  /** « Comment c'est calculé ? » : D, chaque engagement, le nombre de jours (§7.3). */
  const itemText = (c: Commitment) => {
    const amount = show(c.amount);
    const day = date(c.date);
    if (c.kind === 'recurring') return t('daily.item.recurring', { label: data.recurring.find((x) => x.id === c.id)?.label ?? '', date: day, amount });
    if (c.kind === 'tontine') return t('daily.item.tontine', { label: data.tontines.find((x) => x.id === c.id)?.name ?? '', date: day, amount });
    if (c.kind === 'debt') return t('daily.item.debt', { label: data.debts.find((x) => x.id === c.id)?.counterparty ?? '', date: day, amount });
    if (c.kind === 'future') return t('daily.item.future', { date: day, amount });
    return t('daily.item.goal', { label: data.goals.find((x) => x.id === c.id)?.name ?? '', amount });
  };
  /** Bouton masquer/afficher : icône + texte (mêmes libellés qu'avant), 48 dp. */
  const hideButton = (onHero: boolean) => {
    const fg = onHero ? colors.onHero : colors.primary;
    const label = hidden ? t('home.showAmounts') : t('home.hideAmounts');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onToggleHidden}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, alignSelf: 'flex-start', paddingHorizontal: 8, marginLeft: -8, marginTop: 4, borderRadius: 12, backgroundColor: pressed ? (onHero ? colors.heroTrack : colors.surfaceAlt) : 'transparent' })}
      >
        <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={fg} />
        <Text variant="label" style={{ color: fg, flexShrink: 1 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  // §7.3 : argent disponible D − engagements E, sur les jours jusqu'au prochain revenu (les dépenses
  // sont déjà sorties de D). Le détail explique toujours le chiffre.
  const detail = r.status === 'needs_money' ? null : t('daily.detail', { available: show(r.available), commitments: show(r.commitments), days: r.daysLeft });
  const items = r.status === 'needs_money' ? [] : r.items;
  // Sous la carte : réserve et source TOUJOURS visibles ; détail du calcul replié.
  const below = (
    <View style={{ marginTop: 8, marginBottom: 12, gap: 6 }}>
      {/* Règle 19 : la part prise sur une réserve reste visible (elle n'a pas fait baisser le reste par jour). */}
      {r.status !== 'needs_money' && r.reserveCovered > 0 ? (
        <Text variant="small" tone="muted">
          {t('daily.reserveCovered', { amount: show(r.reserveCovered) })}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('daily.howCalculated')}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, alignSelf: 'flex-start', paddingHorizontal: 8, marginLeft: -8, borderRadius: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
      >
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
        <Text variant="label" tone="primary" style={{ flexShrink: 1 }}>
          {t('daily.howCalculated')}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 6, paddingLeft: 4 }}>
          {detail ? <Text variant="small">{detail}</Text> : null}
          {items.map((c, i) => (
            <Text key={`${c.kind}_${c.id}_${i}`} variant="caption" tone="subtle">
              {itemText(c)}
            </Text>
          ))}
          <Text variant="small" tone="muted">
            {t('home.availableHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // Argent jamais renseigné (§4, §12.1) : la carte « Votre argent disponible aujourd'hui », à la place de tout montant.
  if (r.status === 'needs_money') return <OpeningCard />;
  if (r.status === 'deficit') {
    const sentence = t('daily.deficit', { amount: show(r.deficit), date: date(r.until) });
    return (
      <>
        <Card tone="danger" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="alert-circle" size={24} color={colors.danger} />
            <Text variant="titleS" style={{ flex: 1 }} accessibilityRole="alert">
              {sentence}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          {availableRow(false)}
          {hideButton(false)}
        </Card>
        {below}
      </>
    );
  }
  const sentence = t('daily.perDay', { amount: show(r.perDay), date: date(r.until) });
  return (
    <>
      <GradientCard style={{ marginBottom: 0, gap: 4 }}>
        <Text variant="small" tone="heroMuted">
          {t('daily.label')}
        </Text>
        <Amount text={money(r.perDay)} hidden={hidden} size="hero" tone="onHero" />
        <Text variant="bodyStrong" tone="onHero">
          {sentence}
        </Text>
        <View style={{ height: 1, backgroundColor: colors.heroTrack, marginVertical: 12 }} />
        {availableRow(true)}
        {hideButton(true)}
      </GradientCard>
      {below}
    </>
  );
}
