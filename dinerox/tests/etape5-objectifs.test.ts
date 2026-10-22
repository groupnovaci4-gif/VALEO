/**
 * Refonte finale, étape 6 — OBJECTIFS (DECISIONS.md D1 à D3 ; FINAL-objectifs.png, ecrans/objectifs-*.html).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ringDash } from '../src/components/ui/ringDash';
import { GOAL_TILE, goalTileFamily } from '../src/features/goals/goalTile';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = read('src/app/(tabs)/goals.tsx');

describe('D1 — « Objectifs » + « Nouveau », carte verte flottante « Épargne pour vos projets »', () => {
  it('titre et bouton « Nouveau »', () => {
    expect(src).toMatch(/t\('goal\.title'\)/);
    expect(src).toMatch(/t\('goal\.newShort'\)/);
    expect(src).toMatch(/router\.push\('\/goals\/new'\)/);
  });
  it('carte verte flottante : %, montant, visé, reste, barre dorée', () => {
    expect(src).toMatch(/<GradientCard float/);
    for (const k of ["t('goal.hero.title')", "t('goal.hero.of'"]) expect(src).toContain(k);
    expect(src).toMatch(/\{`\$\{totals\.pct\}\s%`\}/);
    expect(src).toMatch(/GLOBAL_BAR = '#E8B85A'/);
  });
});

describe('D2 — vignettes en 2 colonnes, ANNEAU autour de l’icône', () => {
  it('fond pastel par famille : projet vert, moment fort bleu, réserve or (clair | sombre)', () => {
    expect(goalTileFamily('goal')).toBe('green');
    expect(goalTileFamily('season')).toBe('blue');
    expect(goalTileFamily('reserve')).toBe('gold');
    expect(GOAL_TILE.light).toEqual({ track: 'rgba(255,255,255,0.7)', pill: 'rgba(255,255,255,0.75)' });
    expect(GOAL_TILE.dark).toEqual({ track: 'rgba(0,0,0,0.25)', pill: 'rgba(0,0,0,0.35)' });
  });
  it('anneau 92 dp (trait 8), icône 48, zone haute 118 dp, étiquette, nom, montants, rythme, %, bouton +', () => {
    const tile = read('src/features/goals/GoalTileCard.tsx');
    expect(tile).toMatch(/<ProgressRing size=\{92\} stroke=\{8\}/);
    expect(tile).toMatch(/size=\{48\}/);
    expect(tile).toMatch(/height: 118/);
    expect(tile).toMatch(/fontSize: 16[^}]*\}/);
    expect(tile).toMatch(/name="add"/);
    expect(ringDash(42, 38)).toBe('100.3 263.9');
  });
  it('projets, moment fort et réserve dans la même grille ; étiquettes Priorité N / Moment fort / Réserve', () => {
    expect(src).toMatch(/t\('goal\.rank', \{ rank \}\)/);
    expect(src).toMatch(/t\('goal\.tile\.season'\)/);
    expect(src).toMatch(/t\('goal\.tile\.reserve'\)/);
    expect(src).toMatch(/<GoalTileCard /);
  });
  it('rien de perdu : versement (+), fiche, moment fort (préparation), création de la réserve, en pause', () => {
    expect(src).toMatch(/\/goals\/contribute\?id=/);
    expect(src).toMatch(/\/reserve\/\$\{/);
    expect(src).toMatch(/'\/seasons'/);
    expect(src).toMatch(/'\/reserve\/new'/);
    expect(src).toMatch(/t\('goal\.status\.paused'\)/);
    expect(src).toMatch(/t\('season\.add'\)/);
  });
});

describe('D3 — « Ordre de priorité », aide de la réserve, « Répartir chaque mois »', () => {
  it('« Ordre de priorité » ouvre le réglage de l’ordre, les ↑↓ existants y restent', () => {
    expect(src).toMatch(/t\('goal\.priorityOrder'\)/);
    expect(src).toMatch(/<Sheet visible=\{orderOpen\}[^\n]*title=\{t\('goal\.priorityOrder'\)\}/);
    expect(src).toMatch(/t\('goal\.moveUp'\)/);
    expect(src).toMatch(/t\('goal\.moveDown'\)/);
    expect(src).toMatch(/actions\.reorderGoals\(ids\)/);
  });
  it('texte d’aide de la réserve', () => {
    expect(src).toMatch(/t\('reserve\.tile\.hint'\)/);
  });
  it('« Répartir chaque mois » : ce qui reste, barre, lignes, phrase ; le montant reste modifiable', () => {
    for (const k of ["t('goal.distribute.short')", "t('goal.distribute.capacity')", "t('goal.distribute.hint')", "t('goal.distribute.edit')"]) expect(src).toContain(k);
    expect(src).toMatch(/<AmountField label=\{t\('goal\.distribute\.capacity'\)\}/);
    expect(src).toMatch(/allocateCapacity\(/);
  });
});

describe('nouveaux textes (FR et EN)', () => {
  const keys = {
    'goal.newShort': ['Nouveau', 'New'],
    'goal.hero.title': ['Épargne pour vos projets', 'Savings for your projects'],
    'goal.hero.of': ['sur {target} visés · reste {left}', 'of {target} targeted · {left} to go'],
    'goal.projects': ['Vos projets', 'Your projects'],
    'goal.priorityOrder': ['Ordre de priorité', 'Priority order'],
    'goal.tile.season': ['Moment fort', 'Key moment'],
    'goal.tile.reserve': ['Réserve', 'Reserve'],
    'goal.perWeekChip': ['{amount} / sem.', '{amount} / wk'],
    'goal.distribute.short': ['Répartir chaque mois', 'Split each month'],
    'goal.distribute.edit': ['Modifier le montant', 'Change the amount'],
    'reserve.tile.hint': ['L’argent de la réserve famille n’est plus compté comme disponible.', 'Money in the family reserve is no longer counted as available.'],
  } as const;
  it.each(Object.entries(keys))('%s', (k, [f, e]) => {
    expect((fr as Record<string, string>)[k]).toBe(f);
    expect((en as Record<string, string>)[k]).toBe(e);
  });
});
