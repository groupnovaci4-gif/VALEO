/**
 * Carte principale de l'accueil (design system v2) : « Reste par jour » en très grand,
 * la phrase « Il vous reste X par jour jusqu'au … », puis le solde disponible, et le
 * bouton « Masquer les montants ». Sous la carte : la part prise sur une réserve et la
 * source des chiffres (toujours visibles), et le détail du calcul, replié derrière
 * « Comment c'est calculé ? ».
 * Chiffres calculés par core/dailyAllowance (aucun calcul ici).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Button, Card, GradientCard, Icon, Text } from '@/components/ui';
import { SourceTag } from '@/features/Recommendation';
import { dailyAllowance } from '@/core/dailyAllowance';
import { BIG_TEXT, useTheme } from '@/theme';

const HIDDEN = '••••••';

export function DailyAllowanceCard({ hidden, onToggleHidden, available }: { hidden?: boolean; onToggleHidden: () => void; available: number }) {
  const { t, date } = useI18n();
  const { colors } = useTheme();
  const { profile } = useApp();
  const money = useMoney();
  const { fontScale } = useWindowDimensions();
  const { data, currency, now } = useFinance();
  const r = useMemo(() => dailyAllowance({ data, currency, today: now, financial: profile?.financial }), [data, currency, now, profile?.financial]);
  const [open, setOpen] = useState(false);
  const show = (n: number) => (hidden ? HIDDEN : money(n));
  const big = fontScale >= BIG_TEXT;

  /** « Solde disponible » + montant : sur une ligne, ou deux étages si le texte est agrandi. */
  const availableRow = (onHero: boolean) => (
    <View style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'center', justifyContent: 'space-between', gap: big ? 0 : 8, flexWrap: 'wrap' }}>
      <Text variant="small" tone={onHero ? 'heroMuted' : 'muted'}>
        {t('home.available')}
      </Text>
      <Amount text={money(available)} hidden={hidden} size="M" tone={onHero ? 'onHero' : 'default'} />
    </View>
  );
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

  const detail =
    r.status === 'needs_income' ? null : t('daily.detail', { income: show(r.income), expenses: show(r.expenses), upcoming: show(r.upcomingRecurring + r.goalsRemaining) });
  // Sous la carte : réserve et source TOUJOURS visibles ; détail du calcul replié.
  const below = (
    <View style={{ marginTop: 8, marginBottom: 12, gap: 6 }}>
      {r.status !== 'needs_income' && r.reserveCovered > 0 ? (
        <Text variant="small" tone="muted">
          {t('daily.reserveCovered', { amount: show(r.reserveCovered) })}
        </Text>
      ) : null}
      {r.status !== 'needs_income' && r.incomeSource === 'declared' ? <SourceTag source="declared" /> : null}
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
          <Text variant="small" tone="muted">
            {t('home.availableHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (r.status === 'needs_income') {
    return (
      <>
        <Card style={{ gap: 8 }}>
          <Text variant="titleS">{t('daily.needsIncome')}</Text>
          <Button icon="cash-outline" label={t('daily.needsIncome.cta')} onPress={() => router.push('/settings/financial')} style={{ alignSelf: 'flex-start' }} />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          {availableRow(false)}
          {hideButton(false)}
        </Card>
        {below}
      </>
    );
  }
  if (r.status === 'deficit') {
    const sentence = t('daily.deficit', { amount: show(r.deficit) });
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
