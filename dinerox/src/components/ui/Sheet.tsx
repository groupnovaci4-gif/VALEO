import React, { useEffect } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, View } from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Text } from "./Text";
import { IconButton } from "./Button";
import { useI18n } from "@/i18n";

/**
 * Feuille modale du bas (saisie rapide, choix, confirmations).
 * Clavier : la modale est une fenêtre Android distincte, affichée bord à bord ;
 * sans gestion explicite (l'ancien `behavior` n'agissait que sur iOS), le
 * clavier recouvrait les champs de la feuille. La feuille remonte au-dessus du
 * clavier et son contenu défile jusqu'au champ actif, sur les deux plateformes.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  inline,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /**
   * Superposition dans la fenêtre de l'application (sans fenêtre modale Android
   * séparée). Pour les menus qui ouvrent un autre écran : la fenêtre modale
   * garderait le focus pendant sa fermeture et le champ de l'écran suivant ne
   * pourrait pas ouvrir le clavier. À réserver aux feuilles SANS champ de saisie.
   */
  inline?: boolean;
}) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  // Bouton retour Android : ferme la superposition (la modale le gère elle-même).
  useEffect(() => {
    if (!inline || !visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [inline, visible, onClose]);
  const panel = (scroll: React.ReactNode) => (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingBottom: insets.bottom + 12,
        maxHeight: "90%",
      }}
    >
      <View style={{ alignItems: "center", paddingTop: 8 }}>
        <View
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
          }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 20,
          paddingRight: 8,
        }}
      >
        <Text variant="h3" style={{ flex: 1 }} accessibilityRole="header">
          {title ?? ""}
        </Text>
        <IconButton icon="close" label={t("common.close")} onPress={onClose} />
      </View>
      {scroll}
    </View>
  );
  const backdrop = (
    <Pressable
      accessibilityLabel={t("common.close")}
      onPress={onClose}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
    />
  );
  if (inline) {
    if (!visible) return null;
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { justifyContent: "flex-end", zIndex: 10 },
        ]}
        accessibilityViewIsModal
      >
        {backdrop}
        {panel(
          <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            {children}
          </View>,
        )}
      </View>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        {backdrop}
        {panel(
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            bottomOffset={24}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
          >
            {children}
          </KeyboardAwareScrollView>,
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
