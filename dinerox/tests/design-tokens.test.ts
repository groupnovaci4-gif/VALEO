import { describe, expect, it } from 'vitest';
import { darkColorsV2, lightColorsV2, pickableColors, type ColorSchemeV2 } from '../src/theme/tokens';
import { contrastRatio, glyphOn } from '../src/theme/contrast';
import { tabLabelScale, tabLayout } from '../src/theme/layout';
import { splitAmount } from '../src/components/ui/amountText';
import { formatMoney } from '../src/core/money';

type Role = keyof ColorSchemeV2;
/** [texte ou élément, fond, minimum] — docs/design-system.md §1.2. */
const PAIRS: [Role, Role, number][] = [
  ['text', 'background', 4.5], ['text', 'surface', 4.5], ['textMuted', 'surface', 4.5], ['textMuted', 'surfaceAlt', 4.5],
  ['textSubtle', 'surface', 4.5], ['textSubtle', 'surfaceAlt', 4.5], ['textSubtle', 'background', 4.5],
  ['borderStrong', 'surface', 3], ['borderStrong', 'background', 3],
  ['primary', 'surface', 4.5], ['primary', 'background', 4.5], ['onPrimary', 'primary', 4.5], ['onPrimary', 'primaryPressed', 4.5],
  ['onPrimaryContainer', 'primaryContainer', 4.5], ['primary', 'primaryContainer', 4.5],
  ['accent', 'surface', 4.5], ['onAccentContainer', 'accentContainer', 4.5], ['accent', 'warningBg', 4.5],
  ['income', 'surface', 4.5], ['expense', 'surface', 4.5], ['expense', 'surfaceAlt', 4.5],
  ['success', 'successBg', 4.5], ['warning', 'warningBg', 4.5], ['danger', 'dangerBg', 4.5], ['info', 'infoBg', 4.5],
  ['text', 'successBg', 4.5], ['text', 'warningBg', 4.5], ['text', 'dangerBg', 4.5], ['text', 'infoBg', 4.5],
  ['income', 'successBg', 3], ['expense', 'dangerBg', 3], ['onAccentContainer', 'accentContainer', 3],
  ['onDanger', 'danger', 4.5], ['onSuccess', 'success', 4.5],
  ['onHero', 'heroFrom', 4.5], ['onHero', 'heroTo', 4.5], ['onHeroMuted', 'heroFrom', 4.5], ['onHeroMuted', 'heroTo', 4.5],
  ['onDisabled', 'disabledBg', 3], ['onInverse', 'inverseSurface', 4.5],
  ['chartIncome', 'surface', 3], ['chartExpense', 'surface', 3],
  ['primary', 'track', 3], ['danger', 'track', 3], ['warning', 'track', 3],
  ['onMedal', 'medalGold', 3], ['onMedal', 'medalSilver', 3], ['onMedal', 'medalBronze', 3],
];

describe('design system v2 : contrastes (WCAG 2.1)', () => {
  for (const [name, c] of [['clair', lightColorsV2], ['sombre', darkColorsV2]] as const) {
    it(`thème ${name} : aucune paire sous son seuil`, () => {
      const fails = PAIRS.map(([fg, bg, min]) => ({ pair: `${fg}/${bg}`, ratio: contrastRatio(c[fg] as string, c[bg] as string, c.surface), min })).filter((r) => r.ratio < r.min);
      expect(fails).toEqual([]);
    });
  }
  it('calcul de référence : noir sur blanc = 21, blanc sur blanc = 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('pastilles de couleur choisie : glyphe lisible', () => {
  it('glyphe blanc ou encre ≥ 4:1 sur toutes les couleurs proposées', () => {
    for (const c of pickableColors) expect(contrastRatio(glyphOn(c), c), c).toBeGreaterThanOrEqual(4);
  });
  it('choisit le blanc sur une couleur foncée et l’encre sur une couleur claire', () => {
    expect(glyphOn('#334155')).toBe('#FFFFFF');
    expect(glyphOn('#EAB308')).not.toBe('#FFFFFF');
  });
});

describe('montants : devise affichée à part', () => {
  it('sépare le nombre et la devise d’un montant formaté', () => {
    expect(splitAmount(formatMoney(125000000, 'XOF'))).toEqual({ number: formatMoney(125000000, 'XOF').replace(/ FCFA$/, ''), currency: 'FCFA' });
    expect(splitAmount(formatMoney(-250000, 'XOF')).currency).toBe('FCFA');
  });
  it('laisse d’un bloc un texte sans devise suffixée', () => {
    expect(splitAmount('••••••')).toEqual({ number: '••••••', currency: null });
    expect(splitAmount('1 250')).toEqual({ number: '1 250', currency: null });
  });
});

describe('barre d’onglets : libellés au texte agrandi', () => {
  it('pleine taille à 360 dp jusqu’à 160 %, et à 320 dp jusqu’à 130 %', () => {
    expect(tabLabelScale(360, 1.6)).toBe(1);
    expect(tabLabelScale(320, 1.3)).toBe(1);
    expect(tabLabelScale(320, 1)).toBe(1);
  });
  it('repli à 85 % sur 320 dp à 160 % (et au-delà, le plafond reste 160 %)', () => {
    expect(tabLabelScale(320, 1.6)).toBe(0.85);
    expect(tabLabelScale(320, 2)).toBe(0.85);
  });
});

describe('barre d’onglets : emplacements proportionnels aux libellés mesurés', () => {
  // Largeurs mesurées dans Chrome (Inter 600) à 160 % : Accueil, Budget, Saisir, Objectifs, Plus.
  const at160 = [67, 65, 50, 81, 38];
  const mins = [24, 24, 56, 24, 24];
  it('à 360 dp : tout tient à pleine taille, « Objectifs » a l’emplacement le plus large', () => {
    const r = tabLayout(at160, mins, 360);
    expect(r.scale).toBe(1);
    expect(Math.max(...r.weights)).toBe(r.weights[3]);
  });
  it('à 320 dp : repli à 85 %, et chaque emplacement reste assez large pour son libellé réduit', () => {
    const r = tabLayout(at160, mins, 320);
    expect(r.scale).toBe(0.85);
    const total = r.weights.reduce((a, b) => a + b, 0);
    r.weights.forEach((w, i) => expect((w / total) * 320).toBeGreaterThanOrEqual(Math.max(at160[i] * 0.85, mins[i])));
  });
});
