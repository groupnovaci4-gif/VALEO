/**
 * Repère principal de l'accueil : « Il vous reste X par jour jusqu'au … ».
 * Chiffres calculés par core/dailyAllowance (aucun calcul ici).
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, Text } from '@/components/ui';
import { SourceTag } from '@/features/Recommendation';
import { dailyAllowance } from '@/core/dailyAllowance';
import { useTheme } from '@/theme';

export function DailyAllowanceCard({ hidden }: { hidden?: boolean }) {
  const { t, date } = useI18n();
  const { colors } = useTheme();
  const { profile } = useApp();
  const money = useMoney();
  const { data, currency, now } = useFinance();
  const r = useMemo(() => dailyAllowance({ data, currency, today: now, financial: profile?.financial }), [data, currency, now, profile?.financial]);
  const show = (n: number) => (hidden ? '••••••' : money(n));

  if (r.status === 'needs_income') {
    return (
      <Card style={{ marginBottom: 12 }} accessibilityLabel={t('daily.needsIncome')}>
        <Text variant="bodyStrong">{t('daily.needsIncome')}</Text>
        <Button small variant="secondary" icon="cash-outline" label={t('daily.needsIncome.cta')} onPress={() => router.push('/settings/financial')} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      </Card>
    );
  }
  const detail = t('daily.detail', { income: show(r.income), expenses: show(r.expenses), upcoming: show(r.upcomingRecurring + r.goalsRemaining) });
  if (r.status === 'deficit') {
    return (
      <Card style={{ marginBottom: 12, borderColor: colors.danger, borderWidth: 1 }} accessibilityLabel={t('daily.deficit', { amount: show(r.deficit) })}>
        <Text variant="bodyStrong" tone="danger">
          {t('daily.deficit', { amount: show(r.deficit) })}
        </Text>
        <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>
          {detail}
        </Text>
        {r.incomeSource === 'declared' ? <View style={{ marginTop: 6 }}><SourceTag source="declared" /></View> : null}
      </Card>
    );
  }
  const sentence = t('daily.perDay', { amount: show(r.perDay), date: date(r.until) });
  return (
    <Card style={{ marginBottom: 12 }} accessibilityLabel={sentence}>
      <Text variant="small" tone="muted">
        {t('daily.label')}
      </Text>
      <Text variant="h1" style={{ color: colors.primary, marginVertical: 4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {show(r.perDay)}
      </Text>
      <Text variant="bodyStrong">{sentence}</Text>
      <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>
        {detail}
      </Text>
      {r.incomeSource === 'declared' ? <View style={{ marginTop: 6 }}><SourceTag source="declared" /></View> : null}
    </Card>
  );
}
