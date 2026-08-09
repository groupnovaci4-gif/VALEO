import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, CROPS, Culture, Loan, STATUS, crop, fDate, fF, op } from "./lib";
import { Icon } from "./Icon";

/* ------------------------------ Card / text ------------------------------ */
export const Card = ({ children, style }: { children?: React.ReactNode; style?: ViewStyle | ViewStyle[] }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const SectionTitle = ({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) => (
  <Text style={[styles.sectionTitle, noMargin ? { marginBottom: 0 } : null]}>{children}</Text>
);

export const Empty = ({ text }: { text: string }) => (
  <View style={[styles.card, { padding: 20 }]}>
    <Text style={{ textAlign: "center", color: C.muted, fontSize: 13.5, lineHeight: 20 }}>{text}</Text>
  </View>
);

export const MiniKpi = ({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint: string }) => (
  <View style={[styles.card, { flex: 1, padding: 13 }]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {icon}
      <Text style={{ fontSize: 12, color: C.muted }}>{label}</Text>
    </View>
    <Text style={{ fontSize: 18, fontWeight: "800", marginTop: 3, color: tint }}>{value}</Text>
  </View>
);

export const StatCell = ({ label, value, color, strong }: { label: string; value: string; color: string; strong?: boolean }) => (
  <View style={{ flex: 1, backgroundColor: "#FAF6EF", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6 }}>
    <Text style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>{label}</Text>
    <Text style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? "800" : "700", color, marginTop: 2, textAlign: "center" }}>{value}</Text>
  </View>
);

export const Row = ({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
    <Text style={{ fontSize: strong ? 14 : 12.5, color: strong ? C.ink : C.muted, fontWeight: strong ? "700" : "400", flexShrink: 1 }}>{label}</Text>
    <Text style={{ fontWeight: "800", fontSize: strong ? 18 : 14, color: color || C.ink }}>{value}</Text>
  </View>
);

export const InfoLine = ({ label, value }: { label: string; value?: string }) => (
  <View>
    <Text style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
    <Text style={{ fontWeight: "600", fontSize: 13, marginTop: 1 }}>{value || "—"}</Text>
  </View>
);

export const CodeChip = ({ code }: { code?: string }) => (
  <View style={{ backgroundColor: "#EAF3EF", borderRadius: 6, paddingVertical: 3, paddingHorizontal: 9, alignSelf: "flex-start" }}>
    <Text style={{ color: C.teal, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>{code || "—"}</Text>
  </View>
);

/* ------------------------------- Buttons --------------------------------- */
export const SaveBtn = ({
  disabled,
  onPress,
  children,
  color = C.cocoa,
  icon,
  style,
}: {
  disabled?: boolean;
  onPress: () => void | Promise<void>;
  children: React.ReactNode;
  color?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) => {
  const [busy, setBusy] = useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);
  const handle = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await Promise.resolve(onPress());
    } catch (e) {
      console.log("SaveBtn onPress error", e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={handle}
      style={[styles.saveBtn, { backgroundColor: disabled ? "#D5CEC3" : color, opacity: busy ? 0.85 : 1 }, style]}
      testID="save-btn"
    >
      {busy ? <ActivityIndicator color="#fff" size="small" /> : icon}
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{busy ? "Veuillez patienter…" : children}</Text>
    </Pressable>
  );
};

export const GhostBtn = ({ onPress, children, color = C.cocoa, style, testID }: { onPress: () => void; children: React.ReactNode; color?: string; style?: ViewStyle; testID?: string }) => (
  <Pressable onPress={onPress} style={[styles.ghostBtn, style]} testID={testID}>
    <Text style={{ color, fontSize: 13, fontWeight: "600" }}>{children}</Text>
  </Pressable>
);

export const Toggle = ({ active, onPress, color, children }: { active: boolean; onPress: () => void; color: string; children: React.ReactNode }) => (
  <Pressable
    onPress={onPress}
    style={[styles.toggle, { borderColor: active ? color : C.line, backgroundColor: active ? "#fff" : "#F4EFE7" }]}
  >
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ fontWeight: "700", fontSize: 13.5, color: active ? color : C.muted }}>{children}</Text>
    </View>
  </Pressable>
);

/* ------------------------------- Form bits ------------------------------- */
export const Field = ({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) => (
  <View style={{ marginBottom: 14, flex: flex ? 1 : undefined }}>
    <Text style={{ fontSize: 12.5, fontWeight: "600", color: C.ink, marginBottom: 6 }}>{label}</Text>
    {children}
  </View>
);

export const TInput = (props: React.ComponentProps<typeof TextInput>) => (
  <TextInput placeholderTextColor={C.muted} {...props} style={[styles.input, props.style]} />
);

export const DeductRow = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
    <Text style={{ flex: 1, fontSize: 13, color: C.ink }}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, ""))}
      keyboardType="number-pad"
      placeholder="0"
      placeholderTextColor={C.muted}
      style={[styles.input, { width: 120, textAlign: "right", paddingVertical: 9, paddingHorizontal: 11 }]}
    />
  </View>
);

export const Chip = ({ label, active, onPress, emoji }: { label: string; active: boolean; onPress: () => void; emoji?: string }) => (
  <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipOn : null]}>
    <Text style={{ fontSize: 12.5, fontWeight: "600", color: active ? C.cocoa : C.ink }}>{emoji ? `${emoji} ` : ""}{label}</Text>
  </Pressable>
);

export function CulturesPicker({ value, onChange }: { value: Culture[]; onChange: (v: Culture[]) => void }) {
  const has = (id: string) => value.find((c) => c.cropId === id);
  const toggle = (id: string) => (has(id) ? onChange(value.filter((c) => c.cropId !== id)) : onChange([...value, { cropId: id, superficie: 0 }]));
  const setSup = (id: string, s: string) => onChange(value.map((c) => (c.cropId === id ? { ...c, superficie: Number(s) || 0 } : c)));
  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {CROPS.map((cr) => <Chip key={cr.id} label={cr.nom} emoji={cr.emoji} active={!!has(cr.id)} onPress={() => toggle(cr.id)} />)}
      </View>
      {value.map((c) => (
        <View key={c.cropId} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, backgroundColor: "#FAF6EF", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600" }}>{crop(c.cropId).emoji} {crop(c.cropId).nom}</Text>
          <Text style={{ fontSize: 12, color: C.muted }}>Superficie</Text>
          <TextInput
            value={c.superficie ? String(c.superficie) : ""}
            onChangeText={(t) => setSup(c.cropId, t.replace(",", "."))}
            keyboardType="decimal-pad"
            placeholder="ha"
            placeholderTextColor={C.muted}
            style={[styles.input, { width: 90, textAlign: "right", paddingVertical: 8, paddingHorizontal: 10 }]}
          />
        </View>
      ))}
    </View>
  );
}

/* ------------------------------ Loan bits -------------------------------- */
export const LoanTypeChip = ({ type }: { type: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: type === "intrant" ? "#EDF5F0" : "#FBF3E3", paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8 }}>
    <Icon name={type === "intrant" ? "package" : "banknote"} size={12} color={type === "intrant" ? C.green : C.gold} />
    <Text style={{ color: type === "intrant" ? C.green : C.gold, fontSize: 11.5, fontWeight: "700" }}>{type === "intrant" ? "Intrant" : "Argent"}</Text>
  </View>
);

export const MomoBadge = ({ operator }: { operator: string }) => {
  const o = op(operator);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: o.color, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8 }}>
      <Icon name="smartphone" size={12} color={o.ink} />
      <Text style={{ color: o.ink, fontSize: 11, fontWeight: "700" }}>{o.short}</Text>
    </View>
  );
};

export const LoanRow = ({ loan, name }: { loan: Loan; name?: string }) => {
  const st = STATUS[loan.status];
  return (
    <View style={[styles.card, { padding: 13 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <LoanTypeChip type={loan.type} />
        {name ? <Text style={{ fontSize: 13, fontWeight: "700" }}>{name}</Text> : null}
        <Text style={{ marginLeft: "auto", fontWeight: "800", fontSize: 15 }}>{fF(loan.amount)}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: C.muted, flexShrink: 1 }}>{loan.motif} · {fDate(loan.date)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: st.bg, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 }}>
          <Icon name={st.icon} size={12} color={st.color} />
          <Text style={{ color: st.color, fontSize: 11.5, fontWeight: "700" }}>{st.label}</Text>
        </View>
      </View>
      {loan.status === "approuve" && loan.soldeRestant > 0 ? (
        <View style={{ marginTop: 8, backgroundColor: "#FDF7EC", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9 }}>
          <Text style={{ fontSize: 12, color: C.due }}>Reste à rembourser : <Text style={{ fontWeight: "700" }}>{fF(loan.soldeRestant)}</Text></Text>
        </View>
      ) : null}
    </View>
  );
};

/* ------------------------------- NavBar ---------------------------------- */
export const NavBtn = ({ active, onPress, icon, label, theme, badge }: { active: boolean; onPress: () => void; icon: string; label: string; theme: string; badge?: number }) => (
  <Pressable onPress={onPress} style={{ flex: 1, alignItems: "center", gap: 3 }} testID={`nav-${label}`}>
    <View>
      <Icon name={icon} size={20} color={active ? theme : C.muted} />
      {badge && badge > 0 ? (
        <View style={styles.navBadge}>
          <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>{badge}</Text>
        </View>
      ) : null}
    </View>
    <Text style={{ fontSize: 10.5, color: active ? theme : C.muted, fontWeight: active ? "700" : "500" }}>{label}</Text>
  </Pressable>
);

/* ---------------------------- Photo avatar ------------------------------- */
export function PhotoAvatar({
  photo,
  size = 64,
  onChange,
  editable = false,
  fallbackIcon,
  fallbackColor = C.green,
}: {
  photo?: string | null;
  size?: number;
  onChange?: (url: string | null) => void;
  editable?: boolean;
  fallbackIcon?: string;
  fallbackColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const done = (res: ImagePicker.ImagePickerResult) => {
    if (!res.canceled && res.assets[0]?.base64) {
      onChange && onChange(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  };

  const fromCamera = async () => {
    setOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setNotice(perm.canAskAgain ? "Accès caméra refusé." : "settings");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    done(res);
  };

  const fromLibrary = async () => {
    setOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNotice(perm.canAskAgain ? "Accès galerie refusé." : "settings");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    done(res);
  };

  return (
    <View style={{ width: size, height: size }}>
      <Pressable
        testID="photo-avatar"
        onPress={() => editable && setOpen(true)}
        style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", borderWidth: 2, borderColor: C.line, backgroundColor: "#EDF5F0", alignItems: "center", justifyContent: "center" }}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <Icon name={fallbackIcon || "camera"} size={size * 0.34} color={fallbackColor} />
        )}
      </Pressable>
      {editable ? (
        <View style={{ position: "absolute", bottom: -2, right: -2, backgroundColor: C.green, borderRadius: size * 0.19, width: size * 0.38, height: size * 0.38, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }}>
          <Icon name="camera" size={size * 0.2} color="#fff" />
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.photoSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontWeight: "800", fontSize: 16, marginBottom: 12 }}>Photo</Text>
            <Pressable style={styles.photoOpt} onPress={fromCamera} testID="photo-camera">
              <Icon name="camera" size={20} color={C.green} />
              <Text style={{ fontSize: 15, fontWeight: "600" }}>Prendre une photo</Text>
            </Pressable>
            <Pressable style={styles.photoOpt} onPress={fromLibrary} testID="photo-library">
              <Icon name="package" size={20} color={C.teal} />
              <Text style={{ fontSize: 15, fontWeight: "600" }}>Choisir dans la galerie</Text>
            </Pressable>
            {photo ? (
              <Pressable style={styles.photoOpt} onPress={() => { setOpen(false); onChange && onChange(null); }}>
                <Icon name="trash" size={20} color={C.loss} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: C.loss }}>Retirer la photo</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!notice} transparent animationType="fade" onRequestClose={() => setNotice(null)}>
        <Pressable style={styles.overlay} onPress={() => setNotice(null)}>
          <Pressable style={[styles.photoSheet, { paddingBottom: 20 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontWeight: "700", fontSize: 15, marginBottom: 10 }}>Autorisation requise</Text>
            <Text style={{ color: C.muted, marginBottom: 16, lineHeight: 20 }}>
              {notice === "settings"
                ? "L'accès a été bloqué. Ouvrez les réglages pour l'autoriser manuellement."
                : "Autorisez l'accès pour ajouter une photo. Vous pouvez réessayer."}
            </Text>
            {notice === "settings" ? (
              <SaveBtn color={C.green} onPress={() => { setNotice(null); Linking.openSettings(); }}>Ouvrir les réglages</SaveBtn>
            ) : (
              <SaveBtn color={C.cocoa} onPress={() => setNotice(null)}>D'accord</SaveBtn>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* --------------------------------- Select -------------------------------- */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Choisir…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]} onPress={() => setOpen(true)} testID="select-trigger">
        <Text style={{ fontSize: 15, color: current ? C.ink : C.muted, flexShrink: 1 }} numberOfLines={1}>{current ? current.label : placeholder}</Text>
        <Icon name="chevron-right" size={18} color={C.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View style={[styles.sheetBox, { maxHeight: "70%", paddingBottom: 24 }]}>
            <View style={{ padding: 18, paddingBottom: 8 }}>
              <Text style={{ fontWeight: "800", fontSize: 16 }}>{placeholder}</Text>
            </View>
            <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 12 }}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: o.value === value ? "#EAF3EF" : "transparent", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  testID={`select-option-${o.value}`}
                >
                  <Text style={{ fontSize: 15, fontWeight: o.value === value ? "700" : "500", color: C.ink, flexShrink: 1 }}>{o.label}</Text>
                  {o.value === value ? <Icon name="check" size={18} color={C.teal} /> : null}
                </Pressable>
              ))}
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* --------------------------------- Sheet --------------------------------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheetBox, { maxHeight: "92%" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 }}>
            <Text style={{ fontWeight: "800", fontSize: 17 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="sheet-close">
              <Icon name="x" size={22} color={C.muted} />
            </Pressable>
          </View>
          <KeyboardAwareScrollView
            bottomOffset={20}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24 }}
          >
            {children}
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  sectionTitle: { fontSize: 12.5, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, marginHorizontal: 2, marginTop: 2 },
  saveBtn: { width: "100%", paddingVertical: 14, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, alignSelf: "flex-start" },
  toggle: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  input: { width: "100%", paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", fontSize: 15, color: C.ink },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#F3ECE2", borderColor: C.cocoa },
  navBadge: { position: "absolute", top: -6, right: -9, backgroundColor: C.loss, minWidth: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  overlay: { flex: 1, backgroundColor: "rgba(30,20,12,0.5)", justifyContent: "flex-end" },
  sheetBox: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  photoSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 4 },
  photoOpt: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
});
