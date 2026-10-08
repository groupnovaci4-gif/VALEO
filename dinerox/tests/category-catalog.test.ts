/** Catalogue de catégories v2 (1.8) : données, validation, pays, profil, alias sans réécriture. */
import { describe, expect, it } from 'vitest';
import RAW from '../src/core/categoryCatalog.v2.json';
import {
  EMBEDDED_CATALOG,
  catalogStarterDocs,
  effectiveCategoryId,
  effectiveTransactions,
  maskedByProfile,
  sanitizeCatalog,
  usesCatalog,
  type CatalogEntry,
} from '../src/core/categoryCatalog';
import { resolveEnvelopeId } from '../src/core/budget';
import { buildReport, transactionsToCsv } from '../src/core/reports';
import { emptySpaceData, type Category } from '../src/core/types';
import { envelope, tx } from './helpers';

/** La liste du fondateur, dans l'ordre (libellés FR). */
const EXPECTED: [string, string, string, string[]][] = [
  ['cat_family', '👨‍👩‍👧', 'Famille', ['Aide aux parents', 'Aide aux frères/sœurs', 'Enfants', 'Soutien familial', 'Autres dépenses familiales']],
  ['cat_housing', '🏠', 'Maison & logement', ['Loyer', 'Électricité', 'Eau', 'Gaz', 'Charbon', 'Entretien / réparations', 'Ameublement', 'Autres']],
  ['cat_food', '🍛', 'Alimentation & boissons', ['Marché', 'Supermarché', 'Restaurant', 'Maquis', 'Livraison', 'Snacks', 'Boissons', 'Eau', 'Autres']],
  ['cat_health', '🏥', 'Santé', ['Consultation', 'Médicaments / pharmacie', 'Analyses médicales', 'Hospitalisation', 'Soins dentaires', 'Lunettes / optique', 'Assurance / mutuelle santé', 'Santé des enfants', 'Santé familiale', 'Autres']],
  ['cat_transport', '🚕', 'Transport', ['Taxi', 'Yango / VTC', 'Moto-taxi', 'Bus', 'Carburant', 'Entretien / réparation', 'Assurance', 'Parking', 'Péage', 'Autres']],
  ['cat_social', '🤝', 'Finance sociale & obligations', ['Tontine', 'Cotisation', 'Contribution mariage', 'Baptême', 'Funérailles', 'Cérémonies', 'Association / communauté', 'Autres']],
  ['cat_education', '🎓', 'Éducation & formation', ['Scolarité', 'Fournitures scolaires', 'Livres', 'Formation professionnelle', 'Certifications', 'Cours particuliers', 'Autres']],
  ['cat_communication', '📱', 'Communication & numérique', ['Crédit téléphonique', 'Internet / data', 'Fibre', 'Abonnements numériques', 'Téléphone / accessoires', 'Autres']],
  ['cat_leisure', '🎉', 'Loisirs & divertissement', ['Sorties', 'Cinéma', 'Jeux', 'Voyages', 'Sports', 'Abonnements streaming', 'Autres']],
  ['cat_clothing', '👔', 'Personnel', ['Vêtements', 'Chaussures', 'Coiffure / beauté', 'Hygiène', 'Accessoires', 'Autres']],
  ['cat_debts', '💳', 'Dettes & remboursements', ['Remboursement de prêt', 'Dette familiale', 'Dette personnelle', 'Crédit', 'Intérêts', 'Autres']],
  ['cat_other', '🛍️', 'Autres dépenses', []],
];
const label = (c: Category, lang: 'fr' | 'en' = 'fr') => EMBEDDED_CATALOG.entries.find((e) => e.id === c.id)!.label[lang];
const meta = { now: 1, uid: 'u1' };

describe('catalogue v2 : la liste du fondateur', () => {
  it('nouvel utilisateur en Côte d’Ivoire : exactement la liste (ordre, libellés FR, emojis)', () => {
    const docs = catalogStarterDocs('CI', meta);
    const parents = docs.filter((c) => !c.parentId);
    expect(parents.map((c) => [c.id, c.emoji, label(c)])).toEqual(EXPECTED.map(([id, e, fr]) => [id, e, fr]));
    for (const [id, , , subs] of EXPECTED) {
      expect(docs.filter((c) => c.parentId === id).map((c) => label(c))).toEqual(subs);
    }
    // Libellés traduits par le catalogue (corrigeables à distance), catégories système.
    expect(docs.every((c) => c.labelKey === `catalog:${c.id}` && c.name === '' && c.system && c.kind === 'expense' && c.catalogVersion === 2)).toBe(true);
  });

  it('chaque catégorie a un libellé anglais propre, et aucune n’est « Épargne »', () => {
    const en = EMBEDDED_CATALOG.entries.map((e) => e.label.en);
    expect(en.every((l) => l.length > 1 && !/[àâéèêëîïôûùç]/i.test(l))).toBe(true);
    expect(EMBEDDED_CATALOG.entries.find((e) => e.id === 'cat_social')!.label.en).toBe('Social finance & obligations');
    const ids = EMBEDDED_CATALOG.entries.map((e) => e.id);
    expect(ids).not.toContain('cat_savings');
    expect(ids).not.toContain('cat_investment');
    expect(EMBEDDED_CATALOG.retired).toEqual(['cat_savings', 'cat_investment']);
    expect(catalogStarterDocs('CI', meta).some((c) => /pargne|saving/i.test(label(c)) || /pargne|saving/i.test(label(c, 'en')))).toBe(false);
  });

  it('identifiants existants réutilisés quand le sens est le même', () => {
    const ids = new Set(EMBEDDED_CATALOG.entries.map((e) => e.id));
    for (const id of ['sub_family_parents', 'sub_family_siblings', 'sub_family_children', 'sub_family_transfers', 'sub_housing_maintenance', 'sub_food_streetfood', 'sub_health_mutual', 'sub_transport_vtc', 'sub_informal_tontine', 'sub_informal_dues', 'sub_social_weddings', 'sub_social_baptisms', 'sub_social_funerals', 'sub_social_ceremonies', 'sub_informal_association', 'sub_comm_airtime', 'sub_comm_data', 'sub_internet_fiber', 'sub_leisure_subscriptions', 'sub_clothing_clothes', 'sub_clothing_beauty', 'sub_debts_loan', 'sub_debts_family', 'sub_debts_card']) {
      expect(ids.has(id), id).toBe(true);
    }
    // Tontine, Cotisation, Association : rattachées à « Finance sociale & obligations » ; Fibre à « Communication ».
    const parentOf = (id: string) => EMBEDDED_CATALOG.entries.find((e) => e.id === id)!.parentId;
    expect([parentOf('sub_informal_tontine'), parentOf('sub_informal_dues'), parentOf('sub_internet_fiber')]).toEqual(['cat_social', 'cat_social', 'cat_communication']);
    expect(EMBEDDED_CATALOG.subAliases.sub_housing_repairs).toBe('sub_housing_maintenance');
  });

  it('pays : Afrique de l’Ouest francophone ; Maquis seulement là où il se dit', () => {
    expect(['CI', 'SN', 'BJ', 'TG', 'BF', 'ML', 'NE', 'GW', 'GN'].every((c) => usesCatalog(c))).toBe(true);
    expect(['FR', 'CM', 'GH', 'NG', 'MA'].some((c) => usesCatalog(c))).toBe(false);
    expect(catalogStarterDocs('CI', meta).some((c) => c.id === 'sub_food_maquis')).toBe(true);
    expect(catalogStarterDocs('SN', meta).some((c) => c.id === 'sub_food_maquis')).toBe(false);
  });
});

describe('catalogue : validation (le catalogue publié à distance ne passe que s’il est sain)', () => {
  const ok = { catalogVersion: 2, countries: ['CI'], entries: [{ id: 'cat_food', parentId: null, label: { fr: 'Alimentation', en: 'Food' } }, { id: 'sub_food_x', parentId: 'cat_food', label: { fr: 'X', en: 'X' } }] };
  it('le catalogue embarqué est valide', () => {
    expect(sanitizeCatalog(RAW)).not.toBeNull();
    expect(EMBEDDED_CATALOG.entries.length).toBe(94);
  });
  it('rejets : version, libellé anglais manquant, doublon, identifiant invalide, parent absent, deux niveaux', () => {
    expect(sanitizeCatalog(ok)).not.toBeNull();
    expect(sanitizeCatalog({ ...ok, catalogVersion: 1 })).toBeNull();
    expect(sanitizeCatalog({ ...ok, entries: [{ id: 'cat_food', parentId: null, label: { fr: 'A' } }] })).toBeNull();
    expect(sanitizeCatalog({ ...ok, entries: [ok.entries[0], ok.entries[0]] })).toBeNull();
    expect(sanitizeCatalog({ ...ok, entries: [{ ...ok.entries[0], id: 'Food!' }] })).toBeNull();
    expect(sanitizeCatalog({ ...ok, entries: [ok.entries[1]] })).toBeNull();
    expect(sanitizeCatalog({ ...ok, entries: [...ok.entries, { id: 'sub_deep', parentId: 'sub_food_x', label: { fr: 'P', en: 'P' } }] })).toBeNull();
    expect(sanitizeCatalog(null)).toBeNull();
  });
});

describe('profil : masquage par défaut (jamais suppression)', () => {
  const children = { profileRules: ['children'] } as Pick<CatalogEntry, 'profileRules'>;
  it('situation familiale renseignée, 0 enfant, 0 personne à charge → masquée', () => {
    expect(maskedByProfile(children, { familyStatus: 'single', children: 0, dependents: 0 })).toBe(true);
  });
  it('information inconnue → rien n’est masqué', () => {
    expect(maskedByProfile(children, { familyStatus: null, children: 0, dependents: 0 })).toBe(false);
    expect(maskedByProfile(children, undefined)).toBe(false);
    expect(maskedByProfile(children, {})).toBe(false);
  });
  it('enfant ou personne à charge déclaré → visible', () => {
    expect(maskedByProfile(children, { familyStatus: 'couple', children: 2, dependents: 0 })).toBe(false);
    expect(maskedByProfile(children, { familyStatus: 'single', children: 0, dependents: 1 })).toBe(false);
  });
  it('les trois catégories concernées : Enfants, Santé des enfants, Scolarité', () => {
    expect(EMBEDDED_CATALOG.entries.filter((e) => e.profileRules.includes('children')).map((e) => e.id)).toEqual(['sub_family_children', 'sub_health_children', 'sub_education_fees']);
  });
});

describe('alias : la Tontine passe à « Finance sociale & obligations » sans réécrire l’historique', () => {
  const cat = (p: Partial<Category> & { id: string }): Category => ({ createdAt: 1, updatedAt: 1, createdBy: 'u', kind: 'expense', name: '', icon: 'x', color: '#000', order: 0, ...p });
  const old = tx({ id: 'old', type: 'expense', amount: 10_000, accountId: 'a', categoryId: 'cat_informal', subcategoryId: 'sub_informal_tontine', date: '2026-09-10' });
  const other = tx({ id: 'other', type: 'expense', amount: 3_000, accountId: 'a', categoryId: 'cat_informal', date: '2026-09-11' });
  const before = [cat({ id: 'cat_informal', system: true }), cat({ id: 'cat_social', system: true }), cat({ id: 'sub_informal_tontine', parentId: 'cat_informal' })];
  const after = [cat({ id: 'cat_informal', system: true }), cat({ id: 'cat_social', system: true }), cat({ id: 'sub_informal_tontine', parentId: 'cat_social' })];

  it('avant la mise à jour : rien ne change ; après : comptée sous le nouveau parent', () => {
    expect(effectiveCategoryId(old, new Map(before.map((c) => [c.id, c])))).toBe('cat_informal');
    expect(effectiveCategoryId(old, new Map(after.map((c) => [c.id, c])))).toBe('cat_social');
    // Sans sous-catégorie : l'opération reste sous sa catégorie enregistrée.
    expect(effectiveCategoryId(other, new Map(after.map((c) => [c.id, c])))).toBe('cat_informal');
    // Nouvel espace sans l'ancien parent : le catalogue indique le nouveau parent.
    expect(effectiveCategoryId(old, new Map())).toBe('cat_social');
  });

  it('l’opération enregistrée n’est jamais modifiée ; la vue garde l’identifiant d’origine', () => {
    const view = effectiveTransactions([old, other], after);
    expect(old.categoryId).toBe('cat_informal');
    expect(view[0]).toMatchObject({ id: 'old', categoryId: 'cat_social', legacyCategoryId: 'cat_informal' });
    expect(view[1]).toBe(other);
    expect(effectiveTransactions([other], after)).toEqual([other]);
  });

  it('rapports : sous « Finance sociale & obligations », total identique', () => {
    const data = { ...emptySpaceData(), categories: after, transactions: effectiveTransactions([old, other], after) };
    const r = buildReport(data, 'month', '2026-09-15', 'XOF');
    const byCat = Object.fromEntries(r.byCategory.map((c) => [c.categoryId, c.amount]));
    expect(byCat).toEqual({ cat_social: 10_000, cat_informal: 3_000 });
    const raw = buildReport({ ...data, transactions: [old, other] }, 'month', '2026-09-15', 'XOF');
    expect(r.byCategory.reduce((n, c) => n + c.amount, 0)).toBe(raw.byCategory.reduce((n, c) => n + c.amount, 0));
  });

  it('budgets : une enveloppe qui citait l’ancien identifiant garde l’opération ; sinon la nouvelle catégorie', () => {
    const [view] = effectiveTransactions([old], after);
    expect(resolveEnvelopeId(view, [envelope({ id: 'env_sav', categoryIds: ['cat_informal'] }), envelope({ id: 'env_fam', categoryIds: ['cat_social'] })])).toBe('env_sav');
    expect(resolveEnvelopeId(view, [envelope({ id: 'env_fam', categoryIds: ['cat_social'] })])).toBe('env_fam');
  });

  it('export CSV : la catégorie affichée est « Finance sociale & obligations »', () => {
    const csv = transactionsToCsv(effectiveTransactions([old], after), {
      accountName: () => 'Espèces',
      categoryName: (_c, id) => (id === 'cat_social' ? 'Finance sociale & obligations' : id),
      categories: after,
      decimals: () => 0,
      headers: ['Date', 'Type', 'Montant', 'Devise', 'Compte', 'Vers', 'Catégorie', 'Bénéficiaire', 'Note'],
      typeLabel: () => 'Dépense',
    });
    expect(csv).toContain('Finance sociale & obligations');
  });
});
