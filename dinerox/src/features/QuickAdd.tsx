import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { useI18n } from "@/i18n";
import { Icon, IconCircle, Row, Sheet } from "@/components/ui";
import { useApp } from "@/store/app";
import { can } from "@/core/permissions";

const QuickAddContext = createContext<{ open: () => void }>({
  open: () => undefined,
});

/** Saisie rapide : accessible partout via le bouton central « + ». */
export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  const { role } = useApp();
  const { colors } = useTheme();
  // Le menu est une superposition dans la même fenêtre (Sheet inline) : l'écran
  // ouvert reçoit le focus et le clavier immédiatement, sans délai arbitraire.
  const go = (path: Parameters<typeof router.push>[0]) => {
    setVisible(false);
    router.push(path);
  };
  const close = useCallback(() => setVisible(false), []);
  const open = useCallback(() => setVisible(true), []);
  const ctx = useMemo(() => ({ open }), [open]);
  const items = [
    {
      key: "expense",
      icon: "arrow-up",
      color: colors.expense,
      label: t("quick.expense"),
      path: "/transaction/new?type=expense",
      show: can(role, "create", "transactions"),
    },
    {
      key: "income",
      icon: "arrow-down",
      color: colors.income,
      label: t("quick.income"),
      path: "/transaction/new?type=income",
      show: can(role, "create", "transactions") && role !== "child",
    },
    {
      key: "transfer",
      icon: "swap-horizontal",
      color: colors.info,
      label: t("quick.transfer"),
      path: "/transaction/new?type=transfer",
      show: role !== "child",
    },
    {
      key: "saving",
      icon: "wallet",
      color: colors.primary,
      label: t("quick.saving"),
      path: "/savings",
      show: role !== "child",
    },
    {
      key: "goal",
      icon: "flag",
      color: colors.primary,
      label: t("quick.goal"),
      path: "/goals/new",
      show: can(role, "create", "goals"),
    },
    {
      key: "say",
      icon: "chatbubble-ellipses",
      color: colors.secondary,
      label: t("quick.say"),
      path: "/assistant",
      show: true,
    },
  ].filter((i) => i.show);
  return (
    <QuickAddContext.Provider value={ctx}>
      <View style={{ flex: 1 }}>
        {children}
        <Sheet
          inline
          visible={visible}
          onClose={close}
          title={t("quick.title")}
        >
          {items.map((i) => (
            <Row
              key={i.key}
              title={i.label}
              left={<IconCircle icon={i.icon} color={i.color} />}
              chevron
              onPress={() => go(i.path as never)}
            />
          ))}
        </Sheet>
      </View>
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd() {
  return useContext(QuickAddContext);
}

/** Bouton flottant « + » au-dessus de la barre d'onglets. */
export function QuickAddFab() {
  const { open } = useQuickAdd();
  const { shadow, colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", right: 18, bottom: insets.bottom + 72 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("quick.title")}
        onPress={open}
        style={({ pressed }) => ({
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.secondaryContainer,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          ...shadow.fab,
        })}
      >
        <Icon name="add" size={32} color={colors.onSecondaryContainer} />
      </Pressable>
    </View>
  );
}
