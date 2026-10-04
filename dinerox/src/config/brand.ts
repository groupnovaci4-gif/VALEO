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
  /** Charte « Sovereign Apex » : vert émeraude dominant, or impérial en accent, fond nuit. */
  colors: {
    green: '#14B8A6',
    greenDeep: '#0D9488',
    yellow: '#F59E0B',
    gold: '#FBBF24',
    night: '#020617',
    primary: '#020617',
    accent: '#14B8A6',
    splash: '#020617',
  },
} as const;

export type Brand = typeof brand;
