import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Badge, Banner, Button, Card, Icon, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { FREE_VOICE_ENTRIES_PER_DAY, PLANS, PLAN_ORDER } from '@/core/subscription';
import { formatMoney } from '@/core/money';
import { analytics } from '@/services/analytics';
import type { PlanId } from '@/core/types';

const FEATURES: Record<PlanId, TKey[]> = {
  free: ['sub.free.f1', 'sub.free.f2', 'sub.free.f3', 'sub.free.f4', 'sub.free.voice'],
  plus: ['sub.plus.f1', 'sub.plus.f2', 'sub.plus.f3', 'sub.plus.f4', 'sub.plus.f5', 'sub.voiceUnlimited'],
  family: ['sub.family.f1', 'sub.family.f2', 'sub.family.f3', 'sub.family.f4', 'sub.voiceUnlimited'],
};

/**
 * Formules. Aucun paiement n'est encore intégré : le bouton n'encaisse rien
 * et l'écran le dit clairement (voir services/billing.ts).
 */
export default function Subscription() {
  const { t, date } = useI18n();
  const { colors } = useTheme();
  const { plan, profile } = useApp();
  useEffect(() => analytics.track('premium_viewed', { plan }), [plan]);
  return (
    <Screen back title={t('sub.title')}>
      <Banner tone="info" icon="information-circle-outline" text={t('sub.comingSoon')} />
      {PLAN_ORDER.map((id) => {
        const current = id === plan;
        return (
          <Card key={id} style={{ marginBottom: 12, borderColor: current ? colors.success : colors.border, borderWidth: current ? 2 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h3">{t(`sub.${id}` as TKey)}</Text>
              {current ? <Badge tone="success" label={t('sub.currentBadge')} /> : null}
            </View>
            <Text variant="h2" style={{ marginVertical: 6 }}>
              {PLANS[id].priceXof ? t('sub.price', { amount: formatMoney(PLANS[id].priceXof, 'XOF') }) : t('sub.free')}
            </Text>
            {FEATURES[id].map((f) => (
              <View key={f} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Icon name="checkmark-circle" size={18} color={colors.success} />
                <Text variant="small" style={{ flex: 1 }}>
                  {t(f, { count: FREE_VOICE_ENTRIES_PER_DAY })}
                </Text>
              </View>
            ))}
            {!current && id !== 'free' ? <Button style={{ marginTop: 12 }} label={t('common.notAvailable')} disabled /> : null}
            {current && profile?.subscription.expiresAt ? (
              <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
                {t('sub.expires', { date: date(new Date(profile.subscription.expiresAt).toISOString().slice(0, 10), { year: true }) })}
              </Text>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
