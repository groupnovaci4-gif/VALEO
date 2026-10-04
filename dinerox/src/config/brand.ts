/**
 * Identité de marque — SOURCE UNIQUE.
 *
 * Nom de l'application : DineroX. Pour la renommer, modifier ce
 * fichier (et `app.config.ts`, qui le lit) : aucun écran ne doit écrire le
 * nom, le slogan ou les couleurs de marque en dur.
 */
export const brand = {
  name: 'DineroX',
  /** Nom long affiché dans les écrans légaux. */
  legalName: 'DineroX',
  /** Identifiant technique (schéma d'URL, bundle). Changer aussi les stores. */
  slug: 'dinerox',
  scheme: 'dinerox',
  bundleId: 'com.dinerox.app',
  /** Lettre affichée dans le logo typographique tant qu'aucun logo n'existe. */
  logoLetter: 'D',
  supportEmail: 'support@dinerox.app',
  /** Couleurs du logo : D vert, flèche jaune, fond nuit. */
  colors: {
    green: '#2AB8A1',
    yellow: '#F8AE16',
    night: '#0D0D1C',
    primary: '#0D0D1C',
    accent: '#2AB8A1',
    splash: '#0D0D1C',
  },
} as const;

export type Brand = typeof brand;
