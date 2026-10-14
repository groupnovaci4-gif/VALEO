/**
 * Étape 4 — demande d'avis automatique, déclenchée UNIQUEMENT au retour à
 * l'Accueil après un moment positif (« Objectif atteint » fermé, cagnotte de
 * tontine reçue), au moins `REVIEW_DELAY_MS` après, si l'écran est libre.
 * Toutes les conditions sont dans `reviewDecision` (pur, testé). Rien n'est
 * affiché par DineroX : ni question avant, ni message après.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useApp } from '@/store/app';
import { analytics } from '@/services/analytics';
import { entryDays, keepMoment, REVIEW_DELAY_MS, reviewDecision, withRequest } from '@/core/storeReview';
import {
  actionFailedThisSession,
  clearReviewMoment,
  isFirstSession,
  nativeReviewAvailable,
  pendingReviewMoment,
  readReviewState,
  requestNativeReview,
  screenBusy,
  touchReviewSession,
  writeReviewState,
} from '@/services/storeReview';
import type { Transaction } from '@/core/types';

export function useStoreReviewPrompt(transactions: readonly Transaction[]) {
  const { user, profile, role, online, mode } = useApp();
  // Comptes connectés seulement (le mode local n'a ni compte ni date de création).
  const uid = mode === 'firebase' ? (user?.uid ?? null) : null;
  const latest = useRef({ profile, role, online, transactions });
  useEffect(() => {
    latest.current = { profile, role, online, transactions };
  }, [profile, role, online, transactions]);

  // Changement de compte : le moment de l'autre compte ne compte pas.
  const previousUid = useRef(uid);
  useEffect(() => {
    if (previousUid.current && previousUid.current !== uid) clearReviewMoment();
    previousUid.current = uid;
    if (uid) void touchReviewSession(uid).catch(() => undefined);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      if (!uid || !pendingReviewMoment()) return undefined;
      let focused = true;
      const attempt = async () => {
        const moment = pendingReviewMoment();
        if (!focused || !moment) return;
        const [state, storeAvailable] = await Promise.all([readReviewState(uid), nativeReviewAvailable()]);
        if (!focused) return;
        const { profile: p, role: r, online: o, transactions: txs } = latest.current;
        const decision = reviewDecision(state, {
          now: Date.now(),
          moment,
          storeAvailable,
          online: o,
          role: r,
          firstSession: isFirstSession(uid),
          actionFailed: actionFailedThisSession(),
          accountCreatedAt: p?.createdAt ?? null,
          entryDays: entryDays(txs, uid),
          busy: screenBusy(),
        });
        // Écran occupé : le moment attend le prochain retour à l'Accueil ; sinon il est consommé.
        if (!keepMoment(decision)) clearReviewMoment();
        if (!decision.ask) return;
        // Compté AVANT la demande : Google / Apple ne disent jamais si la fenêtre s'est affichée.
        await writeReviewState(uid, withRequest(state, Date.now()));
        analytics.track('review_requested', { context: moment });
        await requestNativeReview().catch(() => undefined);
      };
      const timer = setTimeout(() => void attempt().catch(() => undefined), REVIEW_DELAY_MS);
      return () => {
        focused = false;
        clearTimeout(timer);
      };
    }, [uid]),
  );
}
