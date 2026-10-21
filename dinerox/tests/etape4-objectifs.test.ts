/**
 * Étape 4.5 — Objectifs (maquette validée) : carte globale flottante, réserve et moment fort en
 * LIGNES, projets en LISTE avec « Ajouter » et ↑↓ sous chaque projet, répartition gardée.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('écran Objectifs', () => {
  const src = read('src/app/(tabs)/goals.tsx');
  it('direction B et carte globale flottante (barre 8, or #E8B85A)', () => {
    expect(src).toMatch(/<DesignV2>/);
    expect(src).toMatch(/<GradientCard float/);
    expect(src).toMatch(/height: 8, borderRadius: 4/);
    expect(src).toMatch(/backgroundColor: GLOBAL_BAR/);
    expect(src).toMatch(/const GLOBAL_BAR = '#E8B85A'/);
  });
  it('projets en liste : GoalRow avec « Priorité N » et rythme en étiquettes, « Ajouter » et ↑↓ dessous', () => {
    expect(src).not.toMatch(/<TileGrid|GoalTile|TileCell/);
    expect(src).toMatch(/<ListCard>/);
    expect(src).toMatch(/<GoalRow[\s\S]*chips=/);
    expect(src).toMatch(/t\('goal\.rank', \{ rank/);
    expect(src).toMatch(/footer=/);
    expect(src).toMatch(/accessibilityLabel=\{`\$\{t\('goal\.contribute'\)\}, \$\{g\.name\}`\}/);
    expect(src).toMatch(/label=\{t\('goal\.moveUp'\)\}/);
    expect(src).toMatch(/label=\{t\('goal\.moveDown'\)\}/);
  });
  it('répartition et objectifs terminés gardés', () => {
    expect(src).toMatch(/t\('goal\.distribute\.title'\)/);
    expect(src).toMatch(/<AmountField label=\{t\('goal\.distribute\.capacity'\)\}/);
    expect(src).toMatch(/t\('goal\.closed'\)/);
  });
});

describe('GoalRow : étiquettes à la place de la ligne « catégorie · date »', () => {
  it('chips (Priorité, rythme)', () => {
    const src = read('src/features/rows.tsx');
    const row = src.slice(src.indexOf('export function GoalRow'));
    expect(row).toMatch(/chips\?: \{ label: string; primary\?: boolean \}\[\]/);
  });
});

describe('icône d’une réserve', () => {
  it('emoji par défaut (🤝) : icône validée « famille + cœur » ; emoji choisi par la personne : gardé', async () => {
    const { reserveIcon, iconSlugFor } = await import('../src/components/ui/contentIconMap');
    expect(iconSlugFor(reserveIcon({ icon: '🤝', templateId: 'family_reserve' }))).toBe('famille_coeur_3d_medium-dark');
    expect(iconSlugFor(reserveIcon({ icon: '🎓', templateId: 'family_reserve' }))).toBe(iconSlugFor({ emoji: '🎓' }));
  });
});

describe('réserves et moment fort en lignes', () => {
  it('réserves : ListCard + ligne (icône de contenu, nom, solde à droite, barre, plafond · prévu par mois)', () => {
    const src = read('src/features/reserve/ReserveSection.tsx');
    expect(src).not.toMatch(/<TileGrid|<Tile\b/);
    expect(src).toMatch(/<ListCard>/);
    expect(src).toMatch(/<ContentIcon \{\.\.\.reserveIcon\(r\)\}/);
    expect(src).toMatch(/t\('reserve\.of'/);
    expect(src).toMatch(/t\('reserve\.monthlyPlan'/);
    expect(src).toMatch(/t\('reserve\.section\.hint'\)/);
  });
  it('moment fort : une ligne (icône de contenu, titre · date, phrase, chevron)', () => {
    const src = read('src/features/seasons/SeasonSection.tsx');
    expect(src).not.toMatch(/<Tile\b/);
    expect(src).toMatch(/<ContentIcon emoji=\{next\.icon\}/);
    expect(src).toMatch(/chevron-forward/);
    expect(src).toMatch(/t\('season\.add'\)/);
  });
});
