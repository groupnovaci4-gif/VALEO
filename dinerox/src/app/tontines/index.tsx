/**
 * Mes tontines : prochaine cotisation, prochain tour où je reçois,
 * progression et position nette de chaque tontine suivie (calculs :
 * core/tontine). Carnet de suivi : aucun argent ne transite par l'application.
 */
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Badge, Button, Card, EmptyState, Screen, SectionHeader, Text } from '@/components/ui';
import { withSpaceReady } from '@/components/SpaceReady';
import { useTheme } from '@/theme';
import { convertibleRecurring, nextContribution, nextPayout, scheduleState } from '@/core/tontine';
import { can } from '@/core/permissions';
import { NetPositionText } from '@/features/tontine/NetPositionText';

function Tontines() {
  const { t, date } = useI18n();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const { role } = useApp();
  const { data, now } = useFinance();
  const list = useMemo(() => data.tontines.filter((x) => !x.deleted).sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.name.localeCompare(b.name)), [data.tontines]);
  const convertible = convertibleRecurring(data);
  const canCreate = can(role, 'create', 'tontines');

  return (
    <Screen back title={t('tontine.title')}>
      <Text variant="caption" tone="subtle" style={{ marginBottom: 10 }}>
        {t('tontine.legal')}
      </Text>
      {list.length ? (
        list.map((x) => {
          const states = scheduleState(x, data.tontineEntries, now);
          const next = nextContribution(states);
          const payout = nextPayout(states);
          return (
            <Pressable
              key={x.id}
              accessibilityRole="button"
              accessibilityLabel={x.name}
              onPress={() => router.push(`/tontines/${x.id}`)}
              style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10, gap: 4 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {x.name}
                </Text>
                {x.status !== 'active' ? <Badge label={t(`tontine.status.${x.status}` as TKey)} tone="neutral" /> : next?.status === 'late' ? <Badge label={t('tontine.late')} tone="danger" /> : null}
              </View>
              <Text variant="caption" tone="subtle">
                {t(`tontine.type.${x.type}` as TKey)}
              </Text>
              {x.status === 'active' && next ? <Text variant="small">{t('tontine.nextContribution', { amount: money(next.contribution), date: date(next.dueDate) })}</Text> : null}
              {x.status === 'active' && payout ? <Text variant="small">{t('tontine.nextPayout', { amount: money(payout.payout), date: date(payout.date) })}</Text> : null}
              <NetPositionText tontine={x} compact />
            </Pressable>
          );
        })
      ) : (
        <Card>
          <EmptyState emoji="🤝" title={t('tontine.empty.title')} body={t('tontine.empty.body')} />
        </Card>
      )}
      {canCreate ? <Button full icon="add-circle-outline" label={t('tontine.new')} onPress={() => router.push('/tontines/new')} style={{ marginTop: 6 }} /> : null}

      {canCreate && convertible.length ? (
        <>
          <SectionHeader title={t('tontine.convert.section')} />
          <Card style={{ gap: 6 }}>
            <Text variant="small" tone="muted">
              {t('tontine.convert.body')}
            </Text>
            {convertible.map((r) => (
              <Button key={r.id} small variant="secondary" icon="repeat" label={`${r.label} · ${money(r.amount)}`} onPress={() => router.push(`/tontines/new?fromRecurring=${r.id}`)} style={{ alignSelf: 'flex-start' }} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(Tontines);
