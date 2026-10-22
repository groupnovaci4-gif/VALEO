import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text as RNText, View, useWindowDimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs, router, useIsFocused } from "expo-router";
import { useApp } from "@/store/app";
import { useTheme } from "@/theme";
import { fontFor } from "@/theme/fonts";
import { TAB_CAP, tabBarColors, tabBarHeight, tabLabelScale, tabLayout } from "@/theme/layout";
import { useI18n } from "@/i18n";
import { Icon, InTabsContext, useToastAboveTabBar } from "@/components/ui";
import { useEntry } from "@/features/entry/EntryProvider";
import { entryPrefs } from "@/core/entry/prefs";

/**
 * Navigation principale : Accueil · Budget · 🎤 · Objectifs · Plus.
 * Le micro central ouvre la saisie (voix ; appui long : clavier) depuis chaque
 * onglet. L'Historique (/transactions) et l'assistant (/assistant) sont des
 * écrans à part entière, ouverts depuis l'accueil, « Plus » et le micro.
 */
export default function TabsLayout() {
  const { dark } = useTheme();
  const bar = tabBarColors(dark);
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
  const barHeight = tabBarHeight(labelScale, fontScale, insets.bottom);
  // Onglets affichés : les messages (toasts) passent au-dessus du micro central.
  const toastAbove = useToastAboveTabBar();
  const focused = useIsFocused();
  useEffect(() => (focused ? toastAbove(barHeight) : undefined), [focused, toastAbove, barHeight]);
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
    // Sous les onglets, la barre absorbe déjà la marge basse du système : les écrans ne l'ajoutent pas.
    <InTabsContext.Provider value={true}>
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
            tabBarActiveTintColor: bar.active,
            tabBarItemStyle: { paddingTop: 6, paddingHorizontal: 2 },
            tabBarInactiveTintColor: bar.inactive,
            tabBarStyle: {
              backgroundColor: bar.background,
              borderTopColor: bar.border,
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
    </InTabsContext.Provider>
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
 * Bouton central « Saisir » (refonte finale J4, maquette `.tab .mic`) : pilule de la couleur de
 * la marque (#0F4A3A en clair, #4FB08F en sombre ; 48 × 36, rayon 18) posée DANS la barre, micro 22
 * (blanc en clair, foncé en sombre), libellé « Saisir » dessous (jamais une icône seule). Un appui
 * = voix, un appui long = clavier (inchangé) ; zone de toucher d'au moins 48 dp.
 */
function MicTabButton({ scale }: { scale: number }) {
  const { dark } = useTheme();
  const bar = tabBarColors(dark);
  const { t } = useI18n();
  const entry = useEntry();
  const { profile } = useApp();
  // Méthode par défaut (réglages) : voix, ou saisie au clavier ; l'appui long ouvre l'autre.
  const keyboardFirst = entryPrefs(profile?.preferences).defaultMethod === 'quick_manual';
  return (
    <View style={{ flex: 1, alignItems: "center", paddingTop: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={keyboardFirst ? t("entry.mic.labelKeyboard") : t("entry.mic.label")}
        accessibilityHint={keyboardFirst ? t("entry.mic.hintVoice") : t("entry.mic.hint")}
        onPress={() => entry.open(keyboardFirst ? "keyboard" : "voice")}
        onLongPress={() => entry.open(keyboardFirst ? "voice" : "keyboard")}
        delayLongPress={350}
        style={{ alignItems: "center", minWidth: 48, minHeight: 48 }}
      >
        {({ pressed }) => (
          <>
            <View style={{ width: 48, height: 36, borderRadius: 18, backgroundColor: bar.pill, opacity: pressed ? 0.85 : 1, alignItems: "center", justifyContent: "center" }}>
              <Icon name="mic" size={22} color={bar.mic} />
            </View>
            <TabLabel text={t("entry.mic")} color={bar.inactive} focused={false} scale={scale} />
          </>
        )}
      </Pressable>
    </View>
  );
}
