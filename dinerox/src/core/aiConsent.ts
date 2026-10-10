/**
 * Consentement à l'IA distante — module PUR.
 *
 * Version 2 (1.9) : le texte dit que la transcription ÉCRITE d'une phrase complexe
 * (jamais l'audio) peut être envoyée. Un accord donné avant la 1.9 (version absente
 * ou 1) vaut toujours pour l'assistant (résumé chiffré), mais PAS pour l'envoi d'une
 * transcription : l'utilisateur revoit le nouveau texte et l'accepte une fois.
 * Miroir serveur : `AI_CONSENT_VERSION` (firebase/functions/src/voiceEntry.ts).
 */
import type { UserPreferences } from './types';

export const AI_CONSENT_VERSION = 2;

type ConsentPrefs = Pick<UserPreferences, 'aiConsent' | 'aiConsentVersion'> | null | undefined;

/** Accord au texte actuel : la transcription peut être envoyée. */
export function transcriptConsent(p: ConsentPrefs): boolean {
  return !!p?.aiConsent && (p.aiConsentVersion ?? 0) >= AI_CONSENT_VERSION;
}

/** Accord ancien (avant la 1.9) : le nouveau texte doit être revu et accepté avant tout envoi. */
export function needsConsentRenewal(p: ConsentPrefs): boolean {
  return !!p?.aiConsent && (p.aiConsentVersion ?? 0) < AI_CONSENT_VERSION;
}

/** Préférences après acceptation du texte actuel. */
export function withConsent<T extends ConsentPrefs & object>(p: T): T {
  return { ...p, aiConsent: true, aiConsentVersion: AI_CONSENT_VERSION };
}
