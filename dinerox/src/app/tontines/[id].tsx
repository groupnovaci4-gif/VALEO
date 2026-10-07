/**
 * Fiche d'une tontine : paramètres saisis et échéancier calculé (date,
 * cotisation, « Vous » ou « Tour n », cagnotte, statut de chaque échéance).
 */
import React, { useMemo } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useAccountLabel, useFinance, useMoney } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { Badge, Button, Card, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { withSpaceReady } from '@/components/SpaceReady';
import { collectorTotals, potOf, scheduleState } from '@/core/tontine';
import { can } from '@/core/permissions';

function TontineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, date, lang } = useI18n();
  const money = useMoney();
  const run = useRunAction();
  const accountLabel = useAccountLabel();
  const actions = useActions();
  const { role } = useApp();
  const { data, now } = useFinance();
  const tontine = data.tontines.find((x) => x.id === id && !x.deleted);
  const states = useMemo(() => (tontine ? scheduleState(tontine, data.tontineEntries, now) : []), [tontine, data.tontineEntries, now]);
  const canEdit = can(role, 'update', 'tontines');
  if (!tontine) {
    return (
      <Screen back>
        <EmptyState emoji="🤝" title={t('tontine.notFound')} />
      </Screen>
    );
  }
  const setStatus = (status: 'active' | 'paused' | 'finished') => {
    const go = () => run(() => actions.saveTontine({ ...tontine, status }));
    if (status !== 'finished') return void go();
    Alert.alert(t('tontine.finish.confirm'), tontine.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => void go() },
    ]);
  };
  const statusTone = { done: 'success', late: 'danger', postponed: 'warning', due: 'neutral' } as const;

  return (
    <Screen back title={tontine.name}>
      <Card style={{ gap: 4 }}>
        <Text variant="small" tone="muted">
          {t(`tontine.type.${tontine.type}` as TKey)}
          {tontine.organizerName ? ` · ${t('tontine.organizer')} : ${tontine.organizerName}` : ''}
        </Text>
        <Text variant="bodyStrong">{t('tontine.myContribution', { amount: money(Math.round(tontine.amountPerShare * tontine.sharesHeld)) })}</Text>
        <Text variant="small">{t(`tontine.freq.${tontine.frequency}` as TKey)}{tontine.frequency === 'custom' && tontine.customDays ? ` (${tontine.customDays})` : ''}</Text>
        {tontine.type === 'rotating' ? <Text variant="small">{t('tontine.preview.rotating', { pot: money(potOf(tontine)), count: tontine.membersCount ?? 0 })}</Text> : null}
        {tontine.type === 'collector' ? (
          (() => {
            const c = collectorTotals(tontine);
            return <Text variant="small">{t('tontine.collector.summary', { total: money(c.total), commission: money(c.commission), returned: money(c.returned), percent: lang === 'fr' ? String(c.percent).replace('.', ',') : String(c.percent) })}</Text>;
          })()
        ) : null}
        {tontine.organizerFee ? <Text variant="caption" tone="subtle">{t('tontine.organizerFee')} : {money(tontine.organizerFee)}</Text> : null}
        {tontine.latePenalty ? <Text variant="caption" tone="subtle">{t('tontine.latePenalty')} : {money(tontine.latePenalty)}</Text> : null}
        {tontine.accountId ? <Text variant="caption" tone="subtle">{t('tontine.account')} : {accountLabel(tontine.accountId)}</Text> : null}
        <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
          {t('tontine.legal')}
        </Text>
      </Card>

      <SectionHeader title={t('tontine.schedule')} />
      <Card>
        {states.map((s) => (
          <Row
            key={s.period}
            title={`${date(s.dueDate)} · ${money(s.contribution)}`}
            subtitle={[
              tontine.type === 'rotating' ? (s.mine ? t('tontine.turn.mine', { amount: money(s.payout) }) : t('tontine.turn.other', { turn: s.turn ?? s.period })) : s.payout > 0 ? t('tontine.collector.returned', { amount: money(s.payout) }) : null,
              s.received ? t('tontine.received') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            right={<Badge label={t(`tontine.item.${s.status}` as TKey)} tone={statusTone[s.status]} />}
          />
        ))}
      </Card>

      {canEdit ? (
        <View style={{ gap: 8, marginTop: 18 }}>
          {tontine.status === 'active' ? <Button variant="secondary" icon="pause" label={t('tontine.pause')} onPress={() => setStatus('paused')} /> : null}
          {tontine.status !== 'active' ? <Button variant="secondary" icon="play" label={t('tontine.resume')} onPress={() => setStatus('active')} /> : null}
          {tontine.status !== 'finished' ? <Button variant="ghost" icon="flag-outline" label={t('tontine.finish')} onPress={() => setStatus('finished')} /> : null}
          <Button variant="ghost" icon="list-outline" label={t('tontine.title')} onPress={() => router.push('/tontines')} />
        </View>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(TontineDetail);
