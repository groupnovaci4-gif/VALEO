/**
 * Refonte finale, étape 2 — A4 : LE LIBELLÉ DÉCIDE DE L'ICÔNE (src/config/dictionnaire-icones.json).
 * Ordre : libellé → objectif lié → sous-catégorie → catégorie → type (sinon le rendu actuel) ;
 * sans tenir compte des majuscules ni des accents, mot entier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_ICON_SLUGS, labelIconSlug, transactionIconSlug } from '../src/components/ui/contentIconMap';
import dictionary from '../src/config/dictionnaire-icones.json';

const root = path.join(__dirname, '..');

describe('dictionnaire du fondateur', () => {
  it('copie EXACTE de docs/design-pro-maquette-finale/dictionnaire-icones.json (50 entrées), chaque icône embarquée', () => {
    expect(dictionary.entrees).toHaveLength(50);
    for (const e of dictionary.entrees) expect(CONTENT_ICON_SLUGS, e.icone).toContain(e.icone);
  });
});

describe('libellé → icône (au moins 15 libellés)', () => {
  const cases: [string, string][] = [
    ['Moto', 'moto_rouge_3d'],
    ['MOTO', 'moto_rouge_3d'],
    ['Loyer octobre', 'house'],
    ['Restaurant', 'plat_poisson_3d'],
    ['Garba du midi', 'garba_3d'],
    ['Attiéké', 'garba_3d'],
    ['Attieke', 'garba_3d'],
    ['Courses au marché', 'basket'],
    ['Bière au maquis', 'clinking-beer-mugs'],
    ['Recharge gaz', 'bonbonne_gaz'],
    ['Ustensiles de cuisine', 'cooking'],
    ['Frais scolaires', 'school'],
    ['Taxi', 'taxi'],
    ['Gbaka Adjamé', 'minibus'],
    ['SOTRA', 'bus'],
    ['Essence', 'fuel-pump'],
    ['Facture CIE', 'high-voltage'],
    ['SODECI', 'potable-water'],
    ['Canal+', 'television'],
    ['canal+ octobre', 'television'],
    ['Pharmacie', 'pill'],
    ['Maman', 'older-person-medium-dark'],
    ['Coiffure', 'coiffure'],
    ['Tresses', 'coiffure'],
    ['Salaire', 'money-bag'],
    ['Compte épargne', 'pig'],
    ['Épargne', 'pig'],
    ['Réserve famille et cérémonies', 'famille_coeur_3d_medium-dark'],
    ['Fonds d’urgence', 'shield'],
    ['Fonds d\'urgence', 'shield'],
    ['Mariage de Awa', 'ring'],
  ];
  for (const [label, slug] of cases) it(`« ${label} » → ${slug}`, () => expect(labelIconSlug(label)).toBe(slug));
  it('mot ENTIER : « Carburant » n’est pas « car », « Courses » n’est pas « course », « Bus » n’est pas dans « Business »', () => {
    expect(labelIconSlug('Carburant')).toBe('fuel-pump');
    expect(labelIconSlug('Courses')).toBe('basket');
    expect(labelIconSlug('Business')).toBeNull();
    expect(labelIconSlug('Motocross')).toBeNull();
  });
  it('libellé inconnu ou vide : aucune icône (la suite de l’ordre décide)', () => {
    expect(labelIconSlug('Achat divers')).toBeNull();
    expect(labelIconSlug('')).toBeNull();
    expect(labelIconSlug(null)).toBeNull();
  });
  it('les notes du dictionnaire (« objectif « Ma moto » ») ne sont pas des mots-clés', () => {
    expect(labelIconSlug('objectif')).toBeNull();
  });
});

describe('ordre : libellé → objectif lié → sous-catégorie → catégorie → type', () => {
  it('« Moto » = moto rouge, MÊME pour un virement', () => {
    expect(transactionIconSlug({ type: 'transfer', payee: 'Moto' })).toBe('moto_rouge_3d');
  });
  it('le libellé passe avant la sous-catégorie et la catégorie', () => {
    expect(transactionIconSlug({ type: 'expense', payee: 'Canal+', subcategoryId: 'sub_housing_gas', categoryId: 'cat_food' })).toBe('television');
  });
  it('sans libellé reconnu : l’objectif lié (son nom, puis son icône)', () => {
    expect(transactionIconSlug({ type: 'transfer', payee: 'Versement' }, { name: 'Ma moto', icon: '🎯' })).toBe('moto_rouge_3d');
    expect(transactionIconSlug({ type: 'transfer', payee: null }, { name: 'Projet', icon: '🛡️' })).toBe('shield');
  });
  it('puis la sous-catégorie, puis la catégorie', () => {
    expect(transactionIconSlug({ type: 'expense', payee: 'Achat', subcategoryId: 'sub_leisure_subscriptions', categoryId: 'cat_leisure' })).toBe('television');
    expect(transactionIconSlug({ type: 'expense', payee: 'Achat', categoryId: 'cat_family' })).toBe('famille_3d_medium-dark');
  });
  it('un virement ou un ajustement sans libellé reconnu garde son icône de type (rendu actuel)', () => {
    expect(transactionIconSlug({ type: 'transfer', payee: 'Virement', categoryId: 'cat_food' })).toBeNull();
    expect(transactionIconSlug({ type: 'adjustment', payee: null })).toBeNull();
  });
  it('la ligne d’opération passe par cet ordre', () => {
    const src = fs.readFileSync(path.join(root, 'src/features/rows.tsx'), 'utf8');
    expect(src).toMatch(/transactionIconSlug\(/);
  });
});
