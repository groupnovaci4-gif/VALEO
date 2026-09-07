// Session Firebase côté application — Phase 2 de la migration.
//
// POURQUOI PAS LE SDK FIREBASE
// Le SDK JS pèse plusieurs centaines de kilo-octets et tire des dépendances
// natives. VALEO tourne sur des téléphones d'entrée de gamme, en brousse, et
// tout ce dont on a besoin ici tient en deux appels REST publics et documentés :
// échanger le jeton personnalisé contre un jeton d'identité, puis le
// renouveler. Aucune dépendance ajoutée, aucun plugin de build Expo.
//
// POURQUOI LE JETON VALEO RESTE LA SESSION DE RÉFÉRENCE
// Un jeton d'identité Firebase vit UNE HEURE et se renouvelle par le réseau.
// Un pisteur passe des jours en tournée sans réseau : s'il n'avait que
// Firebase, il serait déconnecté au bout d'une heure, loin de tout, avec ses
// pesées non synchronisées. On garde donc le jeton VALEO de 30 jours comme
// filet, et on présente le jeton Firebase seulement quand il est frais.
// Firebase apporte la session courte et révocable ; VALEO garde ce qui fait
// tenir le hors-ligne. Les deux sont acceptés par le serveur.
//
// Module PUR : aucun import d'exécution, `fetch` est injecté. Testable par Node.

export type SessionFirebase = {
  idToken: string;
  refreshToken: string;
  /** Instant d'expiration, en millisecondes epoch. */
  expireA: number;
};

/** Marge avant expiration : on renouvelle sans attendre le dernier moment. */
export const MARGE_MS = 5 * 60 * 1000;

const ECHANGE = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
const RENOUVELLEMENT = "https://securetoken.googleapis.com/v1/token";

/** Le jeton est-il encore présentable au serveur ? */
export function jetonUtilisable(s: SessionFirebase | null, maintenant = Date.now()): boolean {
  return !!s && !!s.idToken && s.expireA > maintenant;
}

/** Faut-il le renouveler ? Vrai aussi quand il est déjà expiré. */
export function doitRenouveler(s: SessionFirebase | null, maintenant = Date.now()): boolean {
  return !!s && !!s.refreshToken && s.expireA - maintenant <= MARGE_MS;
}

/** Construit la session à partir d'une réponse d'Identity Toolkit. */
export function sessionDepuis(rep: any, maintenant = Date.now()): SessionFirebase | null {
  const idToken = rep?.idToken || rep?.id_token;
  const refreshToken = rep?.refreshToken || rep?.refresh_token;
  const secondes = Number(rep?.expiresIn ?? rep?.expires_in);
  if (!idToken || !refreshToken || !Number.isFinite(secondes) || secondes <= 0) return null;
  return { idToken, refreshToken, expireA: maintenant + secondes * 1000 };
}

type Fetch = (url: string, init: any) => Promise<any>;

async function poster(f: Fetch, url: string, apiKey: string, corps: any): Promise<any | null> {
  try {
    const r = await f(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (!r || !r.ok) return null;
    return await r.json();
  } catch {
    // Hors-ligne : ce n'est pas une erreur, c'est le cas normal en tournée.
    return null;
  }
}

/** Échange le jeton personnalisé frappé par le serveur contre une session. */
export async function echanger(f: Fetch, apiKey: string, jetonPersonnalise: string,
                               maintenant = Date.now()): Promise<SessionFirebase | null> {
  if (!apiKey || !jetonPersonnalise) return null;
  const rep = await poster(f, ECHANGE, apiKey, { token: jetonPersonnalise, returnSecureToken: true });
  return sessionDepuis(rep, maintenant);
}

/** Renouvelle une session arrivée près de l'expiration. */
export async function renouveler(f: Fetch, apiKey: string, s: SessionFirebase,
                                 maintenant = Date.now()): Promise<SessionFirebase | null> {
  if (!apiKey || !s?.refreshToken) return null;
  const rep = await poster(f, RENOUVELLEMENT, apiKey,
                           { grant_type: "refresh_token", refresh_token: s.refreshToken });
  return sessionDepuis(rep, maintenant);
}
