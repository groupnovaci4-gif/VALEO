/**
 * I1 — Où part le son de la dictée (audit 2026-10, décision du fondateur). Module PUR
 * (testé : tests/voice-privacy.test.ts).
 *
 * 1. Par défaut, reconnaissance SUR L'APPAREIL dès que le téléphone le permet
 *    (reconnaissance sur l'appareil + langue installée) : aucun son ne quitte le téléphone.
 * 2. Sinon, une demande d'accord claire, une seule fois, avant la première dictée :
 *    « Oui, dicter » → service de reconnaissance du téléphone ; « Non, je tape » → le
 *    micro n'est plus proposé (clavier et phrase écrite restent là). Le choix se change
 *    dans les réglages (choisir « Voix » efface le refus : la question revient).
 * 3. Android 13 et plus sans la langue téléchargée : message du pack de langue.
 * DineroX ne reçoit jamais le son, dans aucun cas.
 */
import type { EntryPrefs } from '../types';

/** `ready` : sur l'appareil possible ; `missing` : possible mais langue non téléchargée ; `unsupported` : impossible. */
export type OnDeviceStatus = 'ready' | 'missing' | 'unsupported';
export type VoiceConsent = 'service' | 'refused';
/** `device` / `service` : on écoute ; `ask` / `pack` : demander d'abord ; `refused` : pas de micro. */
export type VoiceRoute = 'device' | 'service' | 'ask' | 'pack' | 'refused';

type Prefs = Pick<EntryPrefs, 'onDeviceChoice' | 'voiceConsent'>;

/** Réglage « sur l'appareil » effectif : le choix de la personne, sinon activé. */
export function onDeviceWanted(p: Pick<EntryPrefs, 'onDeviceChoice'>): boolean {
  return p.onDeviceChoice ?? true;
}

export function voiceRoute(input: { onDevice: OnDeviceStatus; prefs: Prefs }): VoiceRoute {
  const { onDevice, prefs } = input;
  const wanted = onDeviceWanted(prefs);
  if (wanted && onDevice === 'ready') return 'device';
  if (prefs.voiceConsent === 'service') return 'service';
  if (prefs.voiceConsent === 'refused') return 'refused';
  return wanted && onDevice === 'missing' ? 'pack' : 'ask';
}

/** Le micro est-il proposé ? (non seulement après « Non, je tape »). */
export function micOffered(route: VoiceRoute): boolean {
  return route !== 'refused';
}

/** Préférences à enregistrer après la réponse à la demande. */
export function consentPatch(answer: VoiceConsent): Partial<EntryPrefs> {
  return answer === 'service' ? { voiceConsent: 'service' } : { voiceConsent: 'refused', defaultMethod: 'quick_manual' };
}

/** Méthode par défaut choisie dans les réglages : « Voix » après un refus repose la question. */
export function methodPatch(method: EntryPrefs['defaultMethod'], p: Prefs): Partial<EntryPrefs> {
  return method === 'voice' && p.voiceConsent === 'refused' ? { defaultMethod: method, voiceConsent: null } : { defaultMethod: method };
}

/** Langue installée sur l'appareil (« fr-FR », « fr_FR », « fr-CI »…). */
export function localeInstalled(installed: string[], language: 'fr' | 'en'): boolean {
  return installed.some((l) => {
    const code = l.toLowerCase().replace('_', '-');
    return code === language || code.startsWith(`${language}-`);
  });
}

/** `installed` null : liste illisible (service absent, erreur) → considéré comme impossible. */
export function onDeviceStatusOf(supports: boolean, installed: string[] | null, language: 'fr' | 'en'): OnDeviceStatus {
  if (!supports || !installed) return 'unsupported';
  return localeInstalled(installed, language) ? 'ready' : 'missing';
}

/**
 * Interrupteur des réglages « Reconnaissance uniquement sur le téléphone ». Le désactiver
 * est un choix explicite du service du téléphone (son sous-titre le dit) : pas de demande
 * en plus. `onDeviceOnly` suit, pour les versions précédentes sur un autre téléphone.
 */
export function onDeviceTogglePatch(on: boolean): Partial<EntryPrefs> {
  return on ? { onDeviceChoice: true, onDeviceOnly: true } : { onDeviceChoice: false, onDeviceOnly: false, voiceConsent: 'service' };
}
