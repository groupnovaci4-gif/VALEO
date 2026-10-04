import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Text } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useApp } from '@/store/app';
import { isFirebaseConfigured } from '@/config/env';

export default function Welcome() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { enterLocalMode } = useApp();
  const [busy, setBusy] = useState(false);
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
        ) : null}
        <Button
          full
          variant={isFirebaseConfigured ? 'ghost' : 'primary'}
          label={t('auth.welcome.localMode')}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void enterLocalMode().finally(() => setBusy(false));
          }}
        />
        <Text variant="caption" tone="subtle" align="center">
          {t('auth.welcome.disclaimer')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
