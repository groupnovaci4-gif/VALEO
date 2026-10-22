/**
 * Étape 4.2 — Accueil, suite (maquette validée, points 4 et 5) :
 *  - enveloppes actives et objectifs prioritaires en LISTE (une carte, une ligne par élément) ;
 *  - « Mes récompenses » et « DineroX IA » dans une carte, en deux ronds de couleur PLEINE
 *    (or / violet, palette de docs/design-pro-paves-plus), nom centré, informations gardées.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CIRCLE_PALETTE, circleColors, circleColumns } from '../src/components/ui/circlePalette';
import { contrastRatio } from '../src/theme/contrast';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('ronds de couleur pleine : palette exacte du fondateur', () => {
  it('familles, clair et sombre (docs/design-pro-paves-plus/README.md)', () => {
    expect(CIRCLE_PALETTE).toEqual({
      vert: ['#1E6B52', '#7FD1B0'],
      or: ['#9A6400', '#E8B85A'],
      rouge: ['#B3261E', '#F08A82'],
      terre: ['#B0502A', '#F09A75'],
      bleu: ['#2D5F8F', '#8DB8E3'],
      violet: ['#7B3F70', '#D79CCB'],
      whatsapp: ['#178A45', '#5FD38E'],
      gris: ['#55606A', '#B5BEC6'],
    });
  });
  it('icône pleine : blanche en clair, #13120F en sombre ; contraste ≥ 3:1 (objet graphique, AA)', () => {
    for (const fam of Object.keys(CIRCLE_PALETTE) as (keyof typeof CIRCLE_PALETTE)[]) {
      const l = circleColors(fam, false);
      const d = circleColors(fam, true);
      expect(l.fg).toBe('#FFFFFF');
      expect(d.fg).toBe('#13120F');
      expect(contrastRatio(l.fg, l.bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(d.fg, d.bg)).toBeGreaterThanOrEqual(3);
    }
  });
  it('grille : 3 colonnes ; 2 si le texte est agrandi ou l’écran fait moins de 340 dp', () => {
    expect(circleColumns(360, 1)).toBe(3);
    expect(circleColumns(339, 1)).toBe(2);
    expect(circleColumns(412, 1.3)).toBe(2);
  });
});

describe('accueil : enveloppes et objectifs en liste, récompenses et IA en ronds', () => {
  const home = read('src/app/(tabs)/index.tsx');
  it('plus de pavés sur l’accueil (ni enveloppes, ni objectifs, ni récompenses/IA)', () => {
    expect(home).not.toMatch(/<TileGrid/);
    expect(home).not.toMatch(/EnvelopeTile|GoalTile|RewardsTile/);
  });
  // Refonte finale (DECISIONS.md B7, B9 — remplace les points 4 et 5 de la maquette validée) :
  // enveloppes en BULLES, objectifs avec ANNEAUX, récompenses + IA en deux cartes (tests/etape5-accueil.test.ts).
  it('enveloppes : en bulles (6 au plus, comme la maquette), mêmes informations pour le lecteur d’écran', () => {
    expect(home).toMatch(/<EnvelopeBubbles items=\{envelopes\.slice\(0, 6\)\}/);
    const bub = read('src/features/budget/EnvelopeBubbles.tsx');
    for (const k of ["t('env.ofPercent'", "t('env.upcoming'", "t('env.shareOfDeclared'", "t('env.over'", "t('env.left'"]) expect(bub).toContain(k);
  });
  it('objectifs : une carte-liste de lignes GoalRingRow', () => {
    expect(home).toMatch(/<ListCard radius=\{20\}>\s*\{goals\.map\(\(\{ g, plan \}\) => \(\s*<GoalRingRow /);
  });
  it('récompenses (trophée) et IA (rond violet, bulle) : deux cartes, informations gardées', () => {
    expect(home).toMatch(/<RewardsCard \/>/);
    const card = read('src/features/home/RewardsCard.tsx');
    expect(card).toMatch(/name="chatbubble-ellipses"/);
    expect(card).toMatch(/t\('home\.ai\.title'\)/);
    expect(card).toMatch(/t\('home\.ai\.badge'\)/);
    expect(card).toMatch(/t\('home\.askAssistantHint'\)/);
    expect(card).toMatch(/t\('reward\.earned', \{ count: rewards\.length \}\)/);
  });
});

describe('lignes de liste : mêmes informations que les pavés', () => {
  it('EnvelopeRow : nom, reste, état écrit, barre 6 dp, « dépensé sur budget · % », à venir, part déclarée', () => {
    const src = read('src/features/budget/EnvelopeCard.tsx');
    const row = src.slice(src.indexOf('export function EnvelopeRow'));
    for (const k of ["t('env.ofPercent'", "t('env.upcoming'", "t('env.shareOfDeclared'", 'state', 'remaining']) expect(row).toContain(k);
    expect(row).toMatch(/height=\{6\}/);
    expect(row).toMatch(/accessibilityLabel=\{`\$\{s\.envelope\.name\}, \$\{remaining\}, \$\{state\}`\}/);
  });
  it('GoalRow : nom, catégorie · date, barre, montant / cible · %', () => {
    const src = read('src/features/rows.tsx');
    const row = src.slice(src.indexOf('export function GoalRow'));
    expect(row).toMatch(/monthYear\(goal\.targetDate\)/);
    expect(row).toMatch(/money\(plan\.saved\)/);
    expect(row).toMatch(/money\(plan\.target\)/);
    expect(row).toMatch(/plan\.percent/);
    expect(row).toMatch(/height=\{6\}/);
  });
});
