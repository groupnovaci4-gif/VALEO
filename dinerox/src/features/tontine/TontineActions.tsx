/**
 * Gestes du carnet de tontine, TOUJOURS confirmés :
 *  - « J'ai cotisé » / « Je l'ai payée » : opération réelle (dépense « Tontine /
 *    cotisation ») + entrée liée ;
 *  - « J'ai reçu la cagnotte » : revenu (« Tontine reçue ») + entrée `payout` ;
 *  - « Reporter » une cotisation en retard (nouvelle date, rien n'est payé).
 * Supprimer l'opération (Historique, « Annuler ») annule l'entrée.
 */
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useI18n } from '@/i18n';
import { useActions } from '@/store/actions';
import { useAccountLabel, useFinance, useMoney } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { useEntrySave } from '@/features/entry/useEntrySave';
import { Button, DateField, Sheet, Text } from '@/components/ui';
import { addDays } from '@/core/dates';
import type { ItemState } from '@/core/tontine';
import type { Tontine } from '@/core/types';

export function useTontineGestures(tontine: Tontine) {
  const { t, date } = useI18n();
  const money = useMoney();
  const run = useRunAction();
  const actions = useActions();
  const { undoToast } = useEntrySave();
  const accountLabel = useAccountLabel();
  const { now } = useFinance();
  const from = tontine.accountId ? accountLabel(tontine.accountId) : t('acc.type.cash');

  const pay = (item: ItemState) =>
    Alert.alert(t('tontine.pay.confirm', { amount: money(item.contribution) }), t('tontine.pay.body', { name: tontine.name, date: date(item.dueDate), account: from }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          void run(() => {
            const e = actions.recordTontine({ tontineId: tontine.id, period: item.period, kind: 'contribution', amount: item.contribution, date: now });
            if (e.transactionId) undoToast([e.transactionId]);
          }),
      },
    ]);

  const receive = (item: ItemState) =>
    Alert.alert(t('tontine.receive.confirm', { amount: money(item.payout) }), t('tontine.receive.body', { name: tontine.name, account: from }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          void run(() => {
            const e = actions.recordTontine({ tontineId: tontine.id, period: item.period, kind: 'payout', amount: item.payout, date: now });
            if (e.transactionId) undoToast([e.transactionId]);
          }),
      },
    ]);

  return { pay, receive };
}

/** « Reporter » : choix de la nouvelle date, puis confirmation. */
export function PostponeSheet({ tontine, item, onClose }: { tontine: Tontine; item: ItemState | null; onClose: () => void }) {
  const { t } = useI18n();
  const run = useRunAction();
  const actions = useActions();
  const { now } = useFinance();
  const [when, setWhen] = useState<string | null>(null);
  const value = when ?? addDays(now, 7);
  return (
    <Sheet visible={!!item} onClose={onClose} title={t('tontine.postpone.title')}>
      {item ? (
        <View style={{ gap: 10 }}>
          <Text variant="small" tone="muted">
            {t('tontine.postpone.body', { name: tontine.name })}
          </Text>
          <DateField label={t('tontine.postpone.date')} value={value} onChange={(d) => d && setWhen(d)} minimumDate={now} shortcuts={false} />
          <Button
            icon="calendar-outline"
            label={t('tontine.postpone.save')}
            onPress={() => {
              if (run(() => actions.postponeTontine({ tontineId: tontine.id, period: item.period, amount: item.contribution, date: value }))) onClose();
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
