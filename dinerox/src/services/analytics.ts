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
  | 'mic_routed';

/** Seules ces propriétés, non identifiantes, peuvent être transmises. */
const ALLOWED_PROPS = new Set(['method', 'plan', 'intent', 'source', 'step', 'kind', 'count', 'reason', 'to']);

type Props = Record<string, string | number | boolean>;
type Sink = (event: AnalyticsEvent, props: Props) => void;

let consent = false;
let sink: Sink = (event, props) => {
  if (__DEV__) console.log('[analytics]', event, props);
};

export function sanitize(props: Record<string, unknown> = {}): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return out;
}

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
