/**
 * Position nette d'une tontine, expliquée simplement (chiffres : core/tontine).
 * Avant mon tour : épargne ; après : crédit sans intérêt envers le groupe.
 */
import React from 'react';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Text } from '@/components/ui';
import { netPosition } from '@/core/tontine';
import type { Tontine } from '@/core/types';

export function useNetPositionLines(tontine: Tontine): string[] {
  const { t, date } = useI18n();
  const money = useMoney();
  const { data, now } = useFinance();
  const p = netPosition(tontine, data.tontineEntries, now);
  if (p.type === 'collector') return [t('tontine.net.collector', { paid: money(p.paid), commission: money(p.commission), expected: money(p.expected), date: p.date ? date(p.date) : '—' })];
  if (p.type === 'fixed_contribution') return [t('tontine.net.fixed', { paid: money(p.paid) })];
  const lines: string[] = [];
  if (p.phase === 'before' && p.next) lines.push(t('tontine.net.before', { paid: money(p.paid), pot: money(p.next.amount), n: p.next.turn, date: date(p.next.date) }));
  if (p.phase === 'between' && p.next) lines.push(t('tontine.net.between', { received: money(p.received), paid: money(p.paid), n: p.next.turn, date: date(p.next.date), pot: money(p.next.amount) }));
  if (p.phase === 'after') lines.push(t('tontine.net.after', { received: money(p.received), remaining: money(p.remainingToPay), count: p.remainingCount }));
  if (p.phase === 'finished') lines.push(t('tontine.net.finished', { paid: money(p.paid), received: money(p.received) }));
  if (p.phase !== 'finished' && p.net > 0) lines.push(t('tontine.net.savings', { amount: money(p.net) }));
  if (p.phase !== 'finished' && p.net < 0) lines.push(t('tontine.net.credit', { amount: money(-p.net) }));
  lines.push(t('tontine.progress', { current: p.currentTurn, total: p.totalTurns }));
  return lines;
}

export function NetPositionText({ tontine, compact }: { tontine: Tontine; compact?: boolean }) {
  const lines = useNetPositionLines(tontine);
  return (
    <View style={{ gap: 2 }}>
      {(compact ? lines.slice(0, 1) : lines).map((l) => (
        <Text key={l} variant={compact ? 'caption' : 'small'} tone={compact ? 'subtle' : undefined}>
          {l}
        </Text>
      ))}
    </View>
  );
}
