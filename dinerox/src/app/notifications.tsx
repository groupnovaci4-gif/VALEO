import React from 'react';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useFinance } from '@/hooks/useFinance';
import { Button, Card, EmptyState, Screen, Text } from '@/components/ui';
import { InsightCard } from '@/features/rows';
import { ListenButton } from '@/features/coach/ListenButton';
import { useToRead } from '@/features/notifications/useToRead';

/**
 * Centre de notifications : alertes et analyses du moment (calculées sur l'appareil).
 * Refonte finale B5bis / E3 / E5 : TOUS les messages de « À lire » y restent consultables, lus ou
 * non, un par un (la liste détaillée d'un message regroupé) : les constats, puis le conseil du jour,
 * les points du coach et l'analyse.
 */
export default function Notifications() {
  const { t } = useI18n();
  const { insights } = useFinance();
  const { all } = useToRead();
  const others = all.filter((x) => x.origin !== 'insight');
  return (
    <Screen back title={t('notif.title')} right={<Button small variant="ghost" icon="options-outline" label={t('notif.settings')} onPress={() => router.push('/settings/notifications')} />}>
      {insights.length || others.length ? (
        <>
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
          {others.map((x) => (
            <Card key={x.id} style={{ marginBottom: 10 }}>
              <Text variant="caption" weight="600" tone="muted" style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {t(`toRead.label.${x.kind}` as TKey)}
              </Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {x.text}
              </Text>
              <ListenButton text={x.text} />
            </Card>
          ))}
        </>
      ) : (
        <EmptyState emoji="🔔" title={t('notif.empty')} body={t('ins.empty')} />
      )}
    </Screen>
  );
}
