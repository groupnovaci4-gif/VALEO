/**
 * Lien d'invitation de tontine ouvert dans l'application (`https://{domaine}/t/{code}`
 * ou `dinerox://t/{code}`) : ouvre « Rejoindre une tontine » avec le code
 * prérempli. Rien n'est demandé tant que la personne n'a pas lu l'aperçu et
 * appuyé sur « Demander à rejoindre ».
 * Étape 5 : sans session, la source du lien (`src`…) est retenue comme origine
 * de l'installation AVANT de quitter cet écran (le code de tontine, lui, n'est
 * jamais compté).
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Loading } from '@/components/ui';
import { normalizeCode } from '@/core/referral';
import { originFromLink } from '@/core/installOrigin';
import { rememberOrigin } from '@/services/installOrigin';
import { useApp } from '@/store/app';

export default function TontineInviteLink() {
  const { code, src, cmp, cnt } = useLocalSearchParams<{ code?: string; src?: string; cmp?: string; cnt?: string }>();
  const { status, mode } = useApp();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || status === 'loading') return;
    done.current = true;
    const signedIn = status === 'signedIn' && mode === 'firebase';
    void (async () => {
      if (!signedIn) await rememberOrigin(originFromLink({ src, cmp, cnt })).catch(() => undefined);
      router.replace({ pathname: '/tontines/join', params: { code: normalizeCode(code) } });
    })();
  }, [status, mode, code, src, cmp, cnt]);
  return <Loading />;
}
