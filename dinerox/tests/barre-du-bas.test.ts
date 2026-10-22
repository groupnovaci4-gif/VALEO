/**
 * Barre du bas EXACTEMENT comme la maquette finale (décision du fondateur, 22/10) :
 * docs/design-pro-maquette-finale/ecrans/accueil-{clair,sombre}.html, `.tab` :
 *   fond = --surface, bordure = --divider, onglet actif = --brand, inactif = --text3,
 *   pilule « Saisir » = --brand.
 * Clair : pilule #0F4A3A, micro blanc, fond crème #FFFCF7.
 * Sombre : pilule #4FB08F, micro FONCÉ, fond gris-brun #1D1B17 (jamais le bleu nuit #0B1120).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tabBarColors } from '../src/theme/layout';
import { contrastRatio } from '../src/theme/contrast';

describe('barre du bas : couleurs de la maquette', () => {
  it('clair : fond crème, pilule #0F4A3A, micro blanc, onglet actif vert de la marque', () => {
    expect(tabBarColors(false)).toEqual({ background: '#FFFCF7', border: '#EAE3D7', active: '#0F4A3A', inactive: '#6E6558', pill: '#0F4A3A', mic: '#FFFFFF' });
  });
  it('sombre : fond gris-brun (pas bleu nuit), pilule #4FB08F, micro foncé, onglet actif #4FB08F', () => {
    const c = tabBarColors(true);
    expect(c).toEqual({ background: '#1D1B17', border: '#2C2923', active: '#4FB08F', inactive: '#A0968A', pill: '#4FB08F', mic: '#0B2A21' });
    expect(c.background).not.toBe('#0B1120');
  });
  it('micro lisible sur la pilule (contraste ≥ 3 pour une icône)', () => {
    for (const dark of [false, true]) {
      const c = tabBarColors(dark);
      expect(contrastRatio(c.mic, c.pill)).toBeGreaterThanOrEqual(3);
    }
  });
  it('la barre et la pilule utilisent ces couleurs (et non les anciennes du thème)', () => {
    const tabs = readFileSync('src/app/(tabs)/_layout.tsx', 'utf8');
    expect(tabs).toMatch(/tabBarColors\(dark\)/);
    expect(tabs).not.toMatch(/colors\.tabBar/);
    const mic = tabs.slice(tabs.indexOf('function MicTabButton'));
    expect(mic).toMatch(/backgroundColor: bar\.pill/);
    expect(mic).toMatch(/color=\{bar\.mic\}/);
    expect(mic).not.toMatch(/#FFFFFF/);
  });
});
