/**
 * Lien de campagne ouvert dans l'application (`https://{domaine}/a?src=…`,
 * étape 5) : sans session, l'origine est retenue sur l'appareil (comptée une
 * fois à l'inscription, anonymement) et l'inscription s'ouvre ; sinon, accueil.
 */
import React, { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/store/app';
import { Loading } from '@/components/ui';
import { originFromLink } from '@/core/installOrigin';
import { rememberOrigin } from '@/services/installOrigin';

export default function CampaignLink() {
  const params = useLocalSearchParams<{ src?: string; cmp?: string; cnt?: string }>();
  const { status, mode } = useApp();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || status === 'loading') return;
    done.current = true;
    const signedIn = status === 'signedIn' && mode === 'firebase';
    void (async () => {
      if (!signedIn) await rememberOrigin(originFromLink({ src: params.src, cmp: params.cmp, cnt: params.cnt })).catch(() => undefined);
      router.replace(status === 'signedIn' ? '/' : '/sign-up');
    })();
  }, [status, mode, params.src, params.cmp, params.cnt]);

  return <Loading />;
}
