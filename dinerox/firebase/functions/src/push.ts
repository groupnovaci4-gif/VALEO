/**
 * Envoi de notifications push via le service Expo (jetons des appareils de
 * l'utilisateur, `users/{uid}/devices`). Aucune donnée financière dans un message.
 */
import { logger } from 'firebase-functions/v2';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string };
}

/** Envoie par lots de 100 (limite Expo) ; un lot refusé est journalisé, jamais bloquant. */
export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    if (!res.ok) logger.warn('push batch failed', { status: res.status });
  }
}
