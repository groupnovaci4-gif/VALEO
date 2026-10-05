import React from 'react';
import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/theme';
import { fontFor } from '@/theme/fonts';
import { brand } from '@/config/brand';
import { useI18n } from '@/i18n';
import { Icon } from '@/components/ui';
import { QuickAddFab, QuickAddProvider } from '@/features/QuickAdd';

/**
 * Navigation principale : Accueil · Opérations · Budget · Objectifs · Plus.
 * L'assistant reste accessible depuis la carte « IA » de l'accueil et le bouton +.
 * La saisie rapide (« + ») flotte au-dessus, accessible depuis chaque onglet.
 */
export default function TabsLayout() {
  const { colors, dark } = useTheme();
  const { t } = useI18n();
  const icon = (name: string) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Icon name={focused ? name : `${name}-outline`} size={24} color={String(color)} />;
    };
  return (
    <QuickAddProvider>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: dark ? brand.colors.green : colors.primary,
            tabBarItemStyle: { paddingTop: 4 },
            tabBarInactiveTintColor: colors.textSubtle,
            tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, minHeight: 60 },
            tabBarLabelStyle: { fontSize: 10, fontFamily: fontFor('body', 600), letterSpacing: -0.2 },
            tabBarAllowFontScaling: false,
          }}
        >
          <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon('home') }} />
          <Tabs.Screen name="transactions" options={{ title: t('tab.transactions'), tabBarIcon: icon('swap-vertical') }} />
          <Tabs.Screen name="budget" options={{ title: t('tab.budget'), tabBarIcon: icon('pie-chart') }} />
          <Tabs.Screen name="goals" options={{ title: t('tab.goals'), tabBarIcon: icon('flag') }} />
          <Tabs.Screen name="assistant" options={{ title: t('tab.assistant'), href: null }} />
          <Tabs.Screen name="more" options={{ title: t('tab.more'), tabBarIcon: icon('sparkles') }} />
        </Tabs>
        <QuickAddFab />
      </View>
    </QuickAddProvider>
  );
}
