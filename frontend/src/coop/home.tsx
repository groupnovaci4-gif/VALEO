// VALEO — Accueil : grille de raccourcis (petites icônes) + bandeau partenaires défilant.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";

import { C } from "./lib";
import { Icon } from "./Icon";

export type QuickAction = { icon: string; label: string; color: string; onPress: () => void; badge?: number };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (!actions.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
      {actions.map((a, i) => (
        <Pressable key={a.label + i} onPress={a.onPress} testID={`quick-${a.label}`} style={{ width: "25%", alignItems: "center", marginBottom: 16 }}>
          <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: a.color + "1A", alignItems: "center", justifyContent: "center" }}>
            <Icon name={a.icon} size={23} color={a.color} />
            {a.badge && a.badge > 0 ? (
              <View style={{ position: "absolute", top: -5, right: -6, backgroundColor: C.loss, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.bg }}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{a.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, color: C.ink, marginTop: 6, fontWeight: "600", textAlign: "center" }}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------- Bandeau partenaires ----------------------------- */
export const PARTNERS: { sigle: string; nom: string; color: string }[] = [
  { sigle: "CCC", nom: "Conseil du Café-Cacao", color: C.cocoa },
  { sigle: "MINADER", nom: "Ministère de l'Agriculture", color: C.green },
  { sigle: "CNRA", nom: "Recherche Agronomique", color: C.teal },
  { sigle: "ANADER", nom: "Appui au Développement Rural", color: C.gold },
  { sigle: "FIRCA", nom: "Fonds Interprofessionnel", color: C.rust },
];

const PartnerChip = ({ p }: { p: { sigle: string; nom: string; color: string } }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, marginRight: 12 }}>
    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: p.color + "1A", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 12, fontWeight: "800", color: p.color }}>{p.sigle.slice(0, 3)}</Text>
    </View>
    <View>
      <Text style={{ fontSize: 12.5, fontWeight: "800", color: C.ink }}>{p.sigle}</Text>
      <Text style={{ fontSize: 10.5, color: C.muted }}>{p.nom}</Text>
    </View>
  </View>
);

export function PartnersBanner() {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (w <= 0) return;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, { toValue: -w, duration: Math.max(6000, w * 22), useNativeDriver: Platform.OS !== "web", easing: Easing.linear }),
    );
    anim.start();
    return () => anim.stop();
  }, [w, x]);

  const Set = ({ onLayout }: { onLayout?: (e: any) => void }) => (
    <View style={{ flexDirection: "row" }} onLayout={onLayout}>
      {PARTNERS.map((p, i) => <PartnerChip key={p.sigle + i} p={p} />)}
    </View>
  );

  return (
    <View style={{ marginTop: 8, marginBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Icon name="award" size={15} color={C.teal} />
        <Text style={{ fontSize: 12, fontWeight: "800", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>En partenariat avec</Text>
      </View>
      <View style={{ overflow: "hidden" }}>
        <Animated.View style={{ flexDirection: "row", transform: [{ translateX: x }] }}>
          <Set onLayout={(e) => setW(e.nativeEvent.layout.width)} />
          <Set />
        </Animated.View>
      </View>
    </View>
  );
}
