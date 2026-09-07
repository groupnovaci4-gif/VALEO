// Où l'application va chercher son API — Phase 5 de la migration.
//
// LE PROBLÈME QUE CE MODULE RÉSOUT
// `EXPO_PUBLIC_BACKEND_URL` est **figée au build** par Expo (invariant 27).
// Sur un APK c'est inévitable : un téléphone n'a pas d'origine, il lui faut
// une adresse absolue, et changer la variable côté serveur ne change rien à un
// APK déjà construit — il faut reconstruire.
//
// Sur le **web servi par Firebase Hosting**, c'est différent : Hosting renvoie
// `/api/**` vers Cloud Run (voir `firebase.json`). L'API est donc à la MÊME
// ORIGINE que la page. Y figer une URL absolue serait doublement mauvais :
//
//   * il faudrait reconstruire le site à chaque changement d'adresse du
//     backend, alors que la redirection de Hosting suffit ;
//   * on repasserait par une requête inter-origine, donc par CORS, pour
//     joindre un service qui répond déjà sous le même nom de domaine.
//
// D'où la règle : sur le web, une variable **absente** ne veut pas dire « pas
// de serveur », elle veut dire « le serveur est ici ». Sur mobile, une variable
// absente veut bien dire « aucun serveur » — et l'application doit le DIRE
// (invariant 27), pas synchroniser dans le vide.
//
// Module PUR : aucun import d'exécution, tout arrive en paramètre.

export type ModeBackend = "absolu" | "meme-origine" | "aucun";

export type Backend = {
  /** Préfixe à coller devant `/api/...`. Vide en mode même-origine. */
  base: string;
  mode: ModeBackend;
  /** Ce qu'on affiche à l'utilisateur dans « Connexion au serveur ». */
  libelle: string;
  /** Faux uniquement quand il n'y a réellement aucun serveur à joindre. */
  joignable: boolean;
};

const AUCUN: Backend = { base: "", mode: "aucun", libelle: "AUCUN", joignable: false };

/**
 * @param url    valeur de `EXPO_PUBLIC_BACKEND_URL` (figée au build)
 * @param web    l'application tourne-t-elle dans un navigateur ?
 * @param origin origine de la page (`location.origin`), pour l'affichage seul
 */
export function resoudreBackend(url: string | undefined | null, web: boolean,
                                origin?: string | null): Backend {
  const brut = (url || "").trim();
  if (brut) {
    // Une barre finale doublerait la barre du chemin (`https://x//api/state`).
    // Certains serveurs répondent 404 là-dessus : on la retire.
    const base = brut.replace(/\/+$/, "");
    return { base, mode: "absolu", libelle: base, joignable: true };
  }
  if (!web) return AUCUN;
  // Web sans URL configurée : l'API est servie par la même origine, via la
  // redirection de Hosting. C'est le mode NORMAL d'un déploiement Firebase.
  return {
    base: "",
    mode: "meme-origine",
    libelle: origin ? `${origin} (même origine)` : "même origine",
    joignable: true,
  };
}
