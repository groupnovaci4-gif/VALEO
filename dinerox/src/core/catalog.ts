/**
 * Catalogue des sous-catégories — SUGGESTIONS contextualisées par zone et par
 * pays, jamais imposées : à la création de l'espace, celles de la zone de
 * l'utilisateur deviennent des catégories ordinaires (renommables,
 * supprimables) ; il peut aussi créer les siennes.
 *
 * Une sous-catégorie précise une catégorie principale (`parent`) sans la
 * remplacer : budgets, enveloppes et rapports continuent de raisonner par
 * catégorie principale.
 */
import type { Category } from './types';
import type { Zone } from './countries';

type L = { fr: string; en: string };
export interface SubcategorySeed {
  id: string;
  parent: string;
  label: L;
  /** Zones où elle est proposée (absente = partout). */
  zones?: Zone[];
  /** Pays où elle est proposée (prioritaire sur la zone). */
  countries?: string[];
  /** Charge habituellement fixe (analyse des charges fixes). */
  fixed?: boolean;
  /** Mots locaux : même sous-catégorie, libellé du pays. */
  local?: Record<string, L>;
}

const A: Zone[] = ['africa'];
const E: Zone[] = ['europe'];
const s = (id: string, parent: string, fr: string, en: string, opts: Omit<SubcategorySeed, 'id' | 'parent' | 'label'> = {}): SubcategorySeed => ({ id, parent, label: { fr, en }, ...opts });

export const SUBCATEGORIES: SubcategorySeed[] = [
  // Logement
  s('sub_housing_rent', 'cat_housing', 'Loyer', 'Rent', { fixed: true }),
  s('sub_housing_deposit', 'cat_housing', 'Caution', 'Deposit', { zones: A }),
  s('sub_housing_advance', 'cat_housing', 'Avance de loyer', 'Rent advance', { zones: A }),
  s('sub_housing_charges', 'cat_housing', 'Charges', 'Service charges', { zones: E, fixed: true }),
  s('sub_housing_electricity', 'cat_housing', 'Électricité', 'Electricity', { fixed: true, local: { CI: { fr: 'Électricité (CIE)', en: 'Electricity (CIE)' }, SN: { fr: 'Électricité (Senelec)', en: 'Electricity (Senelec)' } } }),
  s('sub_housing_energy', 'cat_housing', 'Énergie (électricité, gaz)', 'Energy (electricity, gas)', { zones: E, fixed: true }),
  s('sub_housing_water', 'cat_housing', 'Eau', 'Water', { fixed: true, local: { CI: { fr: 'Eau (SODECI)', en: 'Water (SODECI)' } } }),
  s('sub_housing_gas', 'cat_housing', 'Gaz', 'Gas'),
  s('sub_housing_charcoal', 'cat_housing', 'Charbon', 'Charcoal', { zones: A }),
  s('sub_housing_generator', 'cat_housing', 'Groupe électrogène', 'Generator', { zones: A }),
  s('sub_housing_heating', 'cat_housing', 'Chauffage', 'Heating', { zones: E }),
  s('sub_housing_condo', 'cat_housing', 'Copropriété', 'Co-ownership fees', { zones: E, fixed: true }),
  s('sub_housing_maintenance', 'cat_housing', 'Entretien', 'Maintenance'),
  s('sub_housing_repairs', 'cat_housing', 'Réparations', 'Repairs'),
  s('sub_housing_furniture', 'cat_housing', 'Ameublement', 'Furniture'),
  // Alimentation
  s('sub_food_market', 'cat_food', 'Marché', 'Market'),
  s('sub_food_supermarket', 'cat_food', 'Supermarché', 'Supermarket'),
  s('sub_food_restaurant', 'cat_food', 'Restaurant', 'Restaurant'),
  s('sub_food_maquis', 'cat_food', 'Maquis', 'Maquis (local eatery)', { countries: ['CI', 'BF', 'TG', 'BJ', 'CM'] }),
  s('sub_food_dibiterie', 'cat_food', 'Dibiterie', 'Dibiterie (grill)', { countries: ['SN'] }),
  s('sub_food_streetfood', 'cat_food', 'Repas de rue', 'Street food', { zones: A, local: { CI: { fr: 'Garba / repas de rue', en: 'Garba / street food' } } }),
  s('sub_food_delivery', 'cat_food', 'Livraison', 'Delivery'),
  s('sub_food_water', 'cat_food', 'Eau potable', 'Drinking water', { zones: A }),
  s('sub_food_drinks', 'cat_food', 'Boissons', 'Drinks'),
  s('sub_food_canteen', 'cat_food', 'Cantine', 'Canteen', { zones: E }),
  // Transport
  s('sub_transport_shared', 'cat_transport', 'Taxi collectif', 'Shared taxi', { zones: A, local: { CI: { fr: 'Woro-woro / gbaka', en: 'Woro-woro / gbaka' }, SN: { fr: 'Clando / car rapide', en: 'Clando / car rapide' }, CM: { fr: 'Taxi ville', en: 'City taxi' } } }),
  s('sub_transport_taxi', 'cat_transport', 'Taxi', 'Taxi'),
  s('sub_transport_vtc', 'cat_transport', 'VTC', 'Ride-hailing'),
  s('sub_transport_bus', 'cat_transport', 'Bus', 'Bus'),
  s('sub_transport_mototaxi', 'cat_transport', 'Moto-taxi', 'Motorbike taxi', { zones: A, local: { BJ: { fr: 'Zémidjan', en: 'Zemidjan' }, TG: { fr: 'Zémidjan', en: 'Zemidjan' }, NG: { fr: 'Okada', en: 'Okada' }, CM: { fr: 'Benskin', en: 'Benskin' }, BF: { fr: 'Moto-taxi', en: 'Motorbike taxi' } } }),
  s('sub_transport_pass', 'cat_transport', 'Abonnement transport public', 'Public transport pass', { zones: E, fixed: true, local: { FR: { fr: 'Pass Navigo / abonnement', en: 'Navigo / transit pass' }, GB: { fr: 'Oyster / abonnement', en: 'Oyster / travelcard' } } }),
  s('sub_transport_train', 'cat_transport', 'Train', 'Train', { zones: E }),
  s('sub_transport_fuel', 'cat_transport', 'Carburant', 'Fuel'),
  s('sub_transport_maintenance', 'cat_transport', 'Entretien du véhicule', 'Vehicle maintenance'),
  s('sub_transport_insurance', 'cat_transport', 'Assurance véhicule', 'Vehicle insurance', { fixed: true }),
  s('sub_transport_parking', 'cat_transport', 'Parking', 'Parking'),
  s('sub_transport_tolls', 'cat_transport', 'Péage', 'Tolls'),
  s('sub_transport_leasing', 'cat_transport', 'Leasing', 'Leasing', { zones: E, fixed: true }),
  s('sub_transport_carloan', 'cat_transport', 'Crédit automobile', 'Car loan', { zones: E, fixed: true }),
  // Télécommunications et internet
  s('sub_comm_airtime', 'cat_communication', 'Crédit téléphone', 'Airtime', { zones: A }),
  s('sub_comm_data', 'cat_communication', 'Forfait data', 'Mobile data'),
  s('sub_comm_plan', 'cat_communication', 'Forfait mobile', 'Mobile plan', { zones: E, fixed: true }),
  s('sub_internet_fiber', 'cat_internet', 'Internet / fibre', 'Internet / fibre', { fixed: true }),
  s('sub_internet_box', 'cat_internet', 'Box internet', 'Broadband', { zones: E, fixed: true }),
  // Famille
  s('sub_family_parents', 'cat_family', 'Aide aux parents', 'Support for parents', { zones: A }),
  s('sub_family_siblings', 'cat_family', 'Aide aux frères et sœurs', 'Support for siblings', { zones: A }),
  s('sub_family_children', 'cat_family', 'Enfants', 'Children'),
  s('sub_family_dependents', 'cat_family', 'Personnes à charge', 'Dependents', { zones: A }),
  s('sub_family_transfers', 'cat_family', 'Transferts familiaux', 'Family transfers', { zones: A }),
  s('sub_family_medical', 'cat_family', "Frais médicaux d'un proche", "A relative's medical costs", { zones: A }),
  s('sub_family_childcare', 'cat_family', "Garde d'enfants", 'Childcare', { zones: E, fixed: true }),
  s('sub_family_alimony', 'cat_family', 'Pension alimentaire', 'Child support', { zones: E, fixed: true }),
  // Éducation
  s('sub_education_fees', 'cat_education', 'Scolarité', 'School fees', { fixed: true }),
  s('sub_education_supplies', 'cat_education', 'Fournitures', 'School supplies'),
  s('sub_education_training', 'cat_education', 'Formation', 'Training'),
  // Santé
  s('sub_health_pharmacy', 'cat_health', 'Pharmacie', 'Pharmacy'),
  s('sub_health_consultation', 'cat_health', 'Consultation', 'Consultation'),
  s('sub_health_hospital', 'cat_health', 'Hôpital', 'Hospital'),
  s('sub_health_mutual', 'cat_health', 'Mutuelle', 'Health insurance', { fixed: true, local: { CH: { fr: 'Assurance maladie (LAMal)', en: 'Health insurance (LAMal)' }, CI: { fr: 'Mutuelle / CMU', en: 'Health insurance / CMU' } } }),
  // Obligations sociales (Afrique)
  s('sub_social_weddings', 'cat_social', 'Mariages', 'Weddings'),
  s('sub_social_baptisms', 'cat_social', 'Baptêmes', 'Baptisms'),
  s('sub_social_funerals', 'cat_social', 'Funérailles', 'Funerals'),
  s('sub_social_ceremonies', 'cat_social', 'Cérémonies et fêtes', 'Ceremonies & celebrations'),
  s('sub_social_religious', 'cat_social', 'Dons et offrandes', 'Donations & offerings'),
  // Finance informelle (Afrique)
  s('sub_informal_tontine', 'cat_informal', 'Tontine', 'Savings group (tontine)', { fixed: true, local: { GH: { fr: 'Susu', en: 'Susu' }, CM: { fr: 'Tontine / njangi', en: 'Njangi' }, NG: { fr: 'Ajo / esusu', en: 'Ajo / esusu' } } }),
  s('sub_informal_dues', 'cat_informal', 'Cotisations', 'Dues', { fixed: true }),
  s('sub_informal_association', 'cat_informal', 'Association', 'Association'),
  s('sub_informal_community', 'cat_informal', 'Épargne communautaire', 'Community savings'),
  s('sub_informal_loan_given', 'cat_informal', 'Prêt à un proche', 'Loan to a relative'),
  // Impôts et cotisations
  s('sub_taxes_income', 'cat_taxes', 'Impôt sur le revenu', 'Income tax', { zones: E, local: { GB: { fr: 'Impôt sur le revenu', en: 'Income tax' } } }),
  s('sub_taxes_local', 'cat_taxes', 'Taxes locales', 'Local taxes', { zones: E, local: { FR: { fr: 'Taxe foncière / habitation', en: 'Property / housing tax' }, BE: { fr: 'Précompte immobilier', en: 'Property withholding tax' }, GB: { fr: 'Council Tax', en: 'Council Tax' } } }),
  s('sub_taxes_social', 'cat_taxes', 'Cotisations sociales', 'Social contributions', { zones: E }),
  s('sub_taxes_general', 'cat_taxes', 'Impôts et taxes', 'Taxes', { zones: A }),
  // Assurances
  s('sub_insurance_home', 'cat_insurance', 'Assurance habitation', 'Home insurance', { zones: E, fixed: true }),
  s('sub_insurance_life', 'cat_insurance', 'Assurance vie / prévoyance', 'Life insurance', { fixed: true }),
  s('sub_insurance_health', 'cat_insurance', 'Assurance santé', 'Health insurance', { zones: A, fixed: true }),
  // Loisirs, vêtements
  s('sub_leisure_outings', 'cat_leisure', 'Sorties', 'Outings'),
  s('sub_leisure_subscriptions', 'cat_leisure', 'Abonnements (streaming…)', 'Subscriptions (streaming…)', { fixed: true }),
  s('sub_leisure_sport', 'cat_leisure', 'Sport', 'Sport'),
  s('sub_leisure_travel', 'cat_leisure', 'Voyages', 'Travel'),
  s('sub_clothing_clothes', 'cat_clothing', 'Vêtements', 'Clothes'),
  s('sub_clothing_beauty', 'cat_clothing', 'Coiffure et beauté', 'Hair & beauty'),
  // Dettes
  s('sub_debts_loan', 'cat_debts', 'Remboursement de prêt', 'Loan repayment', { fixed: true }),
  s('sub_debts_family', 'cat_debts', 'Dette familiale', 'Family debt', { zones: A }),
  s('sub_debts_card', 'cat_debts', 'Carte de crédit', 'Credit card', { zones: E }),
];

/** Zones des catégories principales régionales (leurs sous-catégories en héritent). */
const PARENT_ZONES: Record<string, Zone[]> = { cat_social: A, cat_informal: A };

/** Sous-catégories proposées pour un pays (pays prioritaire sur la zone). */
export function subcategoriesFor(country: string, zone: Zone): SubcategorySeed[] {
  const inZone = (zones?: Zone[]) => !zones || zone === 'other' || zones.includes(zone);
  return SUBCATEGORIES.filter((sc) => inZone(PARENT_ZONES[sc.parent]) && (sc.countries ? sc.countries.includes(country) : inZone(sc.zones)));
}

/** Libellé d'une sous-catégorie dans la langue et le pays de l'utilisateur. */
export function subcategoryLabel(sc: SubcategorySeed, lang: 'fr' | 'en', country?: string | null): string {
  return (country && sc.local?.[country]?.[lang]) || sc.label[lang];
}

export function findSubcategory(id: string): SubcategorySeed | undefined {
  return SUBCATEGORIES.find((sc) => sc.id === id);
}

/** Documents de sous-catégories (utilisateur : renommables et supprimables). */
export function subcategoryDocs(country: string, zone: Zone, meta: { now: number; uid: string; lang: 'fr' | 'en'; parents: Set<string> }): Category[] {
  return subcategoriesFor(country, zone)
    .filter((sc) => meta.parents.has(sc.parent))
    .map((sc, i) => ({
      id: sc.id,
      kind: 'expense',
      name: subcategoryLabel(sc, meta.lang, country),
      icon: 'ellipse',
      color: '#94A3B8',
      order: i,
      parentId: sc.parent,
      fixed: !!sc.fixed,
      createdAt: meta.now,
      updatedAt: meta.now,
      createdBy: meta.uid,
    }));
}
