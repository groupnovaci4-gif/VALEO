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
  // Refonte finale C1 (remplace le résumé de l'étape 4.4) : carte VERTE flottante avec anneau
  // (tests/etape5-budget.test.ts) ; les mêmes informations restent présentes.
  it('résumé en une carte : restant, « consommé », Prévu / Dépensé / À répartir, et tout ce qui était écrit', () => {
    expect(src).toMatch(/function SummaryCard/);
    const card = src.slice(src.indexOf('function SummaryCard'));
    for (const k of ["t('budget.leftInEnvelopes')", "t('env.consumed'", "t('budget.planned')", "t('budget.spent')", "t('budget.toAllocateShort')", "t('budget.unassigned')", "t('budget.debtRepayments'", "t('env.over'", "t('budget.toAllocateOver'", "t('child.askParent')"])
      expect(card).toContain(k);
    expect(card).toMatch(/<ProgressRing size=\{112\}/);
  });
  // Refonte finale C2 / E3 : les alertes du budget sont les notifications du Budget (mêmes règles
  // que « À lire ») — une carte, une ligne par message, « Écouter » à côté (tests/etape5-notifications.test.ts).
  it('alertes : une carte, une ligne par message (icône, texte), « Écouter » gardé à côté', () => {
    expect(src).toMatch(/<ToReadList budgetOnly \/>/);
    const list = read('src/features/notifications/ToReadList.tsx');
    expect(list).toMatch(/<ListenButton/);
  });
  // Refonte finale C2 : enveloppes en BULLES, boutons « Nouvelle » et « Automatique » (mêmes actions).
  it('enveloppes en bulles, boutons « Nouvelle » (enveloppe) et « Automatique »', () => {
    expect(src).toMatch(/<EnvelopeBubbles items=\{envelopes\} large percent/);
    expect(src).toMatch(/accessibilityLabel=\{t\('env\.new'\)\}/);
    expect(src).toMatch(/accessibilityLabel=\{t\('budget\.auto'\)\}/);
  });
});
