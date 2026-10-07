/**
 * Fiche d'une réserve : solde, plafond, mise de côté prévue, historique
 * (apports, utilisations, retraits — et qui les a faits). « Mettre X de côté »
 * demande toujours une confirmation (lien du rappel mensuel : `?refill=1`).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useAccountLabel, useCategoryLabels, useFinance, useMoney } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { Badge, Banner, Button, Card, EmptyState, ProgressBar, Row, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { withSpaceReady } from '@/components/SpaceReady';
import { isReserve, refillAmount, reserveHistory, reserveState } from '@/core/reserve';
import { can, canUseReserve } from '@/core/permissions';

function ReserveDetail() {
  const { id, refill } = useLocalSearchParams<{ id: string; refill?: string }>();
  const { t, date } = useI18n();
  const money = useMoney();
  const toast = useToast();
  const run = useRunAction();
  const accountLabel = useAccountLabel();
  const cats = useCategoryLabels();
  const actions = useActions();
  const { role, user, activeSpace } = useApp();
  const { data, now } = useFinance();
  const reserve = data.goals.find((g) => g.id === id && isReserve(g) && !g.deleted);
  const state = useMemo(() => (reserve ? reserveState(reserve, data.goalContributions) : null), [reserve, data.goalContributions]);
  const history = useMemo(() => (reserve ? reserveHistory(reserve.id, data.goalContributions) : []), [reserve, data.goalContributions]);
  const toRefill = reserve ? refillAmount(reserve, data.goalContributions, now) : 0;
  const canContribute = can(role, 'create', 'goalContributions');
  const canEdit = can(role, 'update', 'goals');
  const canUse = canUseReserve(role);

  const confirmRefill = () => {
    if (!reserve || toRefill <= 0) return;
    Alert.alert(t('reserve.refill.confirm.title', { amount: money(toRefill) }), t('reserve.refill.confirm.body', { name: reserve.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () => {
          const source = data.accounts.find((a) => a.active && !a.deleted && !a.isSavings && a.currency === reserve.currency && a.id !== reserve.accountId);
          const ok = run(() => actions.contributeToGoal({ goalId: reserve.id, amount: toRefill, date: now, accountId: source?.id ?? null, moveTo: reserve.accountId ?? null }));
          if (ok) toast.show(t('reserve.refill.done', { amount: money(toRefill) }), 'success');
        },
      },
    ]);
  };

  // Ouverture depuis le rappel mensuel : la confirmation est proposée une fois.
  const asked = useRef(false);
  useEffect(() => {
    if (refill !== '1' || asked.current || !reserve || toRefill <= 0 || !canContribute) return;
    asked.current = true;
    confirmRefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refill, reserve?.id, toRefill, canContribute]);

  if (!reserve || !state) {
    return (
      <Screen back>
        <EmptyState emoji="🤝" title={t('reserve.notFound')} />
      </Screen>
    );
  }
  const who = (uid: string) => (uid === user?.uid ? t('reserve.by.you') : (activeSpace?.memberNames?.[uid] ?? ''));
  const close = () =>
    Alert.alert(t('reserve.close.confirm'), reserve.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => run(() => (actions.setGoalStatus(reserve.id, 'archived'), router.back())) },
    ]);

  return (
    <Screen back title={`${reserve.icon} ${reserve.name}`} right={canEdit ? <Button small variant="ghost" icon="create-outline" label={t('common.edit')} onPress={() => router.push(`/reserve/new?id=${reserve.id}`)} /> : undefined}>
      <Card>
        <Text variant="small" tone="muted">
          {t('reserve.balance')}
        </Text>
        <Text variant="h1" accessibilityLabel={`${t('reserve.balance')} ${money(state.balance)}`}>
          {money(state.balance)}
        </Text>
        <Text tone="muted" style={{ marginBottom: 12 }}>
          {t('reserve.of', { amount: money(state.target) })}
        </Text>
        <ProgressBar value={state.percent} tone={state.full ? 'success' : 'primary'} height={12} label={reserve.name} />
        <Text variant="small" style={{ marginTop: 8 }}>
          {state.monthly ? t('reserve.monthlyPlan', { amount: money(state.monthly) }) : t('goal.calc.askMonthly')}
        </Text>
        {reserve.accountId ? (
          <Text variant="small" tone="muted">
            {t('goal.account')} : {accountLabel(reserve.accountId)}
          </Text>
        ) : null}
      </Card>
      {state.full ? <Banner tone="success" icon="checkmark-circle" text={t('reserve.full')} /> : state.low ? <Banner tone="info" icon="information-circle" text={t('reserve.low')} /> : null}
      {!canUse && canContribute ? <Banner tone="info" icon="people-outline" text={t('reserve.childNote')} /> : null}

      {canContribute && reserve.status === 'active' ? (
        <View style={{ gap: 8, marginVertical: 14 }}>
          {toRefill > 0 ? <Button icon="add-circle" label={t('reserve.refill', { amount: money(toRefill) })} onPress={confirmRefill} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} variant="secondary" icon="add" label={t('reserve.addOther')} onPress={() => router.push(`/goals/contribute?id=${reserve.id}`)} />
            {canUse && state.balance > 0 ? <Button variant="ghost" icon="remove" label={t('reserve.withdraw')} onPress={() => router.push(`/goals/contribute?id=${reserve.id}&withdraw=1`)} /> : null}
          </View>
        </View>
      ) : (
        <View style={{ height: 14 }} />
      )}

      <SectionHeader title={t('reserve.history')} />
      <Card>
        {history.length ? (
          history.map(({ contribution: c, type }) => {
            const linked = c.linkedTransactionId ? data.transactions.find((x) => x.id === c.linkedTransactionId) : undefined;
            // Sous-catégorie si elle existe dans l'espace, sinon la catégorie principale.
            const catId = linked?.subcategoryId && data.categories.some((x) => x.id === linked.subcategoryId) ? linked.subcategoryId : linked?.categoryId;
            const what = type === 'use' && linked ? `${t('reserve.move.use')} · ${cats.byId(catId ?? '')}` : t(`reserve.move.${type}`);
            const by = who(c.createdBy);
            return (
              <Row
                key={c.id}
                title={money(c.amount, { signed: true })}
                subtitle={[what, date(c.date), by ? t('reserve.by', { name: by }) : null].filter(Boolean).join(' · ')}
                right={c.transferId ? <Badge label={t('tx.transfer')} tone="info" /> : undefined}
                onPress={linked ? () => router.push(`/transaction/${linked.id}`) : undefined}
                chevron={!!linked}
              />
            );
          })
        ) : (
          <EmptyState title={t('reserve.history.empty')} />
        )}
      </Card>

      {canEdit && reserve.status === 'active' ? <Button variant="ghost" icon="archive-outline" label={t('reserve.close')} onPress={close} style={{ marginTop: 20 }} /> : null}
    </Screen>
  );
}

export default withSpaceReady(ReserveDetail);
