import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface ToastValue {
  show: (message: string, tone?: ToastTone) => void;
}
const ToastContext = createContext<ToastValue>({ show: () => undefined });

/** Confirmations légères (« Enregistré ») et erreurs humaines. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, radius } = useTheme();
  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ message, tone });
    if (timer.current) clearTimeout(timer.current);
    // Les alertes se lisent plus longtemps qu'une simple confirmation.
    timer.current = setTimeout(() => setToast(null), tone === 'error' || tone === 'warning' ? 6000 : 2200);
  }, []);
  // Valeur stable : afficher un message ne fait pas re-rendre tous les écrans (et leurs formulaires).
  const value = useMemo(() => ({ show }), [show]);
  const icon = toast?.tone === 'error' ? 'alert-circle' : toast?.tone === 'warning' ? 'warning' : toast?.tone === 'info' ? 'information-circle' : 'checkmark-circle';
  const color = toast?.tone === 'error' ? colors.danger : toast?.tone === 'warning' ? colors.warning : toast?.tone === 'info' ? colors.info : colors.success;
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 90, alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inverseSurface, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, maxWidth: 520 }}>
            <Icon name={icon} size={18} color={color} />
            <Text variant="small" style={{ color: colors.onInverse, flexShrink: 1 }}>
              {toast.message}
            </Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  return useContext(ToastContext);
}
