/** Carte « Votre coach » de l'accueil : le résumé regroupé de l'ouverture. */
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Card, Icon, Text } from '@/components/ui';
import type { CoachSeverity } from '@/core/coach/events';
import { useCoach } from './CoachProvider';

const ICON: Record<CoachSeverity, string> = { critical: 'alert-circle', warning: 'warning', celebration: 'trophy', advice: 'bulb', info: 'information-circle' };

export function CoachSummaryCard() {
  const { summary, dismiss, text } = useCoach();
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!summary.length) return null;
  const tone: Record<CoachSeverity, string> = { critical: colors.danger, warning: colors.warning, celebration: colors.success, advice: colors.primary, info: colors.info };
  return (
    <Card style={{ marginBottom: 14 }} accessibilityLabel={summary.length > 1 ? t('coach.summary.title', { count: summary.length }) : t('coach.summary.one')}>
      <Text variant="bodyStrong" accessibilityRole="header" style={{ marginBottom: 8 }}>
        {summary.length > 1 ? t('coach.summary.title', { count: summary.length }) : t('coach.summary.one')}
      </Text>
      {summary.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
          <Icon name={ICON[e.severity]} size={18} color={tone[e.severity]} />
          <Text variant="small" style={{ flex: 1 }}>
            {text(e)}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
        {t('coach.disclaimer')}
      </Text>
      <Button small variant="secondary" label={t('coach.summary.dismiss')} onPress={dismiss} />
    </Card>
  );
}
