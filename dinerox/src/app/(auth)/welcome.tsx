import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Text } from '@/components/ui';
import { PHOTO_SOURCES } from '@/components/ui/photoSources';
import { Logo } from '@/components/Logo';
import { useApp } from '@/store/app';
import { env, isFirebaseConfigured } from '@/config/env';

/** Hauteur minimale de la zone verte (hors barre d'état) : la photo reste visible au-dessus du texte. */
const HERO_MIN_HEIGHT = 420;

/**
 * Fondu sur la photo (référence validée par le fondateur) : léger voile vert en haut (barre
 * d'état lisible), photo nette au milieu, puis vert de plus en plus opaque jusqu'au vert
 * plein sous le texte. [position, opacité du vert]
 */
const FADE: [string, number][] = [
  ['0', 0.55],
  ['0.18', 0],
  ['0.42', 0],
  ['0.72', 0.85],
  ['0.92', 1],
  ['1', 1],
];

export default function Welcome() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { enterLocalMode } = useApp();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'demo' | 'local' | null>(null);
  const start = (kind: 'demo' | 'local') => {
    setBusy(kind);
    void enterLocalMode({ demo: kind === 'demo' }).finally(() => setBusy(null));
  };
  return (
    // Bord à bord : la photo monte sous la barre d'état ; en bas, le panneau descend jusqu'en
    // bas de l'écran (la marge du système est ajoutée à son padding).
    <View style={{ flex: 1, backgroundColor: colors.hero }}>
      {/* Petit écran (320 × 568) ou texte agrandi : l'ensemble défile au lieu d'être coupé. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        {/* Zone verte : la photo l'occupe entièrement (décorative, styles fixes — règle 13). */}
        <View style={{ flex: 1, minHeight: insets.top + HERO_MIN_HEIGHT, justifyContent: 'flex-end' }}>
          <View style={StyleSheet.absoluteFill} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={PHOTO_SOURCES.welcome} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="welcomeFade" x1="0" y1="0" x2="0" y2="1">
                  {FADE.map(([offset, opacity]) => (
                    <Stop key={offset} offset={offset} stopColor={colors.hero} stopOpacity={opacity} />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#welcomeFade)" />
            </Svg>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 22, gap: 10 }}>
            <Logo />
            <Text variant="display" tone="onHero">
              {t('auth.welcome.title')}
            </Text>
            <Text variant="h2" tone="onHero">
              {t('auth.welcome.tagline')}
            </Text>
            <Text tone="heroMuted">{t('auth.welcome.pitch')}</Text>
          </View>
        </View>
        <View style={{ padding: 24, paddingBottom: 24 + insets.bottom, gap: 12, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          {isFirebaseConfigured ? (
            <>
              <Button full label={t('auth.welcome.signup')} onPress={() => router.push('/sign-up')} />
              <Button full variant="secondary" label={t('auth.welcome.signin')} onPress={() => router.push('/sign-in')} />
            </>
          ) : (
            <Button full label={t('fp.localOnly')} loading={busy === 'local'} onPress={() => start('local')} />
          )}
          {/* Options secondaires : démonstration (données fictives) et usage sans compte en ligne. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
            {/* 320 dp : le libellé passe à la ligne au lieu de dépasser du panneau. */}
            <Button small variant="ghost" icon="flask-outline" label={t('fp.demo')} loading={busy === 'demo'} onPress={() => start('demo')} style={{ maxWidth: '100%' }} />
            {isFirebaseConfigured ? <Button small variant="ghost" icon="phone-portrait-outline" label={t('fp.localOnly')} loading={busy === 'local'} onPress={() => start('local')} style={{ maxWidth: '100%' }} /> : null}
          </View>
          <Text variant="caption" tone="subtle" align="center">
            {t('auth.welcome.disclaimer')}
          </Text>
          <Text variant="caption" tone="subtle" align="center" numeric>
            {env.buildLabel}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
