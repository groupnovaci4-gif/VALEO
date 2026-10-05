import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

type ToastTone = 'success' | 'error' | 'info';
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
    timer.current = setTimeout(() => setToast(null), tone === 'error' ? 4500 : 2200);
  }, []);
  const icon = toast?.tone === 'error' ? 'alert-circle' : toast?.tone === 'info' ? 'information-circle' : 'checkmark-circle';
  const color = toast?.tone === 'error' ? colors.danger : toast?.tone === 'info' ? colors.info : colors.success;
  return (
    <ToastContext.Provider value={{ show }}>
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
