/**
 * Refonte finale (docs/design-pro-maquette-finale, 2026-10-22) : couleurs EXACTES des écrans
 * `ecrans/*.html` qui ne sont pas des jetons de la direction B — tuiles pastel, pastilles des
 * messages « À lire », anneaux de progression. Une valeur par thème, relevée dans le HTML.
 */
export interface FinalPalette {
  /** Tuiles de l'accueil (B4) et icônes pastel : fond, icône. */
  blueBg: string;
  blueFg: string;
  greenBg: string;
  greenFg: string;
  goldBg: string;
  goldFg: string;
  /** Tuile « Parler » (vert plein). */
  brandTile: string;
  /** Messages : alerte (rouge), conseil (violet). */
  alertBg: string;
  alertFg: string;
  violetBg: string;
  violetFg: string;
  /** Rond « DineroX IA » (B9). */
  aiCircle: string;
  /** Anneaux : piste, vert « reste », or « épuisée », rouge « dépassé ». */
  ringTrack: string;
  ringOk: string;
  ringFull: string;
  ringOver: string;
  /** Montant positif (revenus, entrée). */
  positive: string;
}

export const finalLight: FinalPalette = {
  blueBg: '#DBE6F2',
  blueFg: '#2D5F8F',
  greenBg: '#DCEBE3',
  greenFg: '#1E6B52',
  goldBg: '#F5E6C4',
  goldFg: '#9A6400',
  brandTile: '#0F4A3A',
  alertBg: '#F6DAD7',
  alertFg: '#B3261E',
  violetBg: '#EEDDEA',
  violetFg: '#7B3F70',
  aiCircle: '#7B3F70',
  ringTrack: '#EAE3D7',
  ringOk: '#1E6B52',
  ringFull: '#9A6400',
  ringOver: '#B3261E',
  positive: '#1E7A45',
};

export const finalDark: FinalPalette = {
  blueBg: '#1E2D3D',
  blueFg: '#8DB8E3',
  greenBg: '#1E3A31',
  greenFg: '#7FD1B0',
  goldBg: '#3D3018',
  goldFg: '#E8B85A',
  brandTile: '#1F5C49',
  alertBg: '#42201D',
  alertFg: '#F08A82',
  violetBg: '#37223A',
  violetFg: '#D79CCB',
  aiCircle: '#D79CCB',
  ringTrack: '#2C2923',
  ringOk: '#7FD1B0',
  ringFull: '#E8B85A',
  ringOver: '#F08A82',
  positive: '#63C08A',
};

export const finalPalette = (dark: boolean): FinalPalette => (dark ? finalDark : finalLight);
