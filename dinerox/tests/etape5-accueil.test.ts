/**
 * Refonte finale, étape 3 — ACCUEIL (DECISIONS.md B1 à B9 ; FINAL-accueil.png,
 * FINAL-accueil-mis-de-cote-deplie.png ; valeurs exactes : ecrans/accueil-*.html).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalDark, finalLight } from '../src/theme/finalPalette';
import { ringDash } from '../src/components/ui/ringDash';
import { dayLabel, groupByDay } from '../src/features/home/dayGroups';
import { bubbleLook } from '../src/features/budget/envelopeBubble';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('couleurs exactes du HTML de la maquette (clair | sombre)', () => {
  it('tuiles : Historique bleu pâle, Revenu vert pâle, Transfert or pâle, Parler vert plein', () => {
    expect([finalLight.blueBg, finalLight.greenBg, finalLight.goldBg, finalLight.brandTile]).toEqual(['#DBE6F2', '#DCEBE3', '#F5E6C4', '#0F4A3A']);
    expect([finalDark.blueBg, finalDark.greenBg, finalDark.goldBg, finalDark.brandTile]).toEqual(['#1E2D3D', '#1E3A31', '#3D3018', '#1F5C49']);
    expect([finalLight.blueFg, finalLight.greenFg, finalLight.goldFg]).toEqual(['#2D5F8F', '#1E6B52', '#9A6400']);
    expect([finalDark.blueFg, finalDark.greenFg, finalDark.goldFg]).toEqual(['#8DB8E3', '#7FD1B0', '#E8B85A']);
  });
  it('anneaux : piste, reste (vert), épuisée (or), dépassé (rouge)', () => {
    expect([finalLight.ringTrack, finalLight.ringOk, finalLight.ringFull, finalLight.ringOver]).toEqual(['#EAE3D7', '#1E6B52', '#9A6400', '#B3261E']);
    expect([finalDark.ringTrack, finalDark.ringOk, finalDark.ringFull, finalDark.ringOver]).toEqual(['#2C2923', '#7FD1B0', '#E8B85A', '#F08A82']);
  });
  it('rond « DineroX IA » : violet #7B3F70 (clair), #D79CCB (sombre)', () => {
    expect([finalLight.aiCircle, finalDark.aiCircle]).toEqual(['#7B3F70', '#D79CCB']);
  });
});

describe('anneau de progression : même trait que la maquette', () => {
  it('enveloppes (r = 35) et objectifs (r = 21,5)', () => {
    expect(ringDash(35, 82)).toBe('180.3 219.9');
    expect(ringDash(35, 140)).toBe('219.9 219.9');
    expect(ringDash(35, 10)).toBe('22.0 219.9');
    expect(ringDash(21.5, 38)).toBe('51.3 135.1');
    expect(ringDash(21.5, 0)).toBeNull();
  });
});

describe('B6 — dernières opérations groupées par jour', () => {
  const tx = (id: string, date: string) => ({ id, date }) as never;
  it('un groupe par jour, dans l’ordre reçu (le plus récent d’abord)', () => {
    const g = groupByDay([tx('a', '2026-10-20'), tx('b', '2026-10-18'), tx('c', '2026-10-18'), tx('d', '2026-10-15')]);
    expect(g.map((x) => [x.date, x.items.map((i: { id: string }) => i.id)])).toEqual([
      ['2026-10-20', ['a']],
      ['2026-10-18', ['b', 'c']],
      ['2026-10-15', ['d']],
    ]);
  });
  it('« 20 oct. » / « Oct 20 » (mis en capitales à l’affichage)', () => {
    expect(dayLabel('fr', '2026-10-20')).toBe('20 oct.');
    expect(dayLabel('en', '2026-10-20')).toBe('Oct 20');
    expect(dayLabel('fr', '2026-05-01')).toBe('1 mai');
    expect(dayLabel('fr', '2026-02-03')).toBe('3 févr.');
  });
});

describe('B7 — enveloppe en bulle : état ÉCRIT et couleur de l’anneau', () => {
  const s = (remaining: number, level: string, percent: number) => ({ remaining, level, percent }) as never;
  it('dépassée : rouge, « Dépassé de … »', () => expect(bubbleLook(s(-40_000, 'critical', 140))).toEqual({ ring: 'ringOver', text: 'over' }));
  it('épuisée (100 %) : or, « Épuisée »', () => expect(bubbleLook(s(0, 'reached', 100))).toEqual({ ring: 'ringFull', text: 'reached' }));
  it('presque épuisée : or, « Reste … »', () => expect(bubbleLook(s(5_000, 'warning', 90))).toEqual({ ring: 'ringFull', text: 'left' }));
  it('normale : vert, « Reste … »', () => expect(bubbleLook(s(90_000, 'ok', 10))).toEqual({ ring: 'ringOk', text: 'left' }));
});

describe('nouveaux textes, en français et en anglais', () => {
  const keys = {
    'home.tile.history.sub': ['Toutes vos opérations', 'All your transactions'],
    'home.tile.income.sub': ['Salaire, vente…', 'Salary, sales…'],
    'home.tile.transfer.sub': ['Entre vos comptes', 'Between your accounts'],
    'home.tile.speak.sub': ['« {example} »', '“{example}”'],
    'home.envelopes': ['Enveloppes', 'Envelopes'],
    'home.goalsTitle': ['Objectifs', 'Goals'],
    'home.goal.of': ['{saved} sur {target}', '{saved} of {target}'],
    'home.tx.transfer': ['Virement', 'Transfer'],
  } as const;
  it.each(Object.entries(keys))('%s', (k, [f, e]) => {
    expect((fr as Record<string, string>)[k]).toBe(f);
    expect((en as Record<string, string>)[k]).toBe(e);
  });
  it('aucune clé supprimée (anciens titres et bulle de saisie gardés)', () => {
    for (const k of ['home.envelopesActive', 'home.goals', 'home.alerts', 'entry.prompt.title', 'entry.prompt.speak', 'entry.prompt.type', 'home.stat.income.sub']) {
      expect(fr).toHaveProperty(k);
      expect(en).toHaveProperty(k);
    }
  });
});

describe('écran d’accueil : l’ordre de la maquette', () => {
  const src = read('src/app/(tabs)/index.tsx');
  const at = (s: string) => {
    const i = src.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };
  it('Bonjour, ligne Démo, carte, tuiles, À lire, opérations, enveloppes, mois, objectifs, récompenses + IA, rapports', () => {
    const order = ["t('home.helloAnon')", '<DemoLine', '<DailyAllowanceCard', '<QuickTiles', '<ToRead', '<RecentByDay', '<EnvelopeBubbles', '<MonthStats', '<GoalRingRow', '<RewardsCard', "t('rep.title')"].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('B4 : plus de bulle de saisie ni de raccourcis encadrés (la tuile « Parler » les remplace)', () => {
    expect(src).not.toMatch(/<EntryPrompt/);
    expect(src).not.toMatch(/function Shortcut/);
  });
  it('B9 : « Votre analyse » n’est plus une carte à part sous l’accueil', () => {
    expect(src).not.toMatch(/<RecommendationCard/);
  });
  it('titres de la maquette : « Enveloppes · Gérer (N) », « {Mois} · Mois en cours », « Objectifs · Tout voir »', () => {
    expect(src).toMatch(/t\('home\.envelopes'\)/);
    expect(src).toMatch(/t\('home\.goalsTitle'\)/);
    expect(src).toMatch(/t\('common\.manageCount', \{ count: envelopes\.length \}\)/);
  });
});

describe('B4 — quatre grandes tuiles', () => {
  const src = read('src/features/home/QuickTiles.tsx');
  it('Historique, Revenu, Transfert, Parler, chacune avec sa petite phrase', () => {
    for (const k of ['history.title', 'tx.income', 'tx.transfer', 'entry.prompt.speak', 'home.tile.history.sub', 'home.tile.income.sub', 'home.tile.transfer.sub', 'home.tile.speak.sub']) expect(src).toContain(`'${k}'`);
  });
  it('rayon 18, marge 14, hauteur mini 96 ; deux colonnes, une seule si le texte est agrandi ou l’écran étroit (A8)', () => {
    expect(src).toMatch(/borderRadius: 18/);
    expect(src).toMatch(/padding: 14/);
    expect(src).toMatch(/minHeight: 96/);
    expect(src).toMatch(/narrow/);
  });
  it('« Parler » ouvre la saisie vocale ; après « Non, je tape », le clavier (I1)', () => {
    expect(src).toMatch(/micOffered/);
    expect(src).toMatch(/entry\.open\(voice \? 'voice' : 'keyboard'\)/);
  });
});

describe('B6 — opérations : icône du dictionnaire + petit logo de l’opérateur', () => {
  const src = read('src/features/home/RecentByDay.tsx');
  it('icône par transactionIconSlug, logo de l’opérateur en badge (18 dp)', () => {
    expect(src).toMatch(/transactionIconSlug\(/);
    expect(src).toMatch(/<AccountMark[^>]*size=\{18\}/);
    expect(src).toMatch(/textTransform: 'uppercase'/);
  });
});

describe('B7 / B8 / B9', () => {
  it('enveloppes en bulles : anneau 76 dp (trait 6), icône 34, 3 colonnes (tailles : envelopeBubble.ts › BUBBLE_SIZES.normal)', () => {
    const src = read('src/features/budget/EnvelopeBubbles.tsx');
    expect(src).toMatch(/size=\{sz\.ring\} stroke=\{sz\.stroke\}/);
    expect(src).toMatch(/size=\{sz\.icon\}/);
    expect(read('src/features/budget/envelopeBubble.ts')).toMatch(/normal: \{ ring: 76, stroke: 6, icon: 34/);
  });
  it('mois en cours : Revenus, Dépenses, Épargne nette (sans devise), puis Reste à répartir', () => {
    const src = read('src/features/home/MonthStats.tsx');
    for (const k of ['home.stat.income', 'home.stat.expense', 'home.stat.savings', 'home.stat.budget', 'home.month']) expect(src).toContain(`'${k}'`);
    expect(src).toMatch(/hideSymbol: true/);
  });
  it('objectifs en liste avec anneau 48 dp (trait 5), icône 24, « … sur … » et % à droite', () => {
    const src = read('src/features/rows.tsx');
    const row = src.slice(src.indexOf('export function GoalRingRow'));
    expect(row).toMatch(/size=\{48\} stroke=\{5\}/);
    expect(row).toMatch(/t\('home\.goal\.of'/);
  });
  it('récompenses (trophée 3D) et DineroX IA (rond violet) côte à côte', () => {
    const src = read('src/features/home/RewardsCard.tsx');
    expect(src).toMatch(/trophy/);
    expect(src).toMatch(/aiCircle/);
  });
});

describe('B2 / B3 — carte d’accueil, « Mis de côté » déplié dans un encadré', () => {
  const src = read('src/features/entry/DailyAllowanceCard.tsx');
  it('détail dans un encadré blanc à 8 %, rayon 12 ; titres blancs ; montants blancs', () => {
    expect(src).toMatch(/backgroundColor: 'rgba\(255,255,255,0\.08\)', borderRadius: 12/);
  });
});
