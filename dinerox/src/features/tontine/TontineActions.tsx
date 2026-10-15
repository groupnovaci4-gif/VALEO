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
import { markReviewMoment } from '@/services/storeReview';
import { TontineSourcePicker, useTontineSources } from './TontineSourcePicker';
import type { TontineSource } from '@/core/savingsCircle';

export function useTontineGestures(tontine: Tontine) {
  const { t } = useI18n();
  const money = useMoney();
  const run = useRunAction();
  const actions = useActions();
  const { undoToast } = useEntrySave();
  const accountLabel = useAccountLabel();
  const { now } = useFinance();
  const from = tontine.accountId ? accountLabel(tontine.accountId) : t('acc.type.cash');

  const receive = (item: ItemState) =>
    Alert.alert(t('tontine.receive.confirm', { amount: money(item.payout) }), t('tontine.receive.body', { name: tontine.name, account: from }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          void run(() => {
            const e = actions.recordTontine({ tontineId: tontine.id, period: item.period, kind: 'payout', amount: item.payout, date: now });
            if (e.transactionId) undoToast([e.transactionId]);
            // Étape 4 : cagnotte reçue = moment positif.
            markReviewMoment('tontine');
          }),
      },
    ]);

  return { receive };
}

/**
 * « J'ai cotisé » (cercle fermé, 2026-10-14) : la cotisation se paie depuis un compte courant,
 * un compte d'épargne ou un objectif (réserve comprise). Toujours confirmée.
 */
export function PaySheet({ tontine, item, onClose }: { tontine: Tontine; item: ItemState | null; onClose: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const run = useRunAction();
  const actions = useActions();
  const { undoToast } = useEntrySave();
  const { now } = useFinance();
  const amount = item?.contribution ?? 0;
  const { accounts } = useTontineSources(tontine.currency, amount);
  const [picked, setPicked] = useState<TontineSource | null>(null);
  const own = tontine.accountId && accounts.some((a) => a.id === tontine.accountId) ? tontine.accountId : (accounts.find((a) => !a.isSavings) ?? accounts[0])?.id;
  const source: TontineSource | null = picked ?? (own ? { kind: 'account', accountId: own } : null);
  const close = () => {
    setPicked(null);
    onClose();
  };
  return (
    <Sheet visible={!!item} onClose={close} title={t('tontine.pay.confirm', { amount: money(amount) })}>
      {item ? (
        <View style={{ gap: 10 }}>
          <TontineSourcePicker currency={tontine.currency} amount={amount} value={source} onChange={setPicked} />
          <Button
            icon="checkmark"
            label={t('common.confirm')}
            onPress={() => {
              const ok = run(() => {
                const e = actions.recordTontine({ tontineId: tontine.id, period: item.period, kind: 'contribution', amount, date: now, source });
                if (e.transactionId) undoToast([e.transactionId]);
              });
              if (ok) close();
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
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
