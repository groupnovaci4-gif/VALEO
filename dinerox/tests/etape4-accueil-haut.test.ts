/**
 * Étape 4.1 — Accueil, haut de l'écran (maquette validée du fondateur, 2026-10-21,
 * docs/design-pro-maquette-validee, points 2, 3, 7 et 8) :
 *  a) mode démo : une ligne discrète (pastille « Démo » + « Créer mon profil › ») ;
 *  b) carte compacte « Votre plafond de dépenses par jour », œil seul, mois en cours ;
 *  c) « Mis de côté » touchable, qui se déplie : « Dans vos comptes » / « Gardé ailleurs ».
 *     La somme du détail = le montant « Mis de côté » (aucun calcul nouveau : fonctions de core) ;
 *  d) carte flottante (CSS f4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { positionOf } from '../src/core/position';
import { buildDemoData } from '../src/core/demo';
import { setAsideDetail } from '../src/features/money/setAsideDetail';
import { heroFloat } from '../src/components/ui/heroFloat';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { account, contribution, goal, space, tentry, tontine } from './helpers';

const TODAY = '2026-10-15';
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const sum = (d: ReturnType<typeof setAsideDetail>) => [...d.inAccounts, ...d.elsewhere].reduce((n, l) => n + l.amount, 0);

describe('« Mis de côté » déplié : la somme du détail = le montant affiché', () => {
  const cash = account({ id: 'cash', name: 'Espèces', openingBalance: 200_000 });
  const ce = account({ id: 'ce', name: 'Compte épargne', isSavings: true, openingBalance: 450_000 });

  it('compte d’épargne (avec ses objectifs), réserve posée sur un compte, déclaré au départ, tontine', () => {
    const d = space({
      accounts: [cash, ce],
      goals: [
        goal({ id: 'moto', name: 'Ma moto', targetAmount: 1_200_000, initialAmount: 300_000, initialSource: 'outside' }),
        goal({ id: 'res', name: 'Réserve famille', kind: 'reserve', targetAmount: 200_000 }),
      ],
      goalContributions: [contribution({ id: 'c1', goalId: 'moto', amount: 450_000, accountId: 'ce' }), contribution({ id: 'c2', goalId: 'res', amount: 50_000, accountId: 'cash' })],
      tontines: [tontine({ id: 'rot', name: 'Tontine du bureau', startDate: '2026-08-05', myTurns: [9] })],
      tontineEntries: [1, 2, 3].map((n) => tentry({ tontineId: 'rot', kind: 'contribution', period: n, amount: 10_000 })),
    });
    const p = positionOf(d, 'XOF', TODAY);
    const x = setAsideDetail(d, p, TODAY);
    expect(sum(x)).toBe(p.setAside);
    expect(x.inAccounts).toEqual([
      { kind: 'savings', id: 'ce', account: 'Compte épargne', goals: ['Ma moto'], amount: 450_000 },
      { kind: 'onAccount', id: 'res@cash', goal: 'Réserve famille', account: 'Espèces', amount: 50_000 },
    ]);
    expect(x.elsewhere).toEqual([
      { kind: 'declared', id: 'moto', goal: 'Ma moto', amount: 300_000 },
      { kind: 'tontine', id: 'rot', name: 'Tontine du bureau', amount: 30_000 },
    ]);
  });

  it('rien de mis de côté : aucune ligne', () => {
    const d = space({ accounts: [cash] });
    const p = positionOf(d, 'XOF', TODAY);
    const x = setAsideDetail(d, p, TODAY);
    expect(p.setAside).toBe(0);
    expect(x).toEqual({ inAccounts: [], elsewhere: [] });
  });

  it('données de démonstration : somme du détail = « Mis de côté »', () => {
    const demo = buildDemoData({ now: Date.parse(`${TODAY}T08:00:00Z`), uid: 'u', today: TODAY, label: (k: string) => k });
    const d = space(demo as never);
    const p = positionOf(d, 'XOF', TODAY);
    expect(p.setAside).toBeGreaterThan(0);
    expect(sum(setAsideDetail(d, p, TODAY))).toBe(p.setAside);
  });
});

describe('nouveaux textes (accord du fondateur), en français et en anglais', () => {
  const keys = {
    'daily.limitLabel': ['Votre plafond de dépenses par jour', 'Your daily spending limit'],
    'home.demoPill': ['Démo', 'Demo'],
    'home.setAside.inAccounts': ['Dans vos comptes', 'In your accounts'],
    'home.setAside.elsewhere': ['Gardé ailleurs', 'Kept elsewhere'],
    'home.setAside.declared': ['{goal}, déclaré au départ', '{goal}, declared at the start'],
    'home.setAside.tontine': ['{name}, versé, à recevoir à votre tour', '{name}, paid in, to receive on your turn'],
    'home.setAside.onAccount': ['{goal} (sur {account})', '{goal} (on {account})'],
    'home.setAside.withGoals': ['{account} ({goals})', '{account} ({goals})'],
  } as const;
  it.each(Object.entries(keys))('%s', (k, [f, e]) => {
    expect((fr as Record<string, string>)[k]).toBe(f);
    expect((en as Record<string, string>)[k]).toBe(e);
  });
  it('aucune clé supprimée : les anciens textes restent (libellés d’accessibilité, autres écrans)', () => {
    for (const k of ['daily.label', 'daily.perDay', 'home.setAsideOutside', 'home.demoBanner', 'home.demoCta', 'home.hideAmounts', 'home.showAmounts']) {
      expect(fr).toHaveProperty(k);
      expect(en).toHaveProperty(k);
    }
  });
});

describe('carte compacte de l’accueil (DailyAllowanceCard)', () => {
  const src = read('src/features/entry/DailyAllowanceCard.tsx');
  it('titre « Votre plafond de dépenses par jour », plus de phrase « Il vous reste … »', () => {
    expect(src).toMatch(/t\('daily\.limitLabel'\)/);
    expect(src).not.toMatch(/t\('daily\.perDay'/);
    expect(src).not.toMatch(/t\('daily\.label'\)/);
  });
  it('œil seul (48 dp) : le libellé « Masquer les montants » n’est plus qu’un libellé d’accessibilité', () => {
    expect(src).toMatch(/function EyeButton/);
    const eye = src.slice(src.indexOf('function EyeButton'));
    expect(eye).toMatch(/accessibilityLabel=\{label\}/);
    expect(eye).toMatch(/width: 48, height: 48/);
    expect(eye).not.toMatch(/<Text/);
  });
  it('étiquette du mois en cours à droite du montant', () => {
    expect(src).toMatch(/monthYear\(now\)/);
  });
  it('« dont … hors de vos comptes » : plus affiché, gardé dans le libellé d’accessibilité de « Mis de côté »', () => {
    expect(src).not.toMatch(/<Text[^>]*>\s*\{t\('home\.setAsideOutside'/);
    expect(src).toMatch(/accessibilityLabel=\{\[[^\]]*t\('home\.setAsideOutside'/);
  });
  it('« Mis de côté » touchable, qui se déplie (état lu par le lecteur d’écran)', () => {
    expect(src).toMatch(/setAsideDetail\(/);
    expect(src).toMatch(/accessibilityState=\{\{ expanded: setAsideOpen \}\}/);
    expect(src).toMatch(/t\('home\.setAside\.inAccounts'\)/);
    expect(src).toMatch(/t\('home\.setAside\.elsewhere'\)/);
  });
});

describe('mode démonstration : ligne discrète à la place du grand encadré', () => {
  const src = read('src/app/(tabs)/index.tsx');
  it('pastille « Démo » (fiole) + « Créer mon profil › », texte explicatif en libellé d’accessibilité', () => {
    expect(src).not.toMatch(/text=\{t\('home\.demoBanner'\)\}/);
    expect(src).toMatch(/function DemoLine/);
    const line = src.slice(src.indexOf('function DemoLine'));
    expect(line).toMatch(/accessibilityLabel=\{t\('home\.demoBanner'\)\}/);
    expect(line).toMatch(/flask-outline/);
    expect(line).toMatch(/t\('home\.demoPill'\)/);
    expect(line).toMatch(/t\('home\.demoCta'\)/);
    expect(line).toMatch(/chevron-forward/);
  });
});

describe('carte verte flottante (CSS f4)', () => {
  it('marges 8 dp, rayon 22 ; clair : ombre verte ; sombre : liseré clair 1 dp + ombre noire + halo vert', () => {
    const light = heroFloat(false);
    const dark = heroFloat(true);
    expect(light.marginHorizontal).toBe(8);
    expect(light.borderRadius).toBe(22);
    expect(light.boxShadow).toBe('0px 26px 44px -14px rgba(15,74,58,0.62), 0px 12px 22px -8px rgba(15,74,58,0.34), 0px 2px 5px rgba(15,74,58,0.18)');
    expect(dark.boxShadow).toBe('0px 0px 0px 1px rgba(255,255,255,0.09), 0px 26px 44px -10px rgba(0,0,0,0.95), 0px 0px 36px rgba(79,176,143,0.16)');
    expect(read('src/features/entry/DailyAllowanceCard.tsx')).toMatch(/<GradientCard float/);
  });
});
