/**
 * Identité de marque — SOURCE UNIQUE.
 *
 * « KAP » est un nom de travail. Pour renommer l'application, modifier ce
 * fichier (et `app.config.ts`, qui le lit) : aucun écran ne doit écrire le
 * nom, le slogan ou les couleurs de marque en dur.
 */
export const brand = {
  name: 'KAP',
  /** Nom long affiché dans les écrans légaux. */
  legalName: 'KAP',
  /** Identifiant technique (schéma d'URL, bundle). Changer aussi les stores. */
  slug: 'kap',
  scheme: 'kap',
  bundleId: 'com.kap.app',
  /** Lettre affichée dans le logo typographique tant qu'aucun logo n'existe. */
  logoLetter: 'K',
  supportEmail: 'support@kap.app',
  colors: {
    primary: '#0F172A',
    accent: '#16A34A',
    splash: '#0F172A',
  },
} as const;

export type Brand = typeof brand;
