/** Célébration d'une nouvelle récompense : animation douce, texte toujours visible (accessibilité). */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { Button, Icon, Text } from '@/components/ui';
import { REWARDS } from '@/core/coach/rewards';

export function RewardCelebration({ rewardId, message, onClose }: { rewardId: string; message: string; onClose: () => void }) {
  const { colors, radius } = useTheme();
  const { t } = useI18n();
  const def = REWARDS.find((r) => r.id === rewardId);
  const scale = useSharedValue(0.6);
  const glow = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 9, stiffness: 140 });
    glow.value = withDelay(150, withSequence(withTiming(1, { duration: 350 }), withTiming(0.4, { duration: 600 })));
  }, [scale, glow]);
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.value }));
  if (!def) return null;
  const tierColor = def.tier === 'gold' ? '#F5B301' : def.tier === 'silver' ? '#9AA5B1' : '#C27C46';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 30 }]} accessibilityViewIsModal>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, alignItems: 'center', gap: 12, width: '100%', maxWidth: 420 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', width: 120, height: 120 }}>
          <Animated.View style={[{ position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: tierColor }, halo]} />
          <Animated.View style={[{ width: 92, height: 92, borderRadius: 46, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: tierColor }, badge]}>
            <Icon name={def.icon} size={44} color={tierColor} />
          </Animated.View>
        </View>
        <Text variant="overline" tone="muted" accessibilityRole="header">
          {t('reward.celebrate.title')}
        </Text>
        <Text variant="h2" align="center">
          {t(def.nameKey as TKey)}
        </Text>
        <Text align="center">{message}</Text>
        <Button full label={t('reward.celebrate.close')} onPress={onClose} />
      </View>
    </View>
  );
}
