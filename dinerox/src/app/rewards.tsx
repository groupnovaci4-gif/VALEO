/** Mes récompenses : catalogue, obtentions et progression du mois en cours. */
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useFinance } from '@/hooks/useFinance';
import { Button, Card, Icon, ProgressBar, Screen, Text } from '@/components/ui';
import { router } from 'expo-router';
import { useApp } from '@/store/app';
import { REWARDS, rewardProgress } from '@/core/coach/rewards';
import { useCoach } from '@/features/coach/CoachProvider';
import { withSpaceReady } from '@/components/SpaceReady';

const TIER: Record<string, string> = { gold: '#F5B301', silver: '#9AA5B1', bronze: '#C27C46' };

function Rewards() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { data, currency, month } = useFinance();
  const { rewards, checkRewards } = useCoach();
  const { mode } = useApp();
  // Ouverture de l'écran : liste à jour (et éventuelle récompense en attente).
  useEffect(() => {
    void checkRewards({ overlay: true }).catch(() => undefined);
  }, [checkRewards]);
  const progress = useMemo(() => rewardProgress({ data, currency, month, history: rewards }), [data, currency, month, rewards]);
  return (
    <Screen back title={t('reward.title')} subtitle={t('reward.subtitle')}>
      {REWARDS.map((r) => {
        const count = rewards.filter((x) => x.rewardId === r.id).length;
        const pct = Math.round((progress[r.id] ?? 0) * 100);
        return (
          <Card key={r.id} style={{ marginBottom: 10 }} accessibilityLabel={`${t(r.nameKey as TKey)}, ${count ? t('reward.earned', { count }) : t('reward.notYet')}`}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: count ? TIER[r.tier] : colors.surfaceAlt }}>
                <Icon name={r.icon} size={24} color={count ? '#FFFFFF' : colors.textSubtle} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong">{t(r.nameKey as TKey)}</Text>
                <Text variant="caption" tone="muted">
                  {t(r.descKey as TKey)}
                </Text>
                <Text variant="caption" weight="600" tone={count ? 'success' : 'subtle'} style={{ marginTop: 2 }}>
                  {count ? t('reward.earned', { count }) : t('reward.notYet')}
                </Text>
              </View>
            </View>
            {count ? (
              <Button
                small
                variant="tertiary"
                icon="share-social-outline"
                label={t('share.trophy.cta')}
                accessibilityLabel={`${t('share.trophy.cta')}, ${t(r.nameKey as TKey)}`}
                onPress={() => router.push({ pathname: '/share-trophy', params: { id: r.id } })}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              />
            ) : null}
            {r.scope === 'month' ? (
              <View style={{ marginTop: 10 }}>
                <ProgressBar value={pct} tone="success" height={6} />
                <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
                  {t('reward.progress', { percent: pct })}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
      <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
        {t('reward.rule')}
      </Text>
      {/* Après une récompense : inviter des amis (parrainage). */}
      {mode === 'firebase' ? <Button variant="secondary" icon="gift-outline" label={t('ref.title')} onPress={() => router.push('/invite')} style={{ marginTop: 16, alignSelf: 'center' }} /> : null}
    </Screen>
  );
}

export default withSpaceReady(Rewards);
