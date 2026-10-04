import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Text } from '@/components/ui';
import { PinPad } from './PinPad';
import { brand } from '@/config/brand';
import { authenticateBiometric, biometricAvailable, hasPin, verifyPin } from '@/services/security';

/**
 * Verrouillage : à l'ouverture et après un passage en arrière-plan plus long
 * que le délai choisi. Le contenu financier n'est pas rendu tant que
 * l'application est verrouillée.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { profile, status } = useApp();
  const enabled = status === 'signedIn' && !!profile?.preferences.appLock;
  const minutes = profile?.preferences.autoLockMinutes ?? 1;
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  // Verrouillage initial si un PIN existe.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void hasPin().then((has) => {
      if (!alive) return;
      setLocked(has);
      setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
      } else if (s === 'active') {
        const since = backgroundAt.current;
        backgroundAt.current = null;
        if (since !== null && Date.now() - since >= minutes * 60_000) void hasPin().then((has) => has && setLocked(true));
      }
    });
    return () => sub.remove();
  }, [enabled, minutes]);

  if (enabled && !checked) return null;
  if (enabled && locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  return <>{children}</>;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bio, setBio] = useState(false);

  const tryBio = useCallback(async () => {
    if (await authenticateBiometric(t('set.pin.enter'))) onUnlock();
  }, [onUnlock, t]);

  useEffect(() => {
    void biometricAvailable().then((ok) => {
      setBio(ok);
      if (ok) void tryBio();
    });
  }, [tryBio]);

  useEffect(() => {
    if (pin.length < 4) return;
    void verifyPin(pin).then((r) => {
      if (r.ok) onUnlock();
      else {
        setPin('');
        setError(r.lockedFor > 0 ? t('set.pin.locked', { seconds: r.lockedFor }) : t('set.pin.wrong'));
      }
    });
  }, [pin, onUnlock, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="h1" tone="onPrimary">
          {brand.logoLetter}
        </Text>
      </View>
      <Text variant="h3">{t('set.pin.enter')}</Text>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <PinPad value={pin} onChange={setPin} onBiometric={bio ? () => void tryBio() : undefined} biometricLabel={t('set.biometric')} />
    </SafeAreaView>
  );
}
