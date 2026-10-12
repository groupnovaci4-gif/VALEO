/**
 * Marque : lue dans la SOURCE UNIQUE de l'app (src/config/brand.ts), jamais recopiée.
 * Slogan : texte existant de l'app `auth.welcome.tagline` (D13, brand.ts n'a pas de slogan).
 */
import { brand } from '@app/config/brand';
import { fr } from '@app/i18n/fr';
import logo from '../../assets/logo.png';
import favicon from '../../assets/favicon.png';

export { brand };
export const TAGLINE = fr['auth.welcome.tagline'];
export const LOGO = logo;
export const FAVICON = favicon;

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/** Couleurs de marque → variables CSS (styles.css n'en contient aucune). */
export function applyBrand() {
  const r = document.documentElement.style;
  r.setProperty('--brandNight', brand.colors.night);
  r.setProperty('--brandGreen', brand.colors.green);
  r.setProperty('--brandGreenRgb', hexToRgb(brand.colors.green));
  r.setProperty('--brandGold', brand.colors.gold);
  document.title = `${brand.name} — Back-office`;
  const link = document.getElementById('favicon') as HTMLLinkElement | null;
  if (link) link.href = FAVICON;
}
