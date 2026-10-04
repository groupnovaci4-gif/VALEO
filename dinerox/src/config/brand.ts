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
  colors: {
    primary: '#0F172A',
    accent: '#16A34A',
    splash: '#0F172A',
  },
} as const;

export type Brand = typeof brand;
