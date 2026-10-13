/**
 * Lien d'invitation ouvert dans l'application (`https://{domaine}/i/{code}`
 * ou `dinerox://i/{code}`) :
 *  - sans session : le code est gardé en attente et l'inscription s'ouvre
 *    (champ « Vous avez un code d'invitation ? » prérempli) ;
 *  - session ouverte, compte de moins de 7 jours sans parrain : le serveur
 *    applique le code (message de bienvenue, ou raison du refus) ;
 *  - sinon : retour à l'accueil, rien n'est appliqué.
 */
import React, { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Loading, useToast } from '@/components/ui';
import { canEnterCode, cleanTag, isValidCode, normalizeCode, refusalKey } from '@/core/referral';
import { analytics } from '@/services/analytics';
import { applyReferralCode, readPending, refusalOf, writePending } from '@/services/referral';

export default function InviteLink() {
  const { t } = useI18n();
  const toast = useToast();
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
        if (!(await readPending())) await writePending({ code, source: 'link', at: Date.now(), src: cleanTag(params.src), cmp: cleanTag(params.cmp), cnt: cleanTag(params.cnt) });
        router.replace(status === 'signedIn' ? '/' : '/sign-up');
        return;
      }
      if (!canEnterCode(user?.signupAt, !!profile?.referredBy, Date.now())) {
        router.replace('/');
        return;
      }
      try {
        const r = await applyReferralCode(code, 'link');
        analytics.track('referral_applied', { source: 'link' });
        if (r.parrainFirstName) toast.show(t('ref.welcome', { name: r.parrainFirstName }));
      } catch (e) {
        toast.show(t(refusalKey(refusalOf(e))), 'error');
      }
      router.replace('/');
    })();
  }, [status, mode, profile, user?.signupAt, params.code, params.src, params.cmp, params.cnt, t, toast]);

  return <Loading />;
}
