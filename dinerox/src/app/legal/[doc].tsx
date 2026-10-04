import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { Card, Screen, Text } from '@/components/ui';
import { LEGAL } from '@/content/legal';
import { brand } from '@/config/brand';

export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t, lang, date } = useI18n();
  const key = doc === 'terms' ? 'terms' : 'privacy';
  const d = LEGAL[key][lang];
  const fill = (s: string) => s.replace(/\{app\}/g, brand.name);
  return (
    <Screen back title={t(key === 'terms' ? 'legal.terms.title' : 'legal.privacy.title')} subtitle={t('legal.updated', { date: date(d.updated, { year: true }) })} syncBanner={false}>
      {d.sections.map((s) => (
        <Card key={s.title} style={{ marginBottom: 10 }}>
          <Text variant="bodyStrong" style={{ marginBottom: 6 }}>
            {fill(s.title)}
          </Text>
          <Text tone="muted">{fill(s.body)}</Text>
        </Card>
      ))}
      <Text variant="caption" tone="subtle">
        {brand.supportEmail}
      </Text>
    </Screen>
  );
}
