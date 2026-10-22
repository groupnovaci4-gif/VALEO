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
  // Refonte finale F1 (remplace les ronds pleins et la liste « Application » de l'étape 4.3) :
  // grille d'icônes PASTEL pour les quatre thèmes (tests/etape5-plus.test.ts). Mêmes informations.
  it('plus aucun pavé : rubriques en grille pastel dans des cartes, même famille de couleur', () => {
    expect(src).not.toMatch(/<TileGrid|<Tile\b/);
    expect(src).toMatch(/<PastelGrid/);
    expect(src).toMatch(/family: MORE_FAMILY\[i\.key\] \?\? 'vert'/);
  });
  it('description gardée pour le lecteur d’écran : même libellé qu’avant (« titre, description »)', () => {
    expect(src).toMatch(/accessibilityLabel: `\$\{t\(i\.key\)\}, \$\{t\(i\.sub\)\}`/);
  });
  it('titres de rubrique en surtitre (12, 600, espacement 0,6 ; l’ancienne information de droite lue par le lecteur d’écran)', () => {
    expect(src).toMatch(/weight="600" tone="muted" accessibilityRole="header"[^>]*style=\{\{ fontSize: 12, lineHeight: 16, letterSpacing: 0\.6 \}\}/);
  });
  it('rubriques verrouillées : l’étiquette « PRO » reste visible', () => {
    expect(src).toMatch(/badge: i\.locked \? 'PRO' : undefined/);
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
