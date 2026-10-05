import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Text } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useApp } from '@/store/app';
import { env, isFirebaseConfigured } from '@/config/env';

export default function Welcome() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { enterLocalMode } = useApp();
  const [busy, setBusy] = useState<'demo' | 'local' | null>(null);
  const start = (kind: 'demo' | 'local') => {
    setBusy(kind);
    void enterLocalMode({ demo: kind === 'demo' }).finally(() => setBusy(null));
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.hero }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 18 }}>
        <Logo size={96} />
        <Text variant="display" tone="onHero">
          {t('auth.welcome.title')}
        </Text>
        <Text variant="h2" tone="onHero">
          {t('auth.welcome.tagline')}
        </Text>
        <Text tone="heroMuted">{t('auth.welcome.pitch')}</Text>
      </View>
      <View style={{ padding: 24, gap: 12, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
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
          <Button small variant="ghost" icon="flask-outline" label={t('fp.demo')} loading={busy === 'demo'} onPress={() => start('demo')} />
          {isFirebaseConfigured ? <Button small variant="ghost" icon="phone-portrait-outline" label={t('fp.localOnly')} loading={busy === 'local'} onPress={() => start('local')} /> : null}
        </View>
        <Text variant="caption" tone="subtle" align="center">
          {t('auth.welcome.disclaimer')}
        </Text>
        <Text variant="caption" tone="subtle" align="center" numeric>
          {env.buildLabel}
        </Text>
      </View>
    </SafeAreaView>
  );
}
