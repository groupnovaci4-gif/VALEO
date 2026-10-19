/**
 * §11.2 — revenus irréguliers : après l'enregistrement d'un REVENU reçu, une carte
 * « Vous avez reçu X. Mettre Y de côté maintenant ? ».
 *  - « Mettre de côté » : écran de versement d'épargne, prérempli (montant et compte d'où
 *    vient l'argent), modifiable, avec le contrôle de l'argent disponible (§6) ;
 *  - « Pas maintenant » : la carte disparaît.
 * Aucune carte pour un revenu régulier, un emprunt, une cagnotte ou un remboursement :
 * la décision est calculée par `incomeSavingPrompt` (core/coachData, testé).
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { clearIncomeSaving, useIncomeSavingOffer } from '@/store/incomeSavingOffer';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { incomeSavingPrompt } from '@/core/coachData';

export function IncomeSavingCard({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const { profile } = useApp();
  const { data, currency, now } = useFinance();
  const ids = useIncomeSavingOffer();
  const financial = profile?.financial ?? null;
  const offer = useMemo(() => (ids ? incomeSavingPrompt(data, ids, currency, now, financial) : null), [ids, data, currency, now, financial]);
  if (!offer) return null;
  const show = (n: number) => (hidden ? '••••••' : money(n));
  const putAside = () => {
    clearIncomeSaving();
    router.push({ pathname: '/savings/move', params: { mode: 'deposit', amount: String(offer.suggestion), fromId: offer.accountId } });
  };
  return (
    <Card tone="success" style={{ gap: 10, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Icon name="leaf-outline" size={22} color={colors.success} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t('incomeSave.title', { amount: show(offer.received), suggestion: show(offer.suggestion) })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button small icon="wallet-outline" label={t('incomeSave.yes')} onPress={putAside} />
        <Button small variant="tertiary" label={t('incomeSave.no')} onPress={clearIncomeSaving} />
      </View>
    </Card>
  );
}
