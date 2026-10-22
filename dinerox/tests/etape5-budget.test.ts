/**
 * Refonte finale, étape 5 — BUDGET (DECISIONS.md C1, C2 ; FINAL-budget.png, ecrans/budget-*.html).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ringDash } from '../src/components/ui/ringDash';
import { BUBBLE_SIZES } from '../src/features/budget/envelopeBubble';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = read('src/app/(tabs)/budget.tsx');

describe('C1 — carte principale VERTE et FLOTTANTE', () => {
  it('carte verte flottante (même carte que l’accueil), anneau doré 112 dp (trait 11) « % consommé »', () => {
    expect(src).toMatch(/<GradientCard float/);
    expect(src).toMatch(/<ProgressRing size=\{112\} stroke=\{11\}[^>]*color="#E8B85A"[^>]*track="rgba\(255,255,255,0\.22\)"/);
    expect(src).toMatch(/t\('budget\.consumedShort'\)/);
    expect(ringDash(50.5, 90)).toBe('285.6 317.3');
  });
  it('Reste dans les enveloppes (28/34), Prévu, Dépensé, À répartir (montants sans devise)', () => {
    for (const k of ["t('budget.leftInEnvelopes')", "t('budget.planned')", "t('budget.spent')", "t('budget.toAllocateShort')"]) expect(src).toContain(k);
    expect(src).toMatch(/fontSize: 28, lineHeight: 34/);
    expect(src).toMatch(/hideSymbol: true/);
  });
  it('rien de perdu : dépassement écrit, reste à répartir négatif écrit, hors enveloppe, remboursements, enfant', () => {
    for (const k of ["t('env.over'", "t('budget.toAllocateOver'", "t('budget.unassigned')", "t('budget.debtRepayments'", "t('child.askParent')"]) expect(src).toContain(k);
  });
});

describe('C2 — onglets Enveloppes / Notifications (N), bulles, boutons', () => {
  it('onglets Enveloppes / Notifications (N)', () => {
    expect(src).toMatch(/t\('budget\.tab\.envelopes'\)/);
    expect(src).toMatch(/t\('budget\.tab\.notifications', \{ count: notifCount \}\)/);
    expect(src).toMatch(/accessibilityRole="tab"/);
  });
  it('enveloppes en bulles avec le % sous chacune (anneau 84 dp, trait 7, icône 38)', () => {
    expect(src).toMatch(/<EnvelopeBubbles [^>]*large[^>]*percent/);
    expect(BUBBLE_SIZES.large).toEqual({ ring: 84, stroke: 7, icon: 38, rowGap: 18, padV: 18 });
    expect(BUBBLE_SIZES.normal).toEqual({ ring: 76, stroke: 6, icon: 34, rowGap: 16, padV: 16 });
  });
  it('notifications du budget avec « Tout marquer comme lu » (même liste, mêmes règles)', () => {
    expect(src).toMatch(/<ToReadList budgetOnly \/>/);
  });
  it('boutons « Nouvelle » (enveloppe) et « Automatique »', () => {
    expect(src).toMatch(/t\('budget\.newShort'\)/);
    expect(src).toMatch(/t\('budget\.autoShort'\)/);
    expect(src).toMatch(/router\.push\('\/envelopes\/edit'\)/);
    expect(src).toMatch(/router\.push\('\/budget\/auto'\)/);
  });
  it('fiche d’enveloppe : « à venir » et part du revenu déclaré restent visibles', () => {
    const d = read('src/app/envelopes/[id].tsx');
    expect(d).toMatch(/t\('env\.upcoming'/);
    expect(d).toMatch(/t\('env\.shareOfDeclared'/);
  });
});

describe('nouveaux textes (FR et EN)', () => {
  const keys = {
    'budget.consumedShort': ['consommé', 'used'],
    'budget.toAllocateShort': ['À répartir', 'To allocate'],
    'budget.tab.envelopes': ['Enveloppes', 'Envelopes'],
    'budget.tab.notifications': ['Notifications ({count})', 'Notifications ({count})'],
    'budget.newShort': ['Nouvelle', 'New'],
    'budget.autoShort': ['Automatique', 'Automatic'],
  } as const;
  it.each(Object.entries(keys))('%s', (k, [f, e]) => {
    expect((fr as Record<string, string>)[k]).toBe(f);
    expect((en as Record<string, string>)[k]).toBe(e);
  });
});
