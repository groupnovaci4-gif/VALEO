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
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Button, Card, GradientCard, Icon, Text } from '@/components/ui';
import { dailyAllowanceV2 } from '@/core/allowance';
import { BIG_TEXT, useTheme } from '@/theme';

const HIDDEN = '••••••';

export function DailyAllowanceCard({ hidden, onToggleHidden, available }: { hidden?: boolean; onToggleHidden: () => void; available: number }) {
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

  // Texte actuel gardé jusqu'à l'étape 3 : « Revenus » = argent disponible D, « à venir » = engagements E
  // (aucune dépense de plus : elles sont déjà sorties de D). Le détail explique toujours le chiffre.
  const detail = r.status === 'needs_money' ? null : t('daily.detail', { income: show(r.available), expenses: show(0), upcoming: show(r.commitments) });
  // Sous la carte : réserve et source TOUJOURS visibles ; détail du calcul replié.
  const below = (
    <View style={{ marginTop: 8, marginBottom: 12, gap: 6 }}>
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

  if (r.status === 'needs_money') {
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
