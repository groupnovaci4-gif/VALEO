import React from 'react';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { useMoney } from '@/hooks/useFinance';
import { Badge, Card, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { upcomingOccurrence } from '@/core/recurring';
import { today } from '@/core/dates';

export default function Recurring() {
  const { t, date } = useI18n();
  const data = useData();
  const money = useMoney();
  return (
    <Screen back title={t('rec.title')} right={<IconButton icon="add-circle" size={30} label={t('rec.new')} onPress={() => router.push('/recurring/edit')} />}>
      <Card>
        {data.recurring.length ? (
          data.recurring.map((r) => {
            const next = upcomingOccurrence(r, today());
            return (
              <Row
                key={r.id}
                title={r.label}
                subtitle={[t(`rec.freq.${r.frequency}` as TKey), next ? t('rec.next', { date: date(next) }) : null].filter(Boolean).join(' · ')}
                right={r.active ? <Text weight="700" tone={r.type === 'income' ? 'income' : 'expense'}>{money(r.amount)}</Text> : <Badge label={t('common.inactive')} />}
                chevron
                onPress={() => router.push(`/recurring/edit?id=${r.id}`)}
              />
            );
          })
        ) : (
          <EmptyState emoji="🔁" title={t('rec.empty.title')} body={t('rec.empty.body')} action={t('rec.new')} onAction={() => router.push('/recurring/edit')} />
        )}
      </Card>
    </Screen>
  );
}
