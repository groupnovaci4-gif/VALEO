import React from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useFinance } from '@/hooks/useFinance';
import { Button, EmptyState, Screen } from '@/components/ui';
import { InsightCard } from '@/features/rows';

/** Centre de notifications : alertes et analyses du moment (calculées sur l'appareil). */
export default function Notifications() {
  const { t } = useI18n();
  const { insights } = useFinance();
  return (
    <Screen back title={t('notif.title')} right={<Button small variant="ghost" icon="options-outline" label={t('notif.settings')} onPress={() => router.push('/settings/notifications')} />}>
      {insights.length ? insights.map((i) => <InsightCard key={i.id} insight={i} />) : <EmptyState emoji="🔔" title={t('notif.empty')} body={t('ins.empty')} />}
    </Screen>
  );
}
