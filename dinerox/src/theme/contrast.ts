/**
 * Contraste des couleurs (WCAG 2.1) — module pur, testé (tests/design-tokens.test.ts).
 * Sert à vérifier la palette v2 et à choisir le glyphe d'une pastille dont la
 * couleur est choisie par l'utilisateur (comptes, enveloppes, catégories).
 */

type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

/** Couleur opaque : un `rgba()` est mélangé au fond `base` (hexadécimal). */
export function toRGB(color: string, base = '#FFFFFF'): RGB {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return parseHex(color);
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  const o = parseHex(base);
  return [r, g, b].map((v, i) => Math.round(v * a + o[i] * (1 - a))) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const hexOf = (c: RGB) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;

/** Rapport de contraste entre un texte (ou glyphe) et son fond ; `base` : fond sous un fond transparent. */
export function contrastRatio(fg: string, bg: string, base = '#FFFFFF'): number {
  const back = toRGB(bg, base);
  const front = toRGB(fg, hexOf(back));
  const a = luminance(front);
  const b = luminance(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Encre des glyphes posés sur une couleur claire. */
export const GLYPH_INK = '#121A17';

/** Glyphe blanc ou encre : celui qui contraste le plus avec la couleur de la pastille. */
export function glyphOn(color: string): string {
  return contrastRatio('#FFFFFF', color) >= contrastRatio(GLYPH_INK, color) ? '#FFFFFF' : GLYPH_INK;
}
