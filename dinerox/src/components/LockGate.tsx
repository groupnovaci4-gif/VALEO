import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Text } from '@/components/ui';
import { PinPad } from './PinPad';
import { Logo } from './Logo';
import { authenticateBiometric, biometricAvailable, clearPin, hasPin, verifyPin } from '@/services/security';
import { signOut } from '@/services/auth';

/**
 * Verrouillage : à l'ouverture et après un passage en arrière-plan plus long
 * que le délai choisi.
 *  - L'application reste MONTÉE sous l'écran de verrouillage (masquée et
 *    inaccessible) : la navigation et une saisie en cours ne sont pas perdues.
 *  - Activer le verrou dans les réglages ne verrouille pas immédiatement.
 *  - Une erreur du stockage sécurisé ne bloque jamais l'utilisateur.
 *  - « Code oublié ? » : une issue existe toujours.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { profile, status, user } = useApp();
  const enabled = status === 'signedIn' && !!profile?.preferences.appLock;
  const minutes = profile?.preferences.autoLockMinutes ?? 1;
  const uid = status === 'signedIn' ? (user?.uid ?? null) : null;
  // unlocked : l'utilisateur est entré dans l'app (sans verrou, ou en le déverrouillant).
  const [state, setState] = useState({ uid: null as string | null, unlocked: false, checked: false, locked: false });
  const backgroundAt = useRef<number | null>(null);

  // Ajustements pendant le rendu (pas d'effet) : nouvelle session → état remis à zéro ;
  // session ouverte sans verrou → l'activer ensuite ne verrouille pas aussitôt.
  if (state.uid !== uid) setState({ uid, unlocked: false, checked: false, locked: false });
  else if (uid && !enabled && !state.unlocked) setState({ ...state, unlocked: true });

  // Verrouillage à l'ouverture si un code existe (une erreur de stockage ne bloque jamais).
  const needsCheck = enabled && !state.unlocked && !state.checked;
  useEffect(() => {
    if (!needsCheck) return;
    let alive = true;
    hasPin()
      .then((has) => alive && setState((s) => ({ ...s, checked: true, locked: has })))
      .catch(() => alive && setState((s) => ({ ...s, checked: true, locked: false })));
    return () => {
      alive = false;
    };
  }, [needsCheck]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || (s === 'inactive' && Platform.OS === 'android')) {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
      } else if (s === 'active') {
        const since = backgroundAt.current;
        backgroundAt.current = null;
        // > 1,5 s : une boîte système (Face ID, autorisation) ne déclenche pas de boucle.
        if (since !== null && Date.now() - since >= Math.max(minutes, 0) * 60_000 && Date.now() - since > 1500) {
          hasPin()
            .then((has) => has && setState((st) => ({ ...st, locked: true })))
            .catch(() => undefined);
        }
      }
    });
    return () => sub.remove();
  }, [enabled, minutes]);

  const onUnlock = useCallback(() => setState((s) => ({ ...s, unlocked: true, checked: true, locked: false })), []);

  const covering = enabled && (state.locked || (!state.unlocked && !state.checked));
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, opacity: covering ? 0 : 1 }} pointerEvents={covering ? 'none' : 'auto'} accessibilityElementsHidden={covering} importantForAccessibility={covering ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {covering ? <View style={StyleSheet.absoluteFill}>{state.locked ? <LockScreen onUnlock={onUnlock} /> : <BlankCover />}</View> : null}
    </View>
  );
}

function BlankCover() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { mode, signOutLocal } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bio, setBio] = useState(false);
  const prompted = useRef(false);

  const tryBio = useCallback(async () => {
    try {
      if (await authenticateBiometric(t('set.pin.enter'))) onUnlock();
    } catch {
      /* biométrie indisponible : le code reste possible */
    }
  }, [onUnlock, t]);

  // Proposition biométrique UNE seule fois à l'affichage.
  useEffect(() => {
    if (prompted.current) return;
    prompted.current = true;
    biometricAvailable()
      .then((ok) => {
        setBio(ok);
        if (ok) void tryBio();
      })
      .catch(() => setBio(false));
  }, [tryBio]);

  useEffect(() => {
    if (pin.length < 4) return;
    let alive = true;
    verifyPin(pin)
      .then((r) => {
        if (!alive) return;
        if (r.ok) onUnlock();
        else {
          setPin('');
          setError(r.lockedFor > 0 ? t('set.pin.locked', { seconds: r.lockedFor }) : t('set.pin.wrong'));
        }
      })
      .catch(() => {
        if (!alive) return;
        setPin('');
        setError(t('error.generic'));
      });
    return () => {
      alive = false;
    };
  }, [pin, onUnlock, t]);

  const forgot = () => {
    const reset = async () => {
      try {
        if (mode === 'local') await signOutLocal();
        else await signOut();
      } finally {
        await clearPin().catch(() => undefined);
        onUnlock();
      }
    };
    Alert.alert(t('set.pin.forgot'), mode === 'local' ? t('set.pin.forgotLocal') : t('set.pin.forgotOnline'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void reset() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <Logo size={72} />
      <Text variant="h3">{t('set.pin.enter')}</Text>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <PinPad value={pin} onChange={setPin} onBiometric={bio ? () => void tryBio() : undefined} biometricLabel={t('set.biometric')} />
      <Button variant="ghost" label={t('set.pin.forgot')} onPress={forgot} />
    </SafeAreaView>
  );
}
