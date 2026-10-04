import React, { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Button, useToast } from '@/components/ui';
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
      .catch((e) => toast.show(t(authErrorKey(e)), 'error'))
      .finally(() => setBusy(false));
  }, [response, t, toast]);
  return <Button variant="secondary" full icon="logo-google" label={t('auth.google')} loading={busy} disabled={!request} onPress={() => {
        setBusy(true);
        void promptAsync().then((r) => r.type !== 'success' && setBusy(false));
      }} />;
}
