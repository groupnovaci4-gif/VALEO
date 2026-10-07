/**
 * Fiche d'une tontine : paramètres saisis et échéancier calculé (date,
 * cotisation, « Vous » ou « Tour n », cagnotte, statut de chaque échéance).
 */
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useAccountLabel, useFinance, useMoney } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { Badge, Button, Card, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { withSpaceReady } from '@/components/SpaceReady';
import { collectorTotals, nextContribution, nextPayout, potOf, scheduleState, type ItemState } from '@/core/tontine';
import { NetPositionText } from '@/features/tontine/NetPositionText';
import { UnderstandCard } from '@/features/tontine/UnderstandCard';
import { PostponeSheet, useTontineGestures } from '@/features/tontine/TontineActions';
import { can } from '@/core/permissions';
import type { Tontine } from '@/core/types';

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
  const canRecord = can(role, 'create', 'transactions');
  const [postponing, setPostponing] = useState<ItemState | null>(null);
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

      <Card style={{ marginTop: 12, gap: 4 }} accessibilityLabel={t('tontine.net.title')}>
        <Text variant="small" tone="muted">
          {t('tontine.net.title')}
        </Text>
        <NetPositionText tontine={tontine} />
      </Card>

      <UnderstandCard tontine={tontine} />

      {tontine.status === 'active' && canRecord ? <TodoList tontine={tontine} states={states} onPostpone={setPostponing} /> : null}
      <PostponeSheet tontine={tontine} item={postponing} onClose={() => setPostponing(null)} />

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

/** « À faire » : cotisations en retard (payée / reporter), prochaine cotisation, cagnotte à recevoir. */
function TodoList({ tontine, states, onPostpone }: { tontine: Tontine; states: ItemState[]; onPostpone: (i: ItemState) => void }) {
  const { t, date } = useI18n();
  const money = useMoney();
  const { now } = useFinance();
  const { pay, receive } = useTontineGestures(tontine);
  const late = states.filter((s) => s.status === 'late');
  const next = nextContribution(states.filter((s) => s.status !== 'late'));
  const payout = nextPayout(states);
  if (!late.length && !next && !payout) return null;
  return (
    <>
      <SectionHeader title={t('tontine.todo')} />
      <Card style={{ gap: 10 }}>
        {late.map((s) => (
          <View key={`late${s.period}`} style={{ gap: 6 }}>
            <Text variant="small" tone="danger">
              {t('tontine.lateNote', { date: date(s.dueDate) })} {money(s.contribution)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small icon="checkmark" label={t('tontine.paidLate')} onPress={() => pay(s)} />
              <Button small variant="secondary" icon="calendar-outline" label={t('tontine.postpone')} onPress={() => onPostpone(s)} />
            </View>
          </View>
        ))}
        {next ? (
          <View style={{ gap: 6 }}>
            <Text variant="small">{t('tontine.nextContribution', { amount: money(next.contribution), date: date(next.dueDate) })}</Text>
            <Button small icon="checkmark" label={t('tontine.paid')} onPress={() => pay(next)} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}
        {payout ? (
          <View style={{ gap: 6 }}>
            <Text variant="small">{t('tontine.nextPayout', { amount: money(payout.payout), date: date(payout.date) })}</Text>
            {payout.date <= now ? <Button small variant="success" icon="cash-outline" label={t('tontine.gotPot')} onPress={() => receive(payout)} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        ) : null}
      </Card>
    </>
  );
}

export default withSpaceReady(TontineDetail);
