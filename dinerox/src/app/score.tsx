/**
 * Mon score de comportement financier : indicateur PERSONNEL, calculé sur
 * l'appareil (jamais stocké en ligne, jamais partagé ni envoyé à un tiers).
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { useFinance } from '@/hooks/useFinance';
import { Banner, Button, Card, ProgressBar, Screen, SectionHeader, Text } from '@/components/ui';
import { useApp } from '@/store/app';
import { behaviorScore, explainChange, latestScore } from '@/core/coach/score';
import { previousMonth } from '@/core/dates';
import { withSpaceReady } from '@/components/SpaceReady';

function Score() {
  const { t, monthYear } = useI18n();
  const { data, currency, now } = useFinance();
  const { activeSpace, spaces, setActiveSpace } = useApp();
  const personal = spaces.find((s) => s.kind === 'personal');
  const current = useMemo(() => latestScore(data, currency, now), [data, currency, now]);
  const before = useMemo(() => behaviorScore(data, currency, previousMonth(current.month)), [data, currency, current.month]);
  const why = useMemo(() => explainChange(before, current), [before, current]);
  const monthLabel = (m: string) => monthYear(`${m}-01`);
  const signed = (n: number) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')}`;
  return (
    <Screen back title={t('score.title')} subtitle={t('score.subtitle')}>
      <Banner tone="info" icon="information-circle-outline" text={t('score.disclaimer')} />
      {/* Score PERSONNEL : jamais calculé sur un espace familial (ni montré à la famille). */}
      {activeSpace?.kind === 'family' ? (
        <Card>
          <Text>{t('score.personalOnly')}</Text>
          {personal ? <Button small icon="person-outline" label={t('score.openPersonal')} onPress={() => setActiveSpace(personal.id)} style={{ marginTop: 10, alignSelf: 'flex-start' }} /> : null}
        </Card>
      ) : current.score === null ? (
        <Card>
          <Text>{t('score.notEnough')}</Text>
        </Card>
      ) : (
        <>
          <Card accessibilityLabel={`${t('score.title')} : ${current.score} ${t('score.outOf')}`}>
            <Text variant="caption" tone="muted">
              {t('score.month', { month: monthLabel(current.month) })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 6 }}>
              <Text variant="display">{current.score}</Text>
              <Text tone="muted" style={{ marginBottom: 8 }}>
                {t('score.outOf')}
              </Text>
            </View>
            <ProgressBar value={current.score} tone={current.score >= 70 ? 'success' : current.score >= 40 ? 'warning' : 'danger'} height={10} />
          </Card>

          <SectionHeader title={t('score.components')} />
          <Card>
            {current.components.map((c) => (
              <View key={c.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {t(`score.c.${c.id}` as TKey)}
                  </Text>
                  <Text weight="700">{c.value === null ? '—' : `${c.value}/100`}</Text>
                </View>
                {c.value === null ? (
                  <Text variant="caption" tone="subtle">
                    {t('score.excluded')}
                  </Text>
                ) : (
                  <>
                    <ProgressBar value={c.value} tone="success" height={6} />
                    <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>
                      {t('score.weight', { percent: Math.round(c.effectiveWeight * 100) })}
                    </Text>
                  </>
                )}
              </View>
            ))}
          </Card>

          <SectionHeader title={t('score.why')} />
          <Card>
            {why.delta === null ? (
              <Text tone="muted">{t('score.why.none')}</Text>
            ) : (
              <>
                <Text variant="bodyStrong" style={{ marginBottom: 8 }}>
                  {why.delta === 0 ? t('score.why.same', { month: monthLabel(before.month) }) : t('score.why.delta', { delta: signed(why.delta), month: monthLabel(before.month) })}
                </Text>
                {why.changes.map((c) => (
                  <Text key={c.id} variant="small" tone={c.points > 0 ? 'success' : c.points < 0 ? 'danger' : 'muted'} style={{ marginBottom: 4 }}>
                    {t('score.why.line', { name: t(`score.c.${c.id}` as TKey), points: signed(c.points) })}
                  </Text>
                ))}
              </>
            )}
          </Card>
        </>
      )}
      <Text variant="caption" tone="subtle" style={{ marginTop: 10 }}>
        {t('score.private')}
      </Text>
    </Screen>
  );
}

export default withSpaceReady(Score);
