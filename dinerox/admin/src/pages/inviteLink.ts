/** Lien d'invitation : jeton dans la partie « # » (lien copié pour WhatsApp). */
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

import { inviteUrl as buildInviteUrl } from './inviteUrl';

export const inviteUrl = (inviteId: string, token: string, origin = window.location.origin) => buildInviteUrl(inviteId, token, origin);

/**
 * E-mail d'invitation : modèle Firebase gratuit (D7), avec l'invitation comme lien de suite.
 * Le jeton y est en paramètre (une adresse de suite Firebase ne garde pas la partie « # »).
 * Avec l'URL d'action personnalisée (D18), le lien de l'e-mail ouvre directement l'invitation.
 */
export async function sendInviteEmail(email: string, inviteId: string, token: string, origin = window.location.origin): Promise<boolean> {
  const url = `${origin}/invitation?i=${encodeURIComponent(inviteId)}&t=${encodeURIComponent(token)}`;
  try {
    await sendPasswordResetEmail(auth, email, { url });
    return true;
  } catch {
    return false;
  }
}
