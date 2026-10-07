/**
 * « Prendre sur la réserve ? (solde : X) » — proposé pour une dépense famille
 * ou cérémonie (carte de confirmation, formulaire). L'utilisateur décide ; si
 * la réserve ne suffit pas, le complément pris sur le budget du mois est
 * montré, rien n'est bloqué. Calculs : core/reserve (aucune formule ici).
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Chip, Text } from '@/components/ui';
import { activeReserves, reserveBalance, reserveEligible, splitReserveUse } from '@/core/reserve';
import { canUseReserve } from '@/core/permissions';

/** Réserves proposables pour une dépense (vide : rien n'est proposé). */
export function useReserveChoices(type: string, categoryId: string | null | undefined) {
  const { role } = useApp();
  const { data, currency } = useFinance();
  if (type !== 'expense' || !reserveEligible(categoryId) || !canUseReserve(role)) return [];
  return activeReserves(data.goals, currency);
}

export function ReserveUseToggle({
  type,
  categoryId,
  amount,
  value,
  onChange,
  excludeTransactionId,
  alreadyTaken = 0,
  style,
}: {
  type: string;
  categoryId: string | null | undefined;
  amount: number | null;
  /** Réserve choisie (null : budget du mois). */
  value: string | null;
  onChange: (reserveId: string | null) => void;
  /** Opération déjà liée (modification) : son utilisation actuelle n'entre pas dans le solde. */
  excludeTransactionId?: string;
  /** Montant déjà pris sur cette réserve par les lignes précédentes de la même saisie. */
  alreadyTaken?: number;
  style?: ViewStyle;
}) {
  const { t } = useI18n();
  const money = useMoney();
  const { data } = useFinance();
  const reserves = useReserveChoices(type, categoryId);
  if (!reserves.length) return null;
  const chosen = reserves.find((r) => r.id === value) ?? null;
  const others = data.goalContributions.filter((c) => !excludeTransactionId || c.linkedTransactionId !== excludeTransactionId);
  const balanceOf = (id: string) => Math.max(0, reserveBalance(reserves.find((r) => r.id === id)!, others) - (id === value ? alreadyTaken : 0));
  const shown = chosen ?? reserves[0];
  const balance = balanceOf(shown.id);
  const split = chosen && amount ? splitReserveUse(amount, balance) : null;

  return (
    <View style={[{ gap: 6 }, style]} accessibilityLabel={t('reserve.use.ask', { balance: money(balance) })}>
      <Text variant="small" weight="700">
        {t('reserve.use.ask', { balance: money(balance) })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {reserves.map((r) => (
          <Chip key={r.id} icon="wallet-outline" label={reserves.length > 1 ? r.name : t('reserve.use.yes')} selected={value === r.id} onPress={() => onChange(value === r.id ? null : r.id)} />
        ))}
        <Chip label={t('reserve.use.no')} selected={!value} onPress={() => onChange(null)} />
      </View>
      {split ? (
        <Text variant="caption" tone={split.complement > 0 ? 'warning' : 'subtle'}>
          {split.fromReserve <= 0
            ? t('reserve.use.empty')
            : split.complement > 0
              ? t('reserve.use.complement', { amount: money(split.fromReserve), complement: money(split.complement) })
              : t('reserve.use.covered', { amount: money(split.fromReserve) })}
        </Text>
      ) : null}
    </View>
  );
}
