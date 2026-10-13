/**
 * Parrainage, au démarrage (aucun affichage propre) :
 *  1. Android, premier lancement : lecture UNIQUE du referrer Google Play ;
 *  2. session en ligne : application du code en attente (referrer, lien,
 *     saisie à l'inscription), puis message de bienvenue ;
 *  3. parrain : message dans l'application, à l'ouverture suivante, pour un
 *     filleul validé (« 3/5 ») ou un mois gagné (avis écrits par le serveur).
 * Un refus d'un code automatique est silencieux ; un code SAISI affiche la raison.
 */
import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useToast } from '@/components/ui';
import { canEnterCode, REFERRAL, refusalKey } from '@/core/referral';
import { analytics } from '@/services/analytics';
import { readJSON, storageKey, writeJSON } from '@/services/storage';
import { applyReferralCode, listenReferralState, readInstallReferrerOnce, readPending, refusalOf, writePending, type ReferralNotice } from '@/services/referral';

const NOTICE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export function ReferralBootstrap() {
  const { t } = useI18n();
  const toast = useToast();
  const { status, mode, user, profile, online } = useApp();
  const uid = status === 'signedIn' && mode === 'firebase' ? user?.uid : undefined;
  const profileReady = !!profile && profile.uid === uid;
  const referred = !!profile?.referredBy;

  useEffect(() => {
    void readInstallReferrerOnce();
  }, []);

  // Code en attente → serveur (une tentative à la fois ; une erreur réseau garde le code).
  const busy = useRef(false);
  useEffect(() => {
    if (!uid || !profileReady || !online || busy.current) return;
    busy.current = true;
    void (async () => {
      try {
        const pending = await readPending();
        if (!pending) return;
        if (referred || !canEnterCode(user?.signupAt, false, Date.now())) {
          await writePending(null);
          return;
        }
        try {
          const r = await applyReferralCode(pending.code, pending.source);
          await writePending(null);
          analytics.track('referral_applied', { source: pending.source });
          if (r.parrainFirstName) toast.show(t('ref.welcome', { name: r.parrainFirstName }), 'success');
        } catch (e) {
          const refusal = refusalOf(e);
          if (!refusal) return;
          await writePending(null);
          if (pending.source === 'manual') toast.show(t(refusalKey(refusal)), 'error');
        }
      } finally {
        busy.current = false;
      }
    })();
  }, [uid, profileReady, referred, online, user?.signupAt, t, toast]);

  // Avis au parrain : le plus important non encore vu (mois gagné, sinon avancement).
  useEffect(() => {
    if (!uid) return;
    const seenKey = storageKey(uid, 'referralNoticeSeen');
    return listenReferralState(uid, (state) => {
      const notices = state?.notices ?? [];
      if (!notices.length) return;
      void readJSON<number>(seenKey).then((seen) => {
        const fresh = notices.filter((n) => n.at > (seen ?? 0) && Date.now() - n.at < NOTICE_MAX_AGE_MS);
        if (!fresh.length) return;
        const pick: ReferralNotice = fresh.filter((n) => n.kind !== 'validated').pop() ?? (fresh[fresh.length - 1] as ReferralNotice);
        const message =
          pick.kind === 'month'
            ? t('ref.notice.month')
            : pick.kind === 'month_banked'
              ? t('ref.notice.banked')
              : t('ref.notice.validated', { count: pick.count, of: REFERRAL.FILLEULS_PER_REWARD });
        toast.show(message, 'success');
        void writeJSON(seenKey, Math.max(...notices.map((n) => n.at)));
      });
    });
  }, [uid, t, toast]);

  return null;
}
