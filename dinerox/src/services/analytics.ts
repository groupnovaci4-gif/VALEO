/**
 * Événements analytiques ANONYMISÉS.
 *
 * - Envoyés uniquement si l'utilisateur y a consenti (préférences).
 * - Aucune donnée personnelle ni financière : ni montant, ni nom, ni e-mail.
 *   Les propriétés sont filtrées par une liste blanche.
 * - Destination interchangeable (`setAnalyticsSink`) : console en
 *   développement, collection Firestore `analyticsEvents` (écriture seule,
 *   identifiant pseudonyme) en production, ou un outil tiers plus tard.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { firebase } from './firebase';
import { isFirebaseConfigured, env } from '@/config/env';
import { sanitize, type Props } from '@/core/analyticsProps';

export type AnalyticsEvent =
  | 'sign_up'
  | 'onboarding_completed'
  | 'first_expense'
  | 'first_income'
  | 'first_goal'
  | 'first_envelope'
  | 'ai_used'
  | 'premium_viewed'
  | 'premium_converted'
  | 'unsubscribed'
  | 'family_created'
  | 'export_data'
  // Saisie (1.5) : méthode et nombre d'opérations, JAMAIS de montant, de texte ni de catégorie.
  | 'entry_created'
  | 'voice_entry_corrected'
  | 'voice_entry_failed'
  | 'daily_reminder_opened'
  | 'history_opened'
  | 'mic_routed'
  // 1.9 : qui a compris la note vocale (`source` : local, ai) — mesure des appels à l'IA évités.
  | 'voice_understood'
  // Croissance (étape 1) : `kind` = moyen (share, copy) ou `source` du code (install_referrer, link, manual). Jamais le code ni un nom.
  | 'referral_shared'
  | 'referral_applied'
  // Croissance (étape 2) : `context` + `channel` UNIQUEMENT (jamais le message, le code ni un nom).
  | 'share_clicked'
  // Croissance (étape 3), tontine partagée : jamais de montant ni de nom. `mode` : personal | group ; `step` : request.
  | 'tontine_created'
  | 'tontine_group_invite_shared'
  | 'tontine_group_joined'
  | 'tontine_payment_declared'
  | 'tontine_payment_confirmed'
  // Croissance (étape 4) : demande d'avis. `context` : goal | tontine (fenêtre automatique) | manual (ligne du menu). Jamais « a noté ».
  | 'review_requested';

export { sanitize } from '@/core/analyticsProps';
type Sink = (event: AnalyticsEvent, props: Props) => void;

let consent = false;
let sink: Sink = (event, props) => {
  if (__DEV__) console.log('[analytics]', event, props);
};


export const analytics = {
  setConsent(v: boolean) {
    consent = v;
  },
  track(event: AnalyticsEvent, props?: Record<string, unknown>) {
    if (!consent && !__DEV__) return;
    try {
      sink(event, sanitize(props));
    } catch {
      /* jamais bloquant */
    }
  },
};

export function setAnalyticsSink(next: Sink) {
  sink = next;
}

/** Destination Firestore : événement + jour, sans uid ni appareil. */
export function enableFirestoreAnalytics() {
  if (!isFirebaseConfigured || env.appEnv === 'development') return;
  setAnalyticsSink((event, props) => {
    void addDoc(collection(firebase().db, 'analyticsEvents'), {
      event,
      props,
      env: env.appEnv,
      day: new Date().toISOString().slice(0, 10),
      at: serverTimestamp(),
    }).catch(() => undefined);
  });
}
