/**
 * Refonte finale, étape 9 — ENSEMBLE (DECISIONS.md A1, A2, A7, A8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lightColorsV2, darkColorsV2 } from '../src/theme/tokens';
import { heroFloat } from '../src/components/ui/heroFloat';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const TABS = ['index', 'budget', 'goals', 'more'].map((n) => [n, read(`src/app/(tabs)/${n}.tsx`)] as const);

describe('A1 — couleurs, polices, aucun dégradé', () => {
  it('fond sable en clair, fond sombre actuel en sombre ; vert uni', () => {
    expect(lightColorsV2.background).toBe('#F4F1EA');
    expect(darkColorsV2.background).toBe('#13120F');
    expect(lightColorsV2.heroTo).toBe(lightColorsV2.heroFrom);
  });
  it('aucun dégradé dans les écrans refaits', () => {
    for (const [n, src] of TABS) expect(src, n).not.toMatch(/LinearGradient|linear-gradient/);
  });
});

describe('A2 — en-tête identique sur les quatre onglets', () => {
  const h = read('src/components/AppHeader.tsx');
  const v2 = h.slice(h.indexOf('if (v2)'), h.indexOf('return (\n    <View style={{ flexDirection'));
  it('« Démo ▾ » (choix de l’espace) en texte simple, cloche avec pastille, petit avatar rond (32)', () => {
    expect(v2).toMatch(/<SpaceMenu \/>/);
    expect(v2).toMatch(/useToReadCount\(\)|toRead/);
    expect(v2).toMatch(/width: 32, height: 32, borderRadius: 16/);
  });
  it('plus de bandeau « DineroX » ni de bouton encadré', () => {
    expect(v2).not.toMatch(/<Logo /);
    expect(v2).not.toMatch(/brand\.name/);
    const menu = h.slice(h.indexOf('function SpaceMenu'));
    expect(menu).not.toMatch(/borderWidth/);
    expect(menu).toMatch(/fontSize: 15, lineHeight: 20/);
  });
  it('les quatre onglets : le même en-tête, plus de sélecteur encadré dans la page', () => {
    for (const [n, src] of TABS) {
      expect(src, n).toMatch(/<Screen brandSection=/);
      expect(src, n).not.toMatch(/<SpaceSwitcher \/>/);
    }
  });
});

describe('A7 — cartes vertes flottantes (Accueil, Budget, Objectifs, Plus)', () => {
  it('marges 8, rayon 22, ombre verte en clair ; liseré clair + ombre noire + halo vert en sombre', () => {
    expect(heroFloat(false).marginHorizontal).toBe(8);
    expect(heroFloat(false).borderRadius).toBe(22);
    expect(heroFloat(true).boxShadow).toContain('rgba(79,176,143,0.16)');
    expect(read('src/features/entry/DailyAllowanceCard.tsx')).toMatch(/<GradientCard float/);
    for (const n of ['budget', 'goals', 'more']) expect(read(`src/app/(tabs)/${n}.tsx`), n).toMatch(/<GradientCard float/);
  });
});

describe('A8 — aucun texte coupé, texte agrandi ou petit écran : moins de colonnes', () => {
  it('aucun « … » forcé sur un nom (numberOfLines) dans les nouveaux composants', () => {
    for (const f of ['src/features/home/QuickTiles.tsx', 'src/features/home/RecentByDay.tsx', 'src/features/budget/EnvelopeBubbles.tsx', 'src/features/goals/GoalTileCard.tsx', 'src/components/ui/PastelGrid.tsx', 'src/features/notifications/ToReadList.tsx', 'src/features/home/MonthStats.tsx', 'src/features/home/RewardsCard.tsx'])
      expect(read(f), f).not.toMatch(/numberOfLines/);
  });
  it('grilles : moins de colonnes si texte ≥ 1,3 ou écran < 340 dp', () => {
    for (const f of ['src/features/home/QuickTiles.tsx', 'src/features/budget/EnvelopeBubbles.tsx', 'src/features/home/MonthStats.tsx', 'src/features/home/RewardsCard.tsx', 'src/app/(tabs)/goals.tsx'])
      expect(read(f), f).toMatch(/BIG_TEXT/);
    expect(read('src/components/ui/PastelGrid.tsx')).toMatch(/pastelColumns\(width, fontScale\)/);
  });
});

describe('Étape 10 — audit de mise en page (layout-audit, toutes tailles)', () => {
  it('cloche : icône et pastille décoratives (aria-hidden) ; le bouton porte « Notifications, À lire · N »', () => {
    const h = read('src/components/AppHeader.tsx');
    expect(h).toMatch(/<View aria-hidden[^>]*>\s*<Icon name="notifications-outline"/);
  });
  it('« Écouter » de « À lire » : pas plus large que sa carte (conteneur à la taille du bouton)', () => {
    const l = read('src/features/notifications/ToReadList.tsx');
    expect(l).toMatch(/alignSelf: 'flex-start', marginLeft: -8 \}\}>\s*<ListenButton text=\{x\.text\} onEnd/);
  });
});

describe('Étape 10 — anneau de progression : aucune propriété native transmise au <svg> du web', () => {
  // e2e (forms-audit, coach-budget) : `importantForAccessibility` posé sur <Svg> arrivait au DOM ;
  // React affichait un avertissement dont la bulle recouvrait le bouton « Enregistrer ».
  it('le masquage pour le lecteur d’écran est porté par la View qui entoure le dessin', () => {
    const src = read('src/components/ui/ProgressRing.tsx');
    expect(src).not.toMatch(/<Svg[^>]*(importantForAccessibility|accessibilityElementsHidden)/);
    expect(src).toMatch(/<View[^>]*importantForAccessibility="no-hide-descendants"[^>]*>\s*<Svg/);
  });
});
