/**
 * Carte de l'accueil (cercle fermé, 2026-10-14) : affichée tant que l'argent
 * disponible (comptes courants, hors argent mis de côté) est à zéro ou négatif.
 * Jamais pour une personne qui n'a jamais renseigné son argent (`moneyTracked`).
 * Aucune notification : seulement dans l'application.
 */
import React from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { Button, Card, Text } from '@/components/ui';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { moneyTracked } from '@/core/savingsCircle';

export function ShortfallCard({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const money = useMoney();
  const { data, position, currency } = useFinance();
  if (position.free > 0 || !moneyTracked(data.accounts, data.transactions, currency)) return null;
  const amount = hidden ? '••••••' : money(position.free);
  return (
    <Card style={{ gap: 8, marginBottom: 12 }} accessibilityLabel={t('circle.card.title')}>
      <Text variant="bodyStrong">{t('circle.card.title')}</Text>
      <Text variant="small" tone="muted">
        {t('circle.card.body', { amount })}
      </Text>
      <Button small variant="secondary" icon="wallet-outline" label={t('circle.withdraw')} onPress={() => router.push({ pathname: '/withdraw', params: position.free < 0 ? { amount: String(-position.free) } : {} })} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}
