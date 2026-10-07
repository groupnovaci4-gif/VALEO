/**
 * « Comprendre ma tontine » : explication neutre (aucun conseil de quitter la
 * tontine, aucun jugement), chiffres calculés par core/tontine.
 */
import React from 'react';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Card, Text } from '@/components/ui';
import { collectorTotals, netPosition } from '@/core/tontine';
import type { Tontine } from '@/core/types';

export function UnderstandCard({ tontine }: { tontine: Tontine }) {
  const { t, lang } = useI18n();
  const money = useMoney();
  const { data, now } = useFinance();
  const lines: string[] = [];
  if (tontine.type === 'rotating') {
    const p = netPosition(tontine, data.tontineEntries, now);
    lines.push(t('tontine.understand.rotating'));
    if (p.type === 'rotating') lines.push(p.phase === 'before' ? t('tontine.understand.before') : p.phase === 'finished' ? t('tontine.understand.finished') : t('tontine.understand.after'));
  } else if (tontine.type === 'collector') {
    const c = collectorTotals(tontine);
    lines.push(t('tontine.understand.collector'));
    lines.push(t('tontine.understand.commission', { commission: money(c.commission), total: money(c.total), percent: lang === 'fr' ? String(c.percent).replace('.', ',') : String(c.percent) }));
  } else {
    lines.push(t('tontine.understand.fixed'));
  }
  return (
    <Card style={{ marginTop: 12, gap: 6 }} accessibilityLabel={t('tontine.understand.title')}>
      <Text variant="bodyStrong">{t('tontine.understand.title')}</Text>
      {lines.map((l) => (
        <Text key={l} variant="small" tone="muted">
          {l}
        </Text>
      ))}
    </Card>
  );
}
