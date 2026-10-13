/**
 * Carte du filleul « Votre semaine DineroX » : compteurs calculés par le
 * serveur (`profile.referralProgress`), aucun montant. Affichée tant que la
 * semaine est en cours, puis une semaine après sa validation (remerciement).
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme';
import { Card, Icon, ProgressBar, Text } from '@/components/ui';
import { REFERRAL, weekChecklist } from '@/core/referral';

export function WeekCard() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { profile, mode } = useApp();
  const [now] = useState(() => Date.now());
  const p = profile?.referralProgress;
  const by = profile?.referredBy;
  if (mode !== 'firebase' || !p || !by || (p.status !== 'signed_up' && p.status !== 'validated')) return null;
  if (p.status === 'validated') {
    // Le remerciement reste affiché une semaine, puis la carte disparaît.
    if (now - p.updatedAt > 7 * 24 * 3600 * 1000) return null;
    return (
      <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="checkmark-circle" size={24} color={colors.success} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t('ref.week.done')}
        </Text>
      </Card>
    );
  }
  const c = weekChecklist(p);
  const items: { label: string; done: boolean }[] = [
    { label: t('ref.week.activeDays', { value: c.activeDays.value, of: c.activeDays.of }), done: c.activeDays.done },
    { label: t('ref.week.expenses', { value: c.expenses.value, of: c.expenses.of }), done: c.expenses.done },
    { label: t('ref.week.income'), done: c.income.done },
    { label: t('ref.week.goals', { value: c.goals.value, of: c.goals.of }), done: c.goals.done },
  ];
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 }}>
        <Text variant="bodyStrong" accessibilityRole="header">
          {t('ref.week.title')}
        </Text>
        <Text variant="small" tone="muted">
          {t('ref.week.day', { value: c.day.value, of: c.day.of })}
        </Text>
      </View>
      <View style={{ marginVertical: 8 }}>
        <ProgressBar value={Math.round((c.day.value / REFERRAL.WEEK_DAYS) * 100)} tone="success" height={6} label={t('ref.week.day', { value: c.day.value, of: c.day.of })} />
      </View>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }} accessible accessibilityLabel={`${i.label}${i.done ? ', ✓' : ''}`}>
          <Icon name={i.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={i.done ? colors.success : colors.textSubtle} />
          <Text variant="small" style={{ flex: 1 }}>
            {i.label}
          </Text>
        </View>
      ))}
      {by.firstName ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>
          {t('ref.week.hint', { name: by.firstName })}
        </Text>
      ) : null}
      <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>
        {t('ref.transparency')}
      </Text>
    </Card>
  );
}
