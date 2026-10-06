import React, { useEffect } from 'react';
import { Stack, router, useSegments, SplashScreen, type ErrorBoundaryProps, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { FONT_ASSETS } from '@/theme/fonts';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppProvider, useApp } from '@/store/app';
import { ThemeProvider, useTheme } from '@/theme';
import { I18nProvider, deviceLanguage, useI18n } from '@/i18n';
import { ToastProvider, Button, Text } from '@/components/ui';
import { LockGate } from '@/components/LockGate';
import { Bootstrap } from '@/components/Bootstrap';
import { CoachHost } from '@/features/coach/CoachHost';
import { listenNotificationTaps } from '@/services/notifications';
import { installWebAlert } from '@/services/webAlert';

installWebAlert();

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Polices de la charte ; en cas d'échec de chargement, on continue avec les polices système.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Gestion du clavier commune iOS/Android (affichage bord à bord). */}
        <KeyboardProvider>
          <AppProvider>
            <Providers>
              <Navigator />
            </Providers>
          </AppProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Thème et langue suivent les préférences du profil. */
function Providers({ children }: { children: React.ReactNode }) {
  const { profile } = useApp();
  return (
    <ThemeProvider preference={profile?.preferences.theme ?? 'light'}>
      <I18nProvider lang={profile?.language ?? deviceLanguage()}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function Navigator() {
  const { status } = useApp();
  const { colors, dark } = useTheme();
  const segments = useSegments();
  // Chaîne stable : l'effet ne se relance que si la route change réellement.
  const route = segments.join('/');

  // Routage selon la session : accueil (déconnecté) → application (connecté).
  // Le profil financier à compléter est proposé par la navigation à onglets ;
  // ce routage n'attend jamais le profil (aucun blocage si le réseau tarde).
  useEffect(() => {
    if (status === 'loading') return;
    void SplashScreen.hideAsync().catch(() => undefined);
    const first = route.split('/')[0];
    const inAuth = first === '(auth)';
    const inLegal = first === 'legal';
    if (status === 'signedOut') {
      if (!inAuth && !inLegal) router.replace('/welcome');
      return;
    }
    if (inAuth) router.replace('/');
  }, [status, route]);

  // Notification touchée : ouverture de l'écran concerné (session ouverte uniquement).
  useEffect(() => {
    if (status !== 'signedIn') return;
    return listenNotificationTaps((url) => router.push(url as Href));
  }, [status]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <LockGate>
        <Bootstrap />
        <CoachHost />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="transaction/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="goals/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </LockGate>
    </View>
  );
}

/** Erreur d'écran : message humain, données préservées, possibilité de réessayer. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <ErrorView retry={retry} />;
}

function ErrorView({ retry }: { retry: () => Promise<void> }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 44 }}>🛠️</Text>
      <Text variant="h3" align="center">
        {t('error.boundary.title')}
      </Text>
      <Text tone="muted" align="center">
        {t('error.boundary.body')}
      </Text>
      <Button label={t('common.retry')} onPress={() => void retry()} />
      <Button variant="ghost" label={t('common.back')} onPress={() => router.replace('/')} />
    </View>
  );
}
