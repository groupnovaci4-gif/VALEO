/**
 * Barre d'enregistrement « comme WhatsApp » (dans la feuille de saisie, pas
 * d'écran plein) : pastille rouge qui clignote + chronomètre à gauche, onde
 * qui suit la voix (ou animation neutre si le niveau sonore n'est pas
 * fourni), corbeille pour annuler, bouton d'arrêt bien visible à droite.
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useI18n } from '@/i18n';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatElapsed } from '@/core/entry/recorder';

export function RecorderBar({ elapsed, levels, hasVolume, bars, onCancel, onStop }: { elapsed: number; levels: number[]; hasVolume: boolean; bars: number; onCancel: () => void; onStop: () => void }) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const [blink] = useState(() => new Animated.Value(1));
  const [idle] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(blink, { toValue: 0.2, duration: 550, useNativeDriver: true }), Animated.timing(blink, { toValue: 1, duration: 550, useNativeDriver: true })]));
    const b = Animated.loop(Animated.timing(idle, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: false }));
    a.start();
    if (!hasVolume) b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [blink, idle, hasVolume]);
  const time = formatElapsed(elapsed);
  const padded = [...Array(Math.max(0, bars - levels.length)).fill(0), ...levels];
  return (
    <View
      collapsable={false}
      accessibilityRole="toolbar"
      accessibilityLabel={t('entry.voice.recording')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, paddingVertical: 8, paddingLeft: 12, paddingRight: 8, alignSelf: 'stretch' }}
    >
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger, opacity: blink }} />
      <Text variant="bodyStrong" style={{ minWidth: 40, fontVariant: ['tabular-nums'] }} accessibilityLabel={t('entry.voice.elapsed', { time })} accessibilityLiveRegion="none">
        {time}
      </Text>
      <View style={{ flex: 1, height: 32, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {padded.map((v, i) =>
          hasVolume ? (
            <View key={i} style={{ flex: 1, height: 4 + Math.round(v * 26), borderRadius: 2, backgroundColor: colors.primary, opacity: 0.85 }} />
          ) : (
            // Niveau sonore non fourni : vague neutre qui ne prétend pas suivre la voix.
            <Animated.View
              key={i}
              style={{
                flex: 1,
                borderRadius: 2,
                backgroundColor: colors.primary,
                opacity: 0.6,
                height: idle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [6 + ((i * 7) % 12), 6 + (((i + 5) * 7) % 16), 6 + ((i * 7) % 12)] }),
              }}
            />
          ),
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('entry.voice.cancel')} onPress={onCancel} hitSlop={8} style={{ padding: 8 }}>
        <Icon name="trash-outline" size={22} color={colors.danger} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('entry.voice.finish')}
        onPress={onStop}
        style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, opacity: pressed ? 0.85 : 1 })}
      >
        <Icon name="stop" size={24} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}
