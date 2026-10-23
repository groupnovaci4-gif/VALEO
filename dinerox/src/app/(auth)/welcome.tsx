import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignV2, useTheme } from '@/theme';
import { heroFloat } from '@/components/ui/heroFloat';
import { useI18n } from '@/i18n';
import { Button, Text } from '@/components/ui';
import { PHOTO_SOURCES } from '@/components/ui/photoSources';
import { Logo } from '@/components/Logo';
import { useApp } from '@/store/app';
import { env, isFirebaseConfigured } from '@/config/env';
import { lastPhone } from '@/services/phoneAuth';

/**
 * Bienvenue (connexion par téléphone, maquette 1 ; textes validés, slogan du fondateur §5bis.4) :
 * carte verte flottante (logo, slogan, phrase), puis « Continuer avec mon numéro »,
 * « J'ai un compte e-mail » (connexion e-mail et Google inchangées ; inscription e-mail depuis
 * « Pas encore de compte ? »), la démonstration et l'usage sans compte, la mention « {app} ne
 * détient pas votre argent ». La photo validée reste en fond de la carte, sous un voile vert uni.
 */
export default function Welcome() {
  return (
    <DesignV2>
      <WelcomeScreen />
    </DesignV2>
  );
}

function WelcomeScreen() {
  const { colors, dark } = useTheme();
  const { t } = useI18n();
  const { enterLocalMode } = useApp();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'demo' | 'local' | null>(null);
  // Un numéro déjà utilisé sur ce téléphone : « Continuer avec mon numéro » ouvre « Bon retour ! ».
  const [known, setKnown] = useState(false);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let alive = true;
    void lastPhone()
      .then((p) => alive && setKnown(!!p?.e164))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const start = (kind: 'demo' | 'local') => {
    setBusy(kind);
    void enterLocalMode({ demo: kind === 'demo' }).finally(() => setBusy(null));
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Petit écran (320 × 568) ou texte agrandi : l'ensemble défile au lieu d'être coupé. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24, gap: 12 }} bounces={false}>
        <View style={{ ...heroFloat(dark), overflow: 'hidden', backgroundColor: colors.hero, minHeight: 240, justifyContent: 'flex-end' }}>
          {/* Photo validée, décorative (styles fixes — règle 13), sous un voile vert uni (aucun dégradé). */}
          <View style={StyleSheet.absoluteFill} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={PHOTO_SOURCES.welcome} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.hero, opacity: 0.86 }]} />
          </View>
          <View style={{ padding: 22, gap: 10 }}>
            <Logo size={56} />
            <Text variant="titleL" tone="onHero" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32 }}>
              {t('phone.welcome.title')}
            </Text>
            <Text tone="heroMuted">{t('phone.welcome.pitch')}</Text>
          </View>
        </View>
        <View style={{ flexGrow: 1, minHeight: 24 }} />
        {isFirebaseConfigured ? (
          <>
            <Button full icon="phone-portrait-outline" label={t('phone.welcome.continue')} onPress={() => router.push(known ? '/phone?start=signin' : '/phone')} />
            <Button full variant="outline" icon="mail-outline" label={t('phone.welcome.email')} onPress={() => router.push('/sign-in')} />
          </>
        ) : (
          <Button full label={t('fp.localOnly')} loading={busy === 'local'} onPress={() => start('local')} />
        )}
        {/* Options secondaires : démonstration (données fictives) et usage sans compte en ligne. */}
        <View style={{ alignItems: 'center' }}>
          <Button small variant="ghost" icon="flask-outline" label={t('fp.demo')} loading={busy === 'demo'} onPress={() => start('demo')} style={{ maxWidth: '100%' }} />
          {isFirebaseConfigured ? <Button small variant="ghost" icon="phone-portrait-outline" label={t('fp.localOnly')} loading={busy === 'local'} onPress={() => start('local')} style={{ maxWidth: '100%' }} /> : null}
        </View>
        <Text variant="caption" tone="subtle" align="center">
          {t('phone.welcome.disclaimer')}
        </Text>
        <Text variant="caption" tone="subtle" align="center" numeric>
          {env.buildLabel}
        </Text>
      </ScrollView>
    </View>
  );
}
