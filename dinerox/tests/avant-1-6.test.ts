/**
 * Avant la 1.6 — corrections du fondateur :
 *  - pavés : grille sur deux colonnes (une seule sous 340 px ou texte agrandi), vert au toucher lisible ;
 *  - carte du haut de l'accueil : « dont X hors de vos comptes » (épargne hors comptes + créances de tontine) ;
 *  - revenus irréguliers : après un REVENU reçu, proposer d'en mettre 10 % de côté (§11.2).
 */
import { describe, expect, it } from 'vitest';
import { positionOf, setAsideOutsideAccounts } from '../src/core/position';
import { incomeSavingPrompt } from '../src/core/coachData';
import { gridColumns, tileColumns, tileColors } from '../src/components/ui/tileStyle';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { contrastRatio } from '../src/theme/contrast';
import { darkColors, darkColorsV2, lightColors, lightColorsV2 } from '../src/theme/tokens';
import { account, contribution, debt, goal, space, tentry, tontine, tx } from './helpers';

const TODAY = '2026-10-15';
const cash = (opening = 0) => account({ id: 'cash', name: 'Espèces', openingBalance: opening });

describe('pavés : grille et couleurs', () => {
  it('deux colonnes à partir de 340 px ; une seule en dessous ou avec un texte agrandi', () => {
    expect(tileColumns(320, 1)).toBe(1);
    expect(tileColumns(339, 1)).toBe(1);
    expect(tileColumns(340, 1)).toBe(2);
    expect(tileColumns(430, 1)).toBe(2);
    expect(tileColumns(412, 1.3)).toBe(1);
  });

  it('au toucher : fond de la couleur primaire, texte et icône lisibles (≥ 4,5:1), clair et sombre', () => {
    for (const c of [lightColors, darkColors, lightColorsV2, darkColorsV2]) {
      const t = tileColors(c as never);
      expect(t.pressed.background).toBe(c.primary);
      expect(contrastRatio(t.pressed.text, t.pressed.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.rest.text, t.rest.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('un pavé seul dans sa section prend toute la largeur', () => {
    expect(gridColumns(1, 412, 1)).toBe(1);
    expect(gridColumns(2, 412, 1)).toBe(2);
    expect(gridColumns(3, 320, 1)).toBe(1);
  });

  it('en clair, le texte devient blanc au toucher', () => {
    expect(tileColors(lightColorsV2 as never).pressed.text.toUpperCase()).toBe('#FFFFFF');
  });
});

describe('accueil : « dont X hors de vos comptes » sous « Mis de côté »', () => {
  it('aucune ligne sans épargne hors comptes ni créance de tontine', () => {
    const p = positionOf(space({ accounts: [cash(100_000)] }), 'XOF', TODAY);
    expect(setAsideOutsideAccounts(p)).toBeNull();
  });

  it('objectif avec 80 000 hors de mes comptes : la ligne dit 80 000', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000, initialAmount: 80_000, initialSource: 'outside' })] });
    expect(setAsideOutsideAccounts(positionOf(d, 'XOF', TODAY))).toBe(80_000);
  });

  it('hors comptes 50 000 + tontine (3 cotisations de 10 000 avant mon tour) : 80 000, compris dans « Mis de côté »', () => {
    const d = space({
      accounts: [cash(100_000)],
      goals: [goal({ id: 'moto', targetAmount: 500_000, initialAmount: 50_000, initialSource: 'outside' })],
      tontines: [tontine({ id: 'rot', startDate: '2026-08-05', myTurns: [9] })],
      tontineEntries: [1, 2, 3].map((n) => tentry({ tontineId: 'rot', kind: 'contribution', period: n, amount: 10_000 })),
    });
    const p = positionOf(d, 'XOF', TODAY);
    expect(setAsideOutsideAccounts(p)).toBe(80_000);
    expect(p.setAside).toBeGreaterThanOrEqual(80_000);
  });

  it('une mise de côté sur un compte n’est pas « hors de vos comptes »', () => {
    const d = space({ accounts: [cash(100_000)], goals: [goal({ id: 'moto', targetAmount: 500_000 })], goalContributions: [contribution({ goalId: 'moto', amount: 30_000, accountId: 'cash' })] });
    expect(setAsideOutsideAccounts(positionOf(d, 'XOF', TODAY))).toBeNull();
  });
});

describe('§11.2 — revenus irréguliers : « Mettre X de côté maintenant ? » après un revenu reçu', () => {
  const irregular = { incomeNature: 'irregular' as const };
  const income = (p = {}) => tx({ id: 'in', type: 'income', amount: 25_000, accountId: 'cash', date: '2026-10-14', categoryId: 'inc_business', ...p });

  it('revenu de 25 000, revenus irréguliers : 2 500 à mettre de côté', () => {
    const d = space({ accounts: [cash()], transactions: [income()] });
    expect(incomeSavingPrompt(d, ['in'], 'XOF', TODAY, irregular)).toEqual({ received: 25_000, suggestion: 2_500, accountId: 'cash' });
  });

  it('revenus réguliers : aucune carte', () => {
    const d = space({ accounts: [cash()], transactions: [income()] });
    expect(incomeSavingPrompt(d, ['in'], 'XOF', TODAY, { incomeNature: 'fixed' })).toBeNull();
    expect(incomeSavingPrompt(d, ['in'], 'XOF', TODAY, null)).toBeNull();
  });

  it('un emprunt reçu : aucune carte', () => {
    const d = space({ accounts: [cash()], debts: [debt({ id: 'owe', direction: 'i_owe' })], transactions: [income({ debtId: 'owe', categoryId: null })] });
    expect(incomeSavingPrompt(d, ['in'], 'XOF', TODAY, irregular)).toBeNull();
  });

  it('une cagnotte de tontine reçue : aucune carte', () => {
    const d = space({ accounts: [cash()], tontines: [tontine({ id: 'rot' })], transactions: [income({ tontineId: 'rot', categoryId: 'inc_tontine' })] });
    expect(incomeSavingPrompt(d, ['in'], 'XOF', TODAY, irregular)).toBeNull();
  });

  it('une dépense, un revenu futur ou reçu sur un compte d’épargne : aucune carte', () => {
    const ce = account({ id: 'ce', isSavings: true, type: 'savings' });
    expect(incomeSavingPrompt(space({ accounts: [cash(50_000)], transactions: [tx({ id: 'in', type: 'expense', amount: 25_000, accountId: 'cash' })] }), ['in'], 'XOF', TODAY, irregular)).toBeNull();
    expect(incomeSavingPrompt(space({ accounts: [cash()], transactions: [income({ date: '2026-10-20' })] }), ['in'], 'XOF', TODAY, irregular)).toBeNull();
    expect(incomeSavingPrompt(space({ accounts: [cash(), ce], transactions: [income({ accountId: 'ce' })] }), ['in'], 'XOF', TODAY, irregular)).toBeNull();
  });

  it('note de plusieurs lignes : les revenus sont additionnés, une seule carte', () => {
    const d = space({ accounts: [cash()], transactions: [income(), income({ id: 'in2', amount: 15_000 }), tx({ id: 'dep', type: 'expense', amount: 1_000, accountId: 'cash' })] });
    expect(incomeSavingPrompt(d, ['in', 'in2', 'dep'], 'XOF', TODAY, irregular)).toEqual({ received: 40_000, suggestion: 4_000, accountId: 'cash' });
  });

  it('irrégularité observée (sans profil) : écart-type de R sur les mois clos > 30 % de la moyenne', () => {
    const months = ['2026-07-10', '2026-08-10', '2026-09-10'];
    const past = [200_000, 20_000, 120_000].map((amount, i) => tx({ id: `p${i}`, type: 'income', amount, accountId: 'cash', date: months[i], categoryId: 'inc_business' }));
    const d = space({ accounts: [cash()], transactions: [...past, income()] });
    expect(incomeSavingPrompt(d, ['in'], 'XOF', TODAY, null)).toMatchObject({ suggestion: 2_500 });
  });
});

describe('textes : jamais de coupure entre un nombre et son unité', () => {
  // Espace normale entre un nombre (ou un paramètre) et « % », « / mois », « mois » : le retour à la
  // ligne pourrait les séparer. Attendu : espace insécable (U+00A0), ou gluon (U+2060) après « / ».
  const breakable = [/[0-9}] %/, /} \/ ?(mois|month)/, /\/(mois|month)/, /} (mois|months?)\b/];
  for (const [lang, table] of [['fr', fr], ['en', en]] as const) {
    it(`${lang} : « 33 % », « FCFA / mois », « 6 mois » insécables`, () => {
      const bad = Object.entries(table).filter(([, v]) => breakable.some((r) => r.test(v as string)));
      expect(bad.map(([k]) => k)).toEqual([]);
    });
  }

  it('exemples : « 33 % » et « / mois » restent collés', () => {
    expect(fr['env.consumed']).toContain('{percent}\u00A0%');
    expect(fr['goal.perMonthChip']).toBe('{amount}\u00A0/\u00A0mois');
    expect(en['goal.perMonthChip']).toBe('{amount}\u00A0/\u00A0month');
  });
});
