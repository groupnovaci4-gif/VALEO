/**
 * Étape 4.3 — Plus (maquette validée, points 3 et 4 ; palette : docs/design-pro-paves-plus) :
 * carte verte flottante ; rubriques regroupées dans des cartes, ronds de couleur pleine (icône
 * Ionicons pleine), 3 colonnes (2 si texte agrandi ou écran < 340 dp), sans description visible
 * (gardée pour le lecteur d'écran) ; rubrique « Application » en liste.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MORE_FAMILY } from '../src/features/more/menuFamilies';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('couleur de chaque rubrique (tableau du fondateur)', () => {
  it('familles exactes', () => {
    expect(MORE_FAMILY).toEqual({
      'history.menu': 'vert',
      'acc.title': 'vert',
      'sav.title': 'vert',
      'intel.title': 'vert',
      'score.cta': 'vert',
      'tontine.title': 'or',
      'nw.title': 'or',
      'fi.title': 'or',
      'reward.title': 'or',
      'notif.title': 'or',
      'more.review': 'or',
      'obl.title': 'rouge',
      'debt.title': 'rouge',
      'season.title': 'terre',
      'fam.title': 'terre',
      'ref.title': 'terre',
      'sim.title': 'bleu',
      'rec.title': 'bleu',
      'cal.title': 'bleu',
      'rep.title': 'bleu',
      'ai.title': 'violet',
      'cat.title': 'violet',
      'sub.title': 'violet',
      'more.whatsappChannel': 'whatsapp',
      'set.title': 'gris',
      'admin.title': 'gris',
    });
  });
});

describe('écran Plus', () => {
  const src = read('src/app/(tabs)/more.tsx');
  it('direction B (DesignV2) et carte verte flottante', () => {
    expect(src).toMatch(/<DesignV2>/);
    expect(src).toMatch(/<GradientCard float/);
  });
  it('plus aucun pavé : rubriques en ronds dans des cartes, « Application » en liste', () => {
    expect(src).not.toMatch(/<TileGrid|<Tile\b/);
    expect(src).toMatch(/<CircleGrid[ >]/);
    expect(src).toMatch(/<CircleTile[\s\S]*family=\{MORE_FAMILY\[i\.key\]/);
    expect(src).toMatch(/<ListCard[ >]/);
    expect(src).toMatch(/<MenuRow/);
  });
  it('description gardée pour le lecteur d’écran : même libellé qu’avant (« titre, description »)', () => {
    const n = src.match(/accessibilityLabel=\{`\$\{t\(i\.key\)\}, \$\{t\(i\.sub\)\}`\}/g) ?? [];
    expect(n.length).toBeGreaterThanOrEqual(2);
  });
  it('titres de rubrique en surtitre (12, 600, espacement 0,8 ; à droite 12)', () => {
    expect(src).toMatch(/<SectionHeader overline /);
    const row = read('src/components/ui/Row.tsx');
    expect(row).toMatch(/weight="600" accessibilityRole="header" style=\{\{ fontSize: 12, lineHeight: 16, letterSpacing: 0\.8/);
  });
  it('rubriques verrouillées : l’étiquette « PRO » reste visible', () => {
    expect(src).toMatch(/badge=\{i\.locked \? 'PRO' : undefined\}/);
  });
});

describe('ronds de l’écran Plus et ligne de liste (valeurs CSS de la maquette)', () => {
  const src = read('src/components/ui/Circles.tsx');
  it('cellule « dense » : nom 12/15, écart 8', () => {
    expect(src).toMatch(/dense \? \{ fontSize: 12, lineHeight: 15 \}/);
  });
  it('MenuRow : rond 36, titre 14,5, description 12,5/16 sur 2 lignes au plus, chevron', () => {
    const row = src.slice(src.indexOf('export function MenuRow'));
    expect(row).toMatch(/size=\{36\}/);
    expect(row).toMatch(/fontSize: 14\.5/);
    expect(row).toMatch(/fontSize: 12\.5, lineHeight: 16/);
    expect(row).toMatch(/numberOfLines=\{2\}/);
    expect(row).toMatch(/chevron-forward/);
  });
});
