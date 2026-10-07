import React, { useEffect } from "react";
import { Pressable, View, type ColorValue } from "react-native";
import { Tabs, router } from "expo-router";
import { useApp } from "@/store/app";
import { useTheme } from "@/theme";
import { fontFor } from "@/theme/fonts";
import { brand } from "@/config/brand";
import { useI18n } from "@/i18n";
import { Icon } from "@/components/ui";
import { useEntry } from "@/features/entry/EntryProvider";

/**
 * Navigation principale : Accueil · Budget · 🎤 · Objectifs · Plus.
 * Le micro central ouvre la saisie (voix ; appui long : clavier) depuis chaque
 * onglet. L'Historique (/transactions) et l'assistant (/assistant) sont des
 * écrans à part entière, ouverts depuis l'accueil, « Plus » et le micro.
 */
export default function TabsLayout() {
  const { colors, dark } = useTheme();
  const { t } = useI18n();
  const { profile, activeSpace } = useApp();
  // Profil financier pas encore créé : on le propose (chaque étape peut être passée).
  const needsProfile =
    !!profile &&
    !profile.onboarding.completed &&
    !activeSpace?.id.startsWith("demo_");
  useEffect(() => {
    if (needsProfile) router.replace("/onboarding");
  }, [needsProfile]);
  const icon = (name: string) =>
    function TabIcon({
      color,
      focused,
    }: {
      color: ColorValue;
      focused: boolean;
    }) {
      return (
        <Icon
          name={focused ? name : `${name}-outline`}
          size={24}
          color={String(color)}
        />
      );
    };
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: dark ? brand.colors.green : colors.primary,
          tabBarItemStyle: { paddingTop: 4 },
          tabBarInactiveTintColor: colors.textSubtle,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            minHeight: 60,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: fontFor("body", 600),
            letterSpacing: -0.2,
          },
          tabBarAllowFontScaling: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("tab.home"), tabBarIcon: icon("home") }}
        />
        <Tabs.Screen
          name="budget"
          options={{ title: t("tab.budget"), tabBarIcon: icon("pie-chart") }}
        />
        <Tabs.Screen
          name="mic"
          options={{
            title: t("entry.mic"),
            tabBarButton: () => <MicTabButton />,
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="goals"
          options={{ title: t("tab.goals"), tabBarIcon: icon("flag") }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: t("tab.more"), tabBarIcon: icon("sparkles") }}
        />
      </Tabs>
    </View>
  );
}

/** Gros bouton central surélevé : un appui = voix, un appui long = clavier. */
function MicTabButton() {
  const { colors, shadow } = useTheme();
  const { t } = useI18n();
  const entry = useEntry();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("entry.mic.label")}
        accessibilityHint={t("entry.mic.hint")}
        onPress={() => entry.open("voice")}
        onLongPress={() => entry.open("keyboard")}
        delayLongPress={350}
        style={({ pressed }) => ({
          width: 62,
          height: 62,
          marginTop: -20,
          borderRadius: 31,
          borderWidth: 4,
          borderColor: colors.tabBar,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          ...shadow.fab,
        })}
      >
        <Icon name="mic" size={28} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}
