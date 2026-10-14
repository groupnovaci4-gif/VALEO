/**
 * Partage (croissance, étape 2) — logique PURE, testée.
 *
 * Règles (fondateur, 2026-10-14) :
 *  - l'application n'envoie JAMAIS rien d'elle-même : elle ouvre WhatsApp (ou
 *    la feuille de partage) avec un message prérempli, MODIFIABLE ;
 *  - jamais de montant, de solde, de nom ni de prénom dans un message ou une
 *    image préremplis ;
 *  - le lien porte `src=whatsapp` (ou la source du canal) pour l'étape 5.
 */
import { inviteLink } from './referral';

export type ShareContext = 'invite' | 'trophy' | 'tontine';
export type ShareChannel = 'whatsapp' | 'system' | 'copy';

/** Ouvre l'application WhatsApp (ou WhatsApp Business : même schéma). */
export function whatsappAppUrl(text: string): string {
  return `whatsapp://send?text=${encodeURIComponent(text)}`;
}

/** WhatsApp Web / redirection officielle (ordinateur, navigateur). */
export function whatsappWebUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type ShareRoute = 'whatsapp_app' | 'whatsapp_web' | 'system';

/**
 * Voie de partage : WhatsApp installé → l'application ; sinon la feuille de
 * partage du téléphone (jamais un échec muet). Navigateur : WhatsApp Web.
 */
export function pickShareRoute(input: { platform: string; whatsappInstalled: boolean }): ShareRoute {
  if (input.platform === 'web') return 'whatsapp_web';
  return input.whatsappInstalled ? 'whatsapp_app' : 'system';
}

/** Lien d'invitation pour un partage, avec la source du canal (`src`). */
export function shareInviteLink(host: string, code: string, channel: ShareChannel | 'share'): string {
  return inviteLink(host, code, { src: channel });
}

/** Lien COURT écrit en clair sur une image (sans https://) ; sans code : le domaine seul. */
export function shortLink(host: string, code: string | null | undefined): string {
  return code ? `${host}/i/${code}` : host;
}

/**
 * Un texte contient-il un montant ? Nombres de 3 chiffres ou plus (groupés ou
 * non) ou unités monétaires. Les seuls chiffres admis dans un modèle sont les
 * petits compteurs (« 5 », « 1 mois », « 3/7 »).
 */
export function containsAmount(text: string): boolean {
  if (/\d[\d\s  .,]*\d{2}/.test(text.replace(/\{[a-z]+\}/gi, ''))) return true;
  return /(F\s?CFA|FCFA|XOF|XAF|€|\$|\bEUR\b|\bUSD\b|\bfrancs?\b)/i.test(text);
}

/** Adresse de chaîne WhatsApp admise (configuration à distance) : https, domaine WhatsApp, chemin /channel/. */
export function isWhatsAppChannelUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9_-]{6,80}\/?$/.test(url.trim());
}

/**
 * Contenu de la carte « trophée » partagée en image : AUCUN nom, prénom ni
 * montant. Les libellés sont des clés i18n ; le code et le lien sont publics.
 */
export function trophyCard(input: { rewardNameKey: string; code: string | null | undefined; host: string }) {
  return {
    titleKey: 'share.trophy.title' as const,
    rewardNameKey: input.rewardNameKey,
    link: shortLink(input.host, input.code),
    code: input.code ?? null,
  };
}
