import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
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

/** Confirmations légères (« Enregistré ») et erreurs humaines. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; actions: ToastAction[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, radius } = useTheme();
  const show = useCallback((message: string, tone: ToastTone = 'success', opts?: ToastOptions) => {
    setToast({ message, tone, actions: opts?.actions ?? [] });
    if (timer.current) clearTimeout(timer.current);
    // Les alertes se lisent plus longtemps qu'une simple confirmation.
    timer.current = setTimeout(() => setToast(null), opts?.duration ?? (tone === 'error' || tone === 'warning' ? 6000 : 2200));
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
      {children}
      {toast ? (
        <View
          pointerEvents={toast.actions.length ? 'box-none' : 'none'}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 90, alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inverseSurface, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, maxWidth: 520 }}>
            <Icon name={icon} size={18} color={color} />
            <Text variant="small" style={{ color: colors.onInverse, flexShrink: 1 }}>
              {toast.message}
            </Text>
            {toast.actions.map((a) => (
              <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => press(a)} hitSlop={8} style={{ paddingHorizontal: 6, minHeight: 32, justifyContent: 'center' }}>
                <Text variant="small" weight="700" style={{ color: colors.secondaryContainer }}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}
