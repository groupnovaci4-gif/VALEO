import React from 'react';
import { useApp, useSyncStatus } from '@/store/app';
import { useI18n } from '@/i18n';
import { Banner } from './ui/States';

/** Signale clairement le mode hors-ligne, les saisies en attente et le mode local. */
export function SyncBanner() {
  const { mode, online, activeSpace } = useApp();
  const status = useSyncStatus();
  const { t } = useI18n();
  if (mode === 'local' || activeSpace?.id.startsWith('demo_')) return null;
  if (!online) return <Banner tone="warning" icon="cloud-offline-outline" text={t('sync.offline')} />;
  if (status.pending > 0) return <Banner tone="info" icon="sync-outline" text={t('sync.pending', { count: status.pending })} />;
  return null;
}
