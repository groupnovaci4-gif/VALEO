import React, { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { Button, Text, useToast } from '@/components/ui';
import { TERMS_VERSION } from '@/config/legal';
import { ensureProfile, saveProfile } from '@/services/profile';
import { env, isGoogleConfigured } from '@/config/env';
import { useI18n } from '@/i18n';
import { authErrorKey, signInWithGoogleIdToken } from '@/services/auth';

WebBrowser.maybeCompleteAuthSession();

/** Connexion Google — affichée uniquement si les identifiants OAuth sont configurés. */
export function GoogleButton() {
  if (!isGoogleConfigured) return null;
  return <GoogleButtonInner />;
}

function GoogleButtonInner() {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: env.google.webClientId,
    iosClientId: env.google.iosClientId || undefined,
    androidClientId: env.google.androidClientId || undefined,
  });
  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    signInWithGoogleIdToken(idToken)
      // Consentement affiché sous le bouton : enregistré sur le profil (comme l'inscription par e-mail).
      .then(async (u) => {
        const [first = '', ...rest] = (u.displayName ?? '').split(' ');
        const p = await ensureProfile(u.uid, u.email ?? '', first, TERMS_VERSION, rest.join(' '));
        if (!p.termsAcceptedVersion) await saveProfile(u.uid, { termsAcceptedVersion: TERMS_VERSION });
      })
      .catch((e) => toast.show(t(authErrorKey(e)), 'error'))
      .finally(() => setBusy(false));
  }, [response, t, toast]);
  return (
    <View style={{ gap: 6 }}>
      <Button
        variant="secondary"
        full
        icon="logo-google"
        label={t('auth.google')}
        loading={busy}
        disabled={!request}
        onPress={() => {
          setBusy(true);
          void promptAsync().then((r) => r.type !== 'success' && setBusy(false));
        }}
      />
      <Text variant="caption" tone="subtle" align="center">
        {t('auth.google.consent')}
      </Text>
    </View>
  );
}
