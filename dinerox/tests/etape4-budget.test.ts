/**
 * Étape 4.4 — Budget (maquette validée) : résumé en UNE carte (chiffre, barre, Prévu / Dépensé /
 * Reste à répartir), alertes dans une carte, enveloppes en LISTE (« Libre » : sacs de courses),
 * ronds « Nouvelle enveloppe » / « Budget automatique ».
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { envelopeIconIds, iconSlugFor } from '../src/components/ui/contentIconMap';
import { buildDemoData } from '../src/core/demo';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('icône d’une enveloppe', () => {
  const demo = buildDemoData({ now: Date.parse('2026-10-15T08:00:00Z'), uid: 'u', today: '2026-10-15', label: (k: string) => k });
  const slug = (id: string) => iconSlugFor({ ids: envelopeIconIds(demo.envelopes.find((e) => e.id === id)!.categoryIds) });
  it('« Libre » (enveloppe fourre-tout qui contient « Autres ») : sacs de courses, plus 🎉', () => {
    expect(slug('demo_env_free')).toBe('shopping-bags');
  });
  it('les autres enveloppes gardent l’icône de leur première catégorie', () => {
    expect(slug('demo_env_fam')).toBe(iconSlugFor({ ids: ['cat_family'] }));
    expect(slug('demo_env_home')).toBe(iconSlugFor({ ids: ['cat_housing'] }));
  });
  it('pavé et ligne utilisent la même règle', () => {
    const src = read('src/features/budget/EnvelopeCard.tsx');
    expect(src.match(/ids=\{envelopeIconIds\(s\.envelope\.categoryIds\)\}/g)?.length).toBe(2);
  });
});

describe('écran Budget', () => {
  const src = read('src/app/(tabs)/budget.tsx');
  it('plus aucun pavé', () => {
    expect(src).not.toMatch(/<TileGrid|<Tile\b|InsightTile|EnvelopeTile/);
  });
  it('résumé en une carte : restant 34, barre 8, « Consommé », puis Prévu / Dépensé / Reste à répartir en lignes', () => {
    expect(src).toMatch(/function SummaryCard/);
    const card = src.slice(src.indexOf('function SummaryCard'));
    for (const k of ["t('budget.leftInEnvelopes')", "t('env.consumed'", "t('budget.planned')", "t('budget.spent')", "t('budget.toAllocateLabel')", "t('budget.unassigned')", "t('budget.debtRepayments'", "t('env.over'", "t('budget.toAllocateOver'", "t('child.askParent')"])
      expect(card).toContain(k);
    expect(card).toMatch(/fontSize: 34, lineHeight: 40/);
    expect(card).toMatch(/height=\{8\}/);
  });
  it('alertes : une carte, une ligne par alerte (icône, texte, chevron), « Écouter » gardé à côté', () => {
    expect(src).toMatch(/<AlertsCard insights=\{alerts\.slice\(0, 4\)\} \/>/);
    const rows = read('src/features/rows.tsx');
    const a = rows.slice(rows.indexOf('export function AlertsCard'));
    expect(a).toMatch(/chevron-forward/);
    expect(a).toMatch(/<ListenButton/);
  });
  it('enveloppes en liste, ronds « Nouvelle enveloppe » (vert, +) et « Budget automatique » (violet)', () => {
    expect(src).toMatch(/<ListCard>\s*\{envelopes\.map\(\(s\) => \(\s*<EnvelopeRow /);
    expect(src).toMatch(/<CircleGrid columns=\{2\}>/);
    expect(src).toMatch(/family="vert" icon="add" label=\{t\('env\.new'\)\}/);
    expect(src).toMatch(/family="violet" icon="sparkles" label=\{t\('budget\.auto'\)\}/);
  });
});
