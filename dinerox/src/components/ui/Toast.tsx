import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, MIN_TOUCH } from '@/theme';
import { toastBottom } from '@/theme/layout';
import { Text } from './Text';
import { Icon } from './Icon';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
/** Bouton d'un message (« Voir », « Annuler ») : le message reste affiché `duration` ms. */
export interface ToastAction {
  label: string;
  onPress: () => void;
}
interface ToastOptions {
  actions?: ToastAction[];
  duration?: number;
}
interface ToastValue {
  show: (message: string, tone?: ToastTone, opts?: ToastOptions) => void;
}
const ToastContext = createContext<ToastValue>({ show: () => undefined });
/** Hauteur de la barre d'onglets affichée (null : pas d'onglets à l'écran). */
const TabBarContext = createContext<(height: number | null) => void>(() => undefined);

/** Confirmations légères (« Enregistré ») et erreurs humaines. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; actions: ToastAction[] } | null>(null);
  const [tabBar, setTabBar] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, radius } = useTheme();
  const show = useCallback((message: string, tone: ToastTone = 'success', opts?: ToastOptions) => {
    setToast({ message, tone, actions: opts?.actions ?? [] });
    if (timer.current) clearTimeout(timer.current);
    // Les alertes se lisent plus longtemps qu'une simple confirmation ; 4 s au moins pour
    // un lecteur lent (docs/design-system.md §8.12). Monté à la racine : vaut pour tous les écrans.
    timer.current = setTimeout(() => setToast(null), opts?.duration ?? (tone === 'error' || tone === 'warning' ? 6000 : 4000));
  }, []);
  const press = (a: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
    a.onPress();
  };
  // Valeur stable : afficher un message ne fait pas re-rendre tous les écrans (et leurs formulaires).
  const value = useMemo(() => ({ show }), [show]);
  const icon = toast?.tone === 'error' ? 'alert-circle' : toast?.tone === 'warning' ? 'warning' : toast?.tone === 'info' ? 'information-circle' : 'checkmark-circle';
  const color = toast?.tone === 'error' ? colors.danger : toast?.tone === 'warning' ? colors.warning : toast?.tone === 'info' ? colors.info : colors.success;
  return (
    <ToastContext.Provider value={value}>
      <TabBarContext.Provider value={setTabBar}>
      {children}
      {toast ? (
        <View
          pointerEvents={toast.actions.length ? 'box-none' : 'none'}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ position: 'absolute', left: 16, right: 16, bottom: toastBottom(insets.bottom, tabBar), alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inverseSurface, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, maxWidth: 520 }}>
            <Icon name={icon} size={18} color={color} />
            <Text variant="small" style={{ color: colors.onInverse, flexShrink: 1 }}>
              {toast.message}
            </Text>
            {toast.actions.map((a) => (
              <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => press(a)} style={{ paddingHorizontal: 8, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
                <Text variant="small" weight="700" style={{ color: colors.secondaryContainer }}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      </TabBarContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}

/**
 * Barre d'onglets : renvoie une fonction à appeler quand les onglets sont affichés, avec la
 * hauteur de la barre ; les messages passent alors au-dessus du micro central. La fonction
 * renvoie de quoi annuler (onglets quittés) : à renvoyer par l'effet.
 */
export function useToastAboveTabBar(): (height: number) => () => void {
  const set = useContext(TabBarContext);
  return useCallback(
    (height: number) => {
      set(height);
      return () => set(null);
    },
    [set],
  );
}
