/**
 * Connexion par téléphone — FOURNISSEURS, chacun derrière une interface (DECISIONS.md §5bis.1 :
 * Meta WhatsApp Cloud API + un fournisseur SMS local ; alertes par notification et par e-mail).
 *
 * Aujourd'hui, SEUL le fournisseur SIMULÉ existe : il n'envoie RIEN, il écrit le message dans
 * `phoneOutbox` (collection fermée au client), et il ne fonctionne QUE sur les émulateurs.
 * Hors émulateur, l'envoi des codes est « indisponible » (`phone/unavailable`) : aucun vrai envoi
 * tant que le fondateur n'a pas ouvert les comptes, vérifié les prix et tapé les clés lui-même.
 *
 * Secrets : seulement leurs NOMS ici (jamais de valeur dans le code ni dans Git). Ils seront liés
 * aux fonctions quand les vrais fournisseurs seront écrits.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { sendExpoPush } from './push';
import { LINK_BRAND } from './links';

/** Jeton de l'API WhatsApp Cloud de Meta (à créer par le fondateur). */
export const META_WHATSAPP_TOKEN = defineSecret('META_WHATSAPP_TOKEN');
/** Clé du fournisseur SMS local (Orange, MTN, Moov). */
export const SMS_API_KEY = defineSecret('SMS_API_KEY');

export type Channel = 'whatsapp' | 'sms';
export type Lang = 'fr' | 'en';

/** Envoi d'un code à 6 chiffres. */
export interface CodeSender {
  send(to: string, code: string, lang: Lang): Promise<void>;
}

/** Alertes de sécurité (jamais de code dedans). */
export interface AlertSender {
  push(uid: string, tokens: string[], lang: Lang): Promise<void>;
  email(uid: string, to: string, lang: Lang): Promise<void>;
}

export interface PhoneProviders {
  /** false : aucun fournisseur de codes configuré (hors émulateur aujourd'hui). */
  available: boolean;
  codes: Record<Channel, CodeSender>;
  alerts: AlertSender;
}

/** Texte du message (modèle à faire approuver par Meta) : le code, sa durée, « ne le donnez à personne ». */
export function codeMessage(code: string, lang: Lang): string {
  return lang === 'en'
    ? `Your ${LINK_BRAND.name} code: ${code}. It expires in 10 minutes. Never share it.`
    : `Votre code ${LINK_BRAND.name} : ${code}. Il expire dans 10 minutes. Ne le donnez à personne.`;
}

/** Alerte « code secret changé » (5bis.5, numéro recyclé) : AUCUN code, aucun chiffre du compte. */
export function alertMessage(lang: Lang): { title: string; body: string } {
  return lang === 'en'
    ? { title: `${LINK_BRAND.name}: secret code changed`, body: 'The secret code of your account has just been changed. If it wasn’t you, contact us right away.' }
    : { title: `${LINK_BRAND.name} : code secret changé`, body: 'Le code secret de votre compte vient d’être changé. Si ce n’est pas vous, contactez-nous tout de suite.' };
}

export const isEmulator = (): boolean => process.env.FUNCTIONS_EMULATOR === 'true';

const outbox = (m: Record<string, unknown>) => getFirestore().collection('phoneOutbox').add({ ...m, at: Date.now() }).then(() => undefined);

/** Fournisseur SIMULÉ (émulateurs, tests, e2e) : écrit le message, n'envoie rien. */
function simulated(): PhoneProviders {
  const sender = (channel: Channel): CodeSender => ({
    send: (to, code, lang) => outbox({ kind: 'code', channel, to, code, body: codeMessage(code, lang) }),
  });
  return {
    available: true,
    codes: { whatsapp: sender('whatsapp'), sms: sender('sms') },
    alerts: {
      push: async (uid, tokens, lang) => {
        for (const to of tokens) await outbox({ kind: 'alert-push', uid, to, ...alertMessage(lang) });
      },
      email: (uid, to, lang) => outbox({ kind: 'alert-email', uid, to, ...alertMessage(lang) }),
    },
  };
}

/** Hors émulateur : aucun fournisseur de codes n'est écrit — refus, rien n'est envoyé. */
function unconfigured(): PhoneProviders {
  const refuse: CodeSender = {
    send: async () => {
      throw new HttpsError('unavailable', 'phone/unavailable');
    },
  };
  return {
    available: false,
    codes: { whatsapp: refuse, sms: refuse },
    alerts: {
      // Notification : le canal existant de l'application (Expo), sans aucun code.
      push: async (_uid, tokens, lang) => {
        const m = alertMessage(lang);
        await sendExpoPush(tokens.map((to) => ({ to, title: m.title, body: m.body, data: { url: '/settings/security' } })));
      },
      // E-mail : aucun fournisseur choisi à ce jour — journalisé, jamais inventé.
      email: async () => {
        logger.warn('phone alert email: no email provider configured');
      },
    },
  };
}

export function phoneProviders(emulator: boolean = isEmulator()): PhoneProviders {
  return emulator ? simulated() : unconfigured();
}
