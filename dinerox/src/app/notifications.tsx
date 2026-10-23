import React from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { DesignV2 } from '@/theme';
import { EmptyState, IconButton, Screen } from '@/components/ui';
import { useToRead } from '@/features/notifications/useToRead';
import { ToReadCard } from '@/features/notifications/ToReadList';

/**
 * Centre de notifications : alertes et analyses du moment (calculées sur l'appareil).
 * Refonte finale B5bis / E3 / E5 : TOUS les messages de « À lire » y restent consultables, lus ou
 * non, un par un (la liste détaillée d'un message regroupé) : les constats, puis le conseil du jour,
 * les points du coach et l'analyse.
 * Direction B (demande du fondateur, 23/10) : fond sable, chaque message dans la carte de « À lire »
 * (`ToReadCard`), sans × : cet écran garde tout. Réglages = bouton icône, le titre n'est jamais coupé.
 */
export default function Notifications() {
  return (
    <DesignV2>
      <NotificationsScreen />
    </DesignV2>
  );
}

function NotificationsScreen() {
  const { t } = useI18n();
  const { all, alerts } = useToRead();
  // Même ordre qu'avant : chaque constat, puis les autres messages.
  const messages = [...alerts, ...all.filter((x) => x.origin !== 'insight')];
  return (
    <Screen back title={t('notif.title')} right={<IconButton icon="options-outline" label={t('notif.settings')} onPress={() => router.push('/settings/notifications')} />}>
      {messages.length ? (
        messages.map((x) => <ToReadCard key={`${x.origin ?? x.kind}-${x.id}`} item={x} testID={`notif-${x.origin ?? x.kind}`} />)
      ) : (
        <EmptyState emoji="🔔" title={t('notif.empty')} body={t('ins.empty')} />
      )}
    </Screen>
  );
}
