/**
 * Refonte finale, étape 7 — PLUS (DECISIONS.md F1 ; FINAL-plus.png, ecrans/plus-*.html).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASTEL_PALETTE, pastelColors, pastelColumns } from '../src/components/ui/circlePalette';
import { MORE_FAMILY } from '../src/features/more/menuFamilies';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = read('src/app/(tabs)/more.tsx');

describe('F1 — grille d’icônes pastel, 4 par ligne', () => {
  it('couleurs exactes du HTML : fond pastel et icône, clair | sombre', () => {
    expect(PASTEL_PALETTE).toEqual({
      vert: { bg: ['#DCEBE3', '#1E3A31'], fg: ['#1E6B52', '#7FD1B0'] },
      or: { bg: ['#F5E6C4', '#3D3018'], fg: ['#9A6400', '#E8B85A'] },
      rouge: { bg: ['#F6DAD7', '#42201D'], fg: ['#B3261E', '#F08A82'] },
      terre: { bg: ['#F5DDD1', '#43271C'], fg: ['#B0502A', '#F09A75'] },
      bleu: { bg: ['#DBE6F2', '#1E2D3D'], fg: ['#2D5F8F', '#8DB8E3'] },
      violet: { bg: ['#EEDDEA', '#37223A'], fg: ['#7B3F70', '#D79CCB'] },
      whatsapp: { bg: ['#D8F0E0', '#173A25'], fg: ['#178A45', '#178A45'] },
      gris: { bg: ['#E6E8EA', '#2A2F33'], fg: ['#55606A', '#B5BEC6'] },
    });
    expect(pastelColors('vert', true)).toEqual({ bg: '#1E3A31', fg: '#7FD1B0' });
  });
  it('rubriques et couleurs du tableau du fondateur (inchangées)', () => {
    expect(MORE_FAMILY['ai.title']).toBe('violet');
    expect(MORE_FAMILY['more.whatsappChannel']).toBe('whatsapp');
    expect(MORE_FAMILY['set.title']).toBe('gris');
  });
  it('4 colonnes ; 3 si le texte est agrandi ou l’écran étroit (A8)', () => {
    expect(pastelColumns(360, 1)).toBe(4);
    expect(pastelColumns(339, 1)).toBe(3);
    expect(pastelColumns(412, 1.3)).toBe(3);
  });
  it('carré 52 dp, rayon 16, icône 24, nom 11/14 ; carte 16/8, 16 dp entre les lignes', () => {
    const g = read('src/components/ui/PastelGrid.tsx');
    expect(g).toMatch(/width: 52, height: 52, borderRadius: 16/);
    expect(g).toMatch(/size=\{24\}/);
    expect(g).toMatch(/fontSize: 11, lineHeight: 14/);
    expect(g).toMatch(/paddingVertical: 16, paddingHorizontal: 8/);
    expect(g).toMatch(/rowGap: 16/);
  });
});

describe('F1 — écran Plus', () => {
  it('« Plus » + pastille d’état ; carte verte flottante « Patrimoine net consolidé »', () => {
    expect(src).toMatch(/t\('more\.title'\)/);
    expect(src).not.toMatch(/t\('more\.overview'\)/);
    expect(src).toMatch(/t\('home\.status\.local'\)/);
    expect(src).toMatch(/<GradientCard float/);
    expect(src).toMatch(/t\('more\.netWorth'\)/);
  });
  it('les QUATRE thèmes en grille (Application aussi), mêmes rubriques, même ordre, mêmes conditions', () => {
    expect(src.match(/<PastelGrid/g)?.length).toBe(1);
    expect(src).not.toMatch(/<MenuRow|<CircleGrid/);
    for (const k of ['history.menu', 'acc.title', 'sav.title', 'tontine.title', 'obl.title', 'season.title', 'sim.title', 'debt.title', 'nw.title', 'rec.title', 'ai.title', 'intel.title', 'cal.title', 'fi.title', 'reward.title', 'score.cta', 'fam.title', 'rep.title', 'notif.title', 'cat.title', 'ref.title', 'more.whatsappChannel', 'more.review', 'sub.title', 'set.title', 'admin.title'])
      expect(src).toContain(`key: '${k}'`);
    for (const c of ["show: can(role, 'read', 'tontines')", "show: !!channelUrl", 'show: storeUrls.length > 0', 'show: !!user?.isAdmin', "locked: !hasFeature(plan, 'net_worth')"]) expect(src).toContain(c);
  });
});
