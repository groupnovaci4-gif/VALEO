/**
 * Étape 5 — à l'inscription (aucun affichage) : envoie UNE fois l'origine de
 * l'installation à `recordSignupOrigin` (compteurs anonymes). Le profil ne
 * garde que le marqueur oui/non `originCounted`, posé par le serveur.
 * Hors ligne ou profil pas encore créé : nouvel essai plus tard, pendant
 * `ORIGIN_WINDOW_DAYS` jours ; au-delà, le serveur refuse et rien n'est compté.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '@/store/app';
import { ORIGIN_WINDOW_DAYS } from '@/core/installOrigin';
import { sendSignupOrigin } from '@/services/installOrigin';

const DAY_MS = 24 * 3600 * 1000;

export function OriginBootstrap() {
  const { status, mode, user, profile, online } = useApp();
  const uid = status === 'signedIn' && mode === 'firebase' ? user?.uid : undefined;
  const profileReady = !!profile && profile.uid === uid;
  const counted = profile?.originCounted === true;
  const signupAt = user?.signupAt ?? null;
  const busy = useRef(false);
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    const recent = !!signupAt && Date.now() - signupAt <= ORIGIN_WINDOW_DAYS * DAY_MS;
    if (!uid || !profileReady || counted || !recent || !online || busy.current || doneFor.current === uid) return;
    busy.current = true;
    void sendSignupOrigin()
      .then(() => {
        // Compté, déjà compté ou trop ancien : plus rien à envoyer pour ce compte.
        doneFor.current = uid;
      })
      // Réseau ou profil pas encore visible côté serveur : nouvel essai au prochain changement d'état.
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [uid, profileReady, counted, signupAt, online]);

  return null;
}
