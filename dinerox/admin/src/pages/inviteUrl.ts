/** Adresses d'invitation — fonctions PURES (testées). */
export const inviteUrl = (inviteId: string, token: string, origin: string) => `${origin}/invitation?i=${encodeURIComponent(inviteId)}#t=${encodeURIComponent(token)}`;

/** Lit l'identifiant et le jeton : jeton dans la partie « # » (lien copié) ou en paramètre (lien de suite d'e-mail). */
export function parseInviteUrl(href: string): { inviteId: string; token: string } | null {
  try {
    const u = new URL(href);
    const inviteId = u.searchParams.get('i') ?? '';
    const token = new URLSearchParams(u.hash.replace(/^#/, '')).get('t') ?? u.searchParams.get('t') ?? '';
    return inviteId && token ? { inviteId, token } : null;
  } catch {
    return null;
  }
}
