import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text as RNText, View, useWindowDimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs, router } from "expo-router";
import { useApp } from "@/store/app";
import { useTheme } from "@/theme";
import { fontFor } from "@/theme/fonts";
import { TAB_CAP, tabLabelScale, tabLayout } from "@/theme/layout";
import { useI18n } from "@/i18n";
import { Icon } from "@/components/ui";
import { useEntry } from "@/features/entry/EntryProvider";
import { entryPrefs } from "@/core/entry/prefs";

/**
 * Navigation principale : Accueil · Budget · 🎤 · Objectifs · Plus.
 * Le micro central ouvre la saisie (voix ; appui long : clavier) depuis chaque
 * onglet. L'Historique (/transactions) et l'assistant (/assistant) sont des
 * écrans à part entière, ouverts depuis l'accueil, « Plus » et le micro.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { profile, activeSpace } = useApp();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  // Libellés dans l'ordre de la barre (le bouton central porte « Saisir »).
  const labels = [t("tab.home"), t("tab.budget"), t("entry.mic"), t("tab.goals"), t("tab.more")];
  const minWidths = [24, 24, 56, 24, 24];
  // Largeur réelle de chaque libellé (police, langue et taille de texte de l'appareil),
  // mesurée hors écran ; avant la mesure : emplacements égaux et taille estimée.
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const onMeasure = useCallback((label: string, w: number) => setMeasured((m) => (m[label] === w ? m : { ...m, [label]: w })), []);
  const ready = labels.every((l) => measured[l] !== undefined);
  const layout = ready ? tabLayout(labels.map((l) => measured[l]), minWidths, width) : null;
  const labelScale = layout ? layout.scale : tabLabelScale(width, fontScale);
  const flexOf = (i: number) => (layout ? layout.weights[i] : 1);
  // Hauteur suivant le libellé agrandi (sinon il serait coupé) : icône 24 + libellé + marges.
  const labelLine = 16 * labelScale * Math.min(Math.max(fontScale, 1), TAB_CAP);
  const barHeight = Math.round(46 + labelLine) + insets.bottom;
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
  // Emplacements de largeur proportionnelle à leur libellé (« Objectifs » est plus long
  // que « Plus ») : c'est ce qui permet de tenir à 160 % sur 320 dp. `flex` (et non une
  // largeur) : la barre le recopie sur le bouton, qui garde ainsi toute la hauteur.
  const item = (flex: number) => ({ paddingTop: 6, paddingHorizontal: 2, flex });
  return (
    <View style={{ flex: 1 }}>
      {/* Mesure hors écran des libellés (invisible, ignorée par le lecteur d'écran). */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: 0, left: 0, opacity: 0, alignItems: "flex-start" }}>
        {labels.map((l) => (
          <RNText
            key={l}
            numberOfLines={1}
            maxFontSizeMultiplier={TAB_CAP}
            onLayout={(e) => onMeasure(l, Math.ceil(e.nativeEvent.layout.width))}
            style={{ fontSize: 12, lineHeight: 16, fontFamily: fontFor("body", 700) }}
          >
            {l}
          </RNText>
        ))}
      </View>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarItemStyle: { paddingTop: 6, paddingHorizontal: 2 },
          tabBarInactiveTintColor: colors.textSubtle,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            height: barHeight,
          },
          // Libellé : texte système suivi jusqu'à 160 %, jamais tronqué en silence.
          tabBarLabel: ({ focused, color, children }) => (
            <TabLabel text={String(children)} color={String(color)} focused={focused} scale={labelScale} />
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("tab.home"), tabBarIcon: icon("home"), tabBarItemStyle: item(flexOf(0)) }}
        />
        <Tabs.Screen
          name="budget"
          options={{ title: t("tab.budget"), tabBarIcon: icon("pie-chart"), tabBarItemStyle: item(flexOf(1)) }}
        />
        <Tabs.Screen
          name="mic"
          options={{
            title: t("entry.mic"),
            tabBarItemStyle: item(flexOf(2)),
            tabBarButton: () => <MicTabButton scale={labelScale} />,
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="goals"
          options={{ title: t("tab.goals"), tabBarIcon: icon("flag"), tabBarItemStyle: item(flexOf(3)) }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: t("tab.more"), tabBarIcon: icon("grid"), tabBarItemStyle: item(flexOf(4)) }}
        />
      </Tabs>
    </View>
  );
}

function TabLabel({ text, color, focused, scale }: { text: string; color: string; focused: boolean; scale: number }) {
  return (
    <RNText
      numberOfLines={1}
      maxFontSizeMultiplier={TAB_CAP}
      style={{ fontSize: 12 * scale, lineHeight: 16 * scale, fontFamily: fontFor("body", focused ? 700 : 600), color, marginTop: 2 }}
    >
      {text}
    </RNText>
  );
}

/**
 * Gros bouton central surélevé : un appui = voix, un appui long = clavier.
 * Libellé « Saisir » écrit dessous (jamais une icône seule).
 */
function MicTabButton({ scale }: { scale: number }) {
  const { colors, shadow } = useTheme();
  const { t } = useI18n();
  const entry = useEntry();
  const { profile } = useApp();
  // Méthode par défaut (réglages) : voix, ou saisie au clavier ; l'appui long ouvre l'autre.
  const keyboardFirst = entryPrefs(profile?.preferences).defaultMethod === 'quick_manual';
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={keyboardFirst ? t("entry.mic.labelKeyboard") : t("entry.mic.label")}
        accessibilityHint={keyboardFirst ? t("entry.mic.hintVoice") : t("entry.mic.hint")}
        onPress={() => entry.open(keyboardFirst ? "keyboard" : "voice")}
        onLongPress={() => entry.open(keyboardFirst ? "voice" : "keyboard")}
        delayLongPress={350}
        style={{ alignItems: "center" }}
      >
        {({ pressed }) => (
          <>
            <View
              style={{
                width: 56,
                height: 56,
                marginTop: -23,
                borderRadius: 28,
                borderWidth: 4,
                borderColor: colors.tabBar,
                backgroundColor: pressed ? colors.primaryDark : colors.primary,
                alignItems: "center",
                justifyContent: "center",
                // Ombre neutre (plus de halo coloré).
                ...shadow.raised,
              }}
            >
              <Icon name="mic" size={28} color={colors.onPrimary} />
            </View>
            <TabLabel text={t("entry.mic")} color={colors.text} focused scale={scale} />
          </>
        )}
      </Pressable>
    </View>
  );
}
