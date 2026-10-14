/**
 * Lien d'invitation ouvert dans l'application (`https://{domaine}/i/{code}`
 * ou `dinerox://i/{code}`) :
 *  - sans session : le code est gardé en attente et l'inscription s'ouvre
 *    (champ « Vous avez un code d'invitation ? » prérempli) ;
 *  - session ouverte, compte de moins de 7 jours sans parrain : l'écran
 *    « Code d'invitation » s'ouvre prérempli ; la personne lit ce que son
 *    parrain verra, puis valide elle-même (jamais d'application silencieuse) ;
 *  - sinon : retour à l'accueil, rien n'est appliqué.
 */
import React, { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/store/app';
import { Loading } from '@/components/ui';
import { canEnterCode, cleanTag, isValidCode, normalizeCode } from '@/core/referral';
import { readPending, writePending } from '@/services/referral';
import { rememberOrigin } from '@/services/installOrigin';
import { originFromLink } from '@/core/installOrigin';

export default function InviteLink() {
  const params = useLocalSearchParams<{ code?: string; src?: string; cmp?: string; cnt?: string }>();
  const { status, mode, profile, user } = useApp();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || status === 'loading') return;
    if (status === 'signedIn' && mode === 'firebase' && !profile) return;
    done.current = true;
    const code = normalizeCode(params.code);
    void (async () => {
      if (!isValidCode(code)) {
        router.replace('/');
        return;
      }
      if (status !== 'signedIn' || mode !== 'firebase') {
        // Étape 5 : origine de l'installation (jamais le code lui-même).
        await rememberOrigin(originFromLink({ code, src: params.src, cmp: params.cmp, cnt: params.cnt })).catch(() => undefined);
        if (!(await readPending())) await writePending({ code, source: 'link', at: Date.now(), src: cleanTag(params.src), cmp: cleanTag(params.cmp), cnt: cleanTag(params.cnt) });
        router.replace(status === 'signedIn' ? '/' : '/sign-up');
        return;
      }
      if (!canEnterCode(user?.signupAt, !!profile?.referredBy, Date.now())) {
        router.replace('/');
        return;
      }
      // La personne voit ce que son parrain verra, puis valide elle-même.
      router.replace({ pathname: '/invite-code', params: { code } });
    })();
  }, [status, mode, profile, user?.signupAt, params.code, params.src, params.cmp, params.cnt]);

  return <Loading />;
}
