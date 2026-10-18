/**
 * Correctif écrans : le bas des écrans ne passe plus sous la barre du système Android
 * (application « bord à bord ») et le message (toast) ne mord plus sur le micro central.
 * Le rendu réel est vérifié par e2e/layout-audit.js ; ici, les règles de calcul.
 */
import { describe, expect, it } from 'vitest';
import { MIC_LIFT, footerInsets, tabBarHeight, tabLabelScale, toastBottom } from '../src/theme/layout';

const GESTES = 24;
const TROIS_BOUTONS = 48;

describe('pied d’écran : marge du système gérée une seule fois', () => {
  it('écran empilé : 16 dp + la barre du système sous le pied, que ce soit des gestes ou 3 boutons', () => {
    expect(footerInsets(TROIS_BOUTONS, false, false)).toEqual({ footerPad: TROIS_BOUTONS, keyboardOffset: TROIS_BOUTONS });
    expect(footerInsets(GESTES, false, false)).toEqual({ footerPad: GESTES, keyboardOffset: GESTES });
  });
  it('écran qui demande déjà la zone sûre du bas (9 écrans) : rien de plus sous le pied, même rendu qu’avant', () => {
    expect(footerInsets(TROIS_BOUTONS, true, false).footerPad).toBe(0);
  });
  it('sous les onglets : jamais deux fois (la barre d’onglets absorbe déjà la marge)', () => {
    expect(footerInsets(TROIS_BOUTONS, false, true)).toEqual({ footerPad: 0, keyboardOffset: 0 });
  });
  it('clavier ouvert : le pied redescend de la marge que le clavier recouvre — il colle au clavier, sans trou', () => {
    // Le clavier (hauteur K, barre du système comprise) est en bas de l'écran ; le pied le suit (−K)
    // puis redescend de keyboardOffset. Le bouton reste à 16 dp du clavier, quel que soit le cas.
    for (const inset of [0, GESTES, TROIS_BOUTONS]) {
      for (const safeArea of [false, true]) {
        const { footerPad, keyboardOffset } = footerInsets(inset, safeArea, false);
        const boxBottomAtRest = safeArea ? -inset : 0; // bas du pied, mesuré depuis le bas de l'écran
        const K = 300;
        const buttonBottom = boxBottomAtRest - K + keyboardOffset - 16 - footerPad;
        expect(buttonBottom).toBe(-K - 16);
      }
    }
  });
});

describe('message (toast) au-dessus du micro central', () => {
  it('hors onglets : inchangé (90 dp au-dessus de la marge du système)', () => {
    expect(toastBottom(0, null)).toBe(90);
    expect(toastBottom(TROIS_BOUTONS, null)).toBe(138);
  });
  it('onglets affichés : au-dessus du haut du micro, à toutes les tailles de texte (100 % à 160 %) et avec chaque barre système', () => {
    for (const width of [320, 360, 412]) {
      for (const fontScale of [1, 1.15, 1.3, 1.6, 2]) {
        for (const inset of [0, GESTES, TROIS_BOUTONS]) {
          const bar = tabBarHeight(tabLabelScale(width, fontScale), fontScale, inset);
          const micTop = bar + MIC_LIFT;
          expect(toastBottom(inset, bar)).toBeGreaterThanOrEqual(micTop + 8);
        }
      }
    }
  });
  it('avant le correctif, à 130 % le message (90 dp) touchait déjà le haut du micro', () => {
    const bar = tabBarHeight(tabLabelScale(360, 1.3), 1.3, 0);
    expect(90).toBeLessThanOrEqual(bar + MIC_LIFT);
  });
  it('hauteur de la barre : libellé agrandi jusqu’au plafond de 160 %, plus la marge du système', () => {
    expect(tabBarHeight(1, 1, 0)).toBe(62);
    expect(tabBarHeight(1, 1, TROIS_BOUTONS)).toBe(110);
    expect(tabBarHeight(1, 2, 0)).toBe(tabBarHeight(1, 1.6, 0));
  });
});
