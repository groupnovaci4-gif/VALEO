/**
 * Profils pays — la contextualisation de DINEROX.
 *
 * Le PAYS et la DEVISE sont deux informations distinctes : la Côte d'Ivoire,
 * le Sénégal, le Bénin et le Togo partagent le XOF mais pas les mêmes moyens
 * de paiement, ni les mêmes habitudes, ni les mêmes mots (woro-woro, clando,
 * zémidjan…). Chaque profil ne fait que PROPOSER : catégories, moyens de
 * paiement, charges et objectifs restent des suggestions modifiables.
 *
 * Ajouter un pays = ajouter une entrée ici (et, si besoin, des libellés locaux
 * dans catalog.ts). Aucun écran n'est à modifier. Les admins peuvent aussi
 * surcharger un profil à distance (`resolveCountryProfiles`).
 */
import type { CurrencyCode } from './money';

export type Zone = 'africa' | 'europe' | 'other';
export type Region = 'west_africa' | 'central_africa' | 'north_africa' | 'east_africa' | 'western_europe' | 'northern_europe' | 'central_europe' | 'southern_europe' | 'other';

export interface CountryProfile {
  code: string;
  name: { fr: string; en: string };
  flag: string;
  zone: Zone;
  region: Region;
  /** Devise proposée par défaut (modifiable : pays ≠ devise). */
  currency: CurrencyCode;
  /** Langue proposée par défaut. */
  language: 'fr' | 'en';
  /** Sources d'argent proposées, dans l'ordre (clés ACCOUNT_TEMPLATES). */
  paymentMethods: string[];
  /** Sources de revenus proposées en premier (identifiants INCOME_CATEGORIES). */
  incomeSources: string[];
  /** Charges courantes proposées à l'inscription (identifiants de sous-catégories du catalogue). */
  commonCharges: string[];
  /** Objectifs mis en avant (identifiants de modèles d'objectifs). */
  featuredGoals: string[];
  /** Exemple de revenu mensuel (aide à la saisie, PAS une statistique). */
  amountExample?: number;
  active?: boolean;
}

// Familles de profils partagées, déclinées ensuite par pays.
const AFRICA_INCOME = ['inc_salary', 'inc_business', 'inc_freelance', 'inc_commission', 'inc_agri', 'inc_side', 'inc_family', 'inc_sale', 'inc_rent', 'inc_pension', 'inc_gift', 'inc_other'];
const EUROPE_INCOME = ['inc_salary', 'inc_freelance', 'inc_allowance', 'inc_pension', 'inc_investment', 'inc_rent', 'inc_side', 'inc_refund', 'inc_sale', 'inc_gift', 'inc_other'];
const AFRICA_CHARGES = ['sub_housing_rent', 'sub_housing_electricity', 'sub_housing_water', 'sub_food_market', 'sub_transport_shared', 'sub_comm_airtime', 'sub_family_parents', 'sub_education_fees', 'sub_informal_tontine', 'sub_social_ceremonies'];
const EUROPE_CHARGES = ['sub_housing_rent', 'sub_housing_energy', 'sub_insurance_home', 'sub_internet_box', 'sub_transport_pass', 'sub_health_mutual', 'sub_taxes_income', 'sub_family_childcare', 'sub_transport_carloan', 'sub_leisure_subscriptions'];
const AFRICA_GOALS = ['emergency_fund', 'buy_land', 'build_house', 'buy_moto', 'start_business', 'child_studies', 'wedding', 'buy_car'];
const EUROPE_GOALS = ['emergency_fund', 'buy_house', 'travel', 'retirement', 'buy_car', 'studies', 'investment', 'renovate_house'];
const EUROPE_PAY = ['acc.current', 'acc.savings', 'acc.card', 'acc.joint', 'acc.cash', 'acc.investment'];

type Base = Omit<CountryProfile, 'code' | 'name' | 'flag' | 'currency' | 'paymentMethods'> & { paymentMethods?: string[] };
const westAfrica: Base = { zone: 'africa', region: 'west_africa', language: 'fr', incomeSources: AFRICA_INCOME, commonCharges: AFRICA_CHARGES, featuredGoals: AFRICA_GOALS, amountExample: 250_000 };
const centralAfrica: Base = { ...westAfrica, region: 'central_africa' };
const northAfrica: Base = { ...westAfrica, region: 'north_africa', commonCharges: ['sub_housing_rent', 'sub_housing_electricity', 'sub_housing_water', 'sub_food_market', 'sub_transport_shared', 'sub_comm_airtime', 'sub_family_parents', 'sub_education_fees'], amountExample: undefined };
const westernEurope: Base = { zone: 'europe', region: 'western_europe', language: 'fr', incomeSources: EUROPE_INCOME, commonCharges: EUROPE_CHARGES, featuredGoals: EUROPE_GOALS, paymentMethods: EUROPE_PAY };

const c = (code: string, fr: string, en: string, flag: string, currency: CurrencyCode, base: Base, paymentMethods?: string[], extra: Partial<CountryProfile> = {}): CountryProfile => ({
  ...base,
  code,
  name: { fr, en },
  flag,
  currency,
  paymentMethods: paymentMethods ?? base.paymentMethods ?? ['acc.cash', 'acc.bank', 'acc.savings'],
  ...extra,
});

export const COUNTRY_PROFILES: CountryProfile[] = [
  // ─── Afrique de l'Ouest (UEMOA : XOF) ───
  c('CI', "Côte d'Ivoire", "Côte d'Ivoire", '🇨🇮', 'XOF', westAfrica, ['acc.cash', 'acc.orange', 'acc.mtn', 'acc.moov', 'acc.wave', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('SN', 'Sénégal', 'Senegal', '🇸🇳', 'XOF', westAfrica, ['acc.cash', 'acc.wave', 'acc.orange', 'acc.free', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('BJ', 'Bénin', 'Benin', '🇧🇯', 'XOF', westAfrica, ['acc.cash', 'acc.mtn', 'acc.moov', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('TG', 'Togo', 'Togo', '🇹🇬', 'XOF', westAfrica, ['acc.cash', 'acc.moov', 'acc.mobile', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('BF', 'Burkina Faso', 'Burkina Faso', '🇧🇫', 'XOF', westAfrica, ['acc.cash', 'acc.orange', 'acc.moov', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('ML', 'Mali', 'Mali', '🇲🇱', 'XOF', westAfrica, ['acc.cash', 'acc.orange', 'acc.moov', 'acc.wave', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('NE', 'Niger', 'Niger', '🇳🇪', 'XOF', westAfrica, ['acc.cash', 'acc.airtel', 'acc.moov', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('GW', 'Guinée-Bissau', 'Guinea-Bissau', '🇬🇼', 'XOF', westAfrica, ['acc.cash', 'acc.orange', 'acc.mtn', 'acc.bank', 'acc.savings']),
  c('GN', 'Guinée', 'Guinea', '🇬🇳', 'GNF', westAfrica, ['acc.cash', 'acc.orange', 'acc.mtn', 'acc.bank', 'acc.savings', 'acc.tontine'], { amountExample: undefined }),
  c('GH', 'Ghana', 'Ghana', '🇬🇭', 'GHS', westAfrica, ['acc.cash', 'acc.mtn', 'acc.airtel', 'acc.bank', 'acc.savings', 'acc.tontine'], { language: 'en', amountExample: undefined }),
  c('NG', 'Nigeria', 'Nigeria', '🇳🇬', 'NGN', westAfrica, ['acc.cash', 'acc.bank', 'acc.card', 'acc.mobile', 'acc.savings', 'acc.tontine'], { language: 'en', amountExample: undefined }),
  // ─── Afrique centrale (CEMAC : XAF) ───
  c('CM', 'Cameroun', 'Cameroon', '🇨🇲', 'XAF', centralAfrica, ['acc.cash', 'acc.orange', 'acc.mtn', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('GA', 'Gabon', 'Gabon', '🇬🇦', 'XAF', centralAfrica, ['acc.cash', 'acc.airtel', 'acc.moov', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('CG', 'Congo', 'Congo', '🇨🇬', 'XAF', centralAfrica, ['acc.cash', 'acc.mtn', 'acc.airtel', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('TD', 'Tchad', 'Chad', '🇹🇩', 'XAF', centralAfrica, ['acc.cash', 'acc.airtel', 'acc.moov', 'acc.bank', 'acc.savings', 'acc.tontine']),
  c('CD', 'RD Congo', 'DR Congo', '🇨🇩', 'CDF', centralAfrica, ['acc.cash', 'acc.mobile', 'acc.airtel', 'acc.orange', 'acc.bank', 'acc.savings'], { amountExample: undefined }),
  // ─── Afrique du Nord et de l'Est ───
  c('MA', 'Maroc', 'Morocco', '🇲🇦', 'MAD', northAfrica, ['acc.cash', 'acc.bank', 'acc.card', 'acc.savings', 'acc.mobile']),
  c('DZ', 'Algérie', 'Algeria', '🇩🇿', 'DZD', northAfrica, ['acc.cash', 'acc.bank', 'acc.card', 'acc.savings']),
  c('TN', 'Tunisie', 'Tunisia', '🇹🇳', 'TND', northAfrica, ['acc.cash', 'acc.bank', 'acc.card', 'acc.savings']),
  c('KE', 'Kenya', 'Kenya', '🇰🇪', 'KES', { ...westAfrica, region: 'east_africa' }, ['acc.cash', 'acc.mobile', 'acc.bank', 'acc.savings', 'acc.tontine'], { language: 'en', amountExample: undefined }),
  // ─── Europe ───
  c('FR', 'France', 'France', '🇫🇷', 'EUR', westernEurope),
  c('BE', 'Belgique', 'Belgium', '🇧🇪', 'EUR', westernEurope),
  c('CH', 'Suisse', 'Switzerland', '🇨🇭', 'CHF', westernEurope),
  c('LU', 'Luxembourg', 'Luxembourg', '🇱🇺', 'EUR', westernEurope),
  c('MC', 'Monaco', 'Monaco', '🇲🇨', 'EUR', westernEurope),
  c('GB', 'Royaume-Uni', 'United Kingdom', '🇬🇧', 'GBP', westernEurope, undefined, { language: 'en' }),
  c('IE', 'Irlande', 'Ireland', '🇮🇪', 'EUR', westernEurope, undefined, { language: 'en' }),
  c('DE', 'Allemagne', 'Germany', '🇩🇪', 'EUR', { ...westernEurope, region: 'central_europe' }),
  c('NL', 'Pays-Bas', 'Netherlands', '🇳🇱', 'EUR', westernEurope),
  c('ES', 'Espagne', 'Spain', '🇪🇸', 'EUR', { ...westernEurope, region: 'southern_europe' }),
  c('IT', 'Italie', 'Italy', '🇮🇹', 'EUR', { ...westernEurope, region: 'southern_europe' }),
  c('PT', 'Portugal', 'Portugal', '🇵🇹', 'EUR', { ...westernEurope, region: 'southern_europe' }),
  c('SE', 'Suède', 'Sweden', '🇸🇪', 'SEK', { ...westernEurope, region: 'northern_europe' }, undefined, { language: 'en' }),
  c('NO', 'Norvège', 'Norway', '🇳🇴', 'NOK', { ...westernEurope, region: 'northern_europe' }, undefined, { language: 'en' }),
  c('DK', 'Danemark', 'Denmark', '🇩🇰', 'DKK', { ...westernEurope, region: 'northern_europe' }, undefined, { language: 'en' }),
  c('PL', 'Pologne', 'Poland', '🇵🇱', 'PLN', { ...westernEurope, region: 'central_europe' }, undefined, { language: 'en' }),
  c('CZ', 'Tchéquie', 'Czechia', '🇨🇿', 'CZK', { ...westernEurope, region: 'central_europe' }, undefined, { language: 'en' }),
];

/** Pays non listé : profil neutre (toutes les suggestions, devise au choix). */
export const OTHER_COUNTRY: CountryProfile = {
  code: 'OTHER',
  name: { fr: 'Autre pays', en: 'Other country' },
  flag: '🌍',
  zone: 'other',
  region: 'other',
  currency: 'USD',
  language: 'fr',
  paymentMethods: ['acc.cash', 'acc.bank', 'acc.mobile', 'acc.card', 'acc.savings'],
  incomeSources: [...new Set([...AFRICA_INCOME, ...EUROPE_INCOME])],
  commonCharges: ['sub_housing_rent', 'sub_housing_electricity', 'sub_housing_water', 'sub_food_market', 'sub_comm_airtime', 'sub_education_fees', 'sub_insurance_home'],
  featuredGoals: ['emergency_fund', 'buy_house', 'start_business', 'travel', 'studies', 'retirement'],
};

/**
 * Profils surchargeables à distance (admin) : même `code` = surcharge partielle,
 * nouveau `code` complet = ajout ; `active: false` retire le pays de la liste.
 */
export function resolveCountryProfiles(remote: Partial<CountryProfile>[] = []): CountryProfile[] {
  const map = new Map(COUNTRY_PROFILES.map((p) => [p.code, p]));
  for (const r of remote) {
    if (!r.code || r.code === 'OTHER') continue;
    const base = map.get(r.code);
    if (base) map.set(r.code, { ...base, ...r } as CountryProfile);
    else if (r.name && r.currency && r.zone && r.paymentMethods) map.set(r.code, { ...OTHER_COUNTRY, ...r } as CountryProfile);
  }
  return [...map.values()].filter((p) => p.active !== false);
}

export function countryProfile(code: string | null | undefined, profiles: CountryProfile[] = COUNTRY_PROFILES): CountryProfile {
  return profiles.find((p) => p.code === code) ?? OTHER_COUNTRY;
}

/** Devise proposée pour un pays (l'utilisateur peut en choisir une autre). */
export function currencyForCountry(code: string): CurrencyCode {
  return countryProfile(code).currency;
}

export function zoneOf(code: string | null | undefined): Zone {
  return countryProfile(code).zone;
}

/** Noms locaux de certaines sources d'argent (même usage, mot du pays). */
const LOCAL_ACCOUNT_NAMES: Record<string, Record<string, { fr: string; en: string }>> = {
  'acc.tontine': { GH: { fr: 'Susu', en: 'Susu' }, CM: { fr: 'Njangi / tontine', en: 'Njangi' }, NG: { fr: 'Ajo / esusu', en: 'Ajo / esusu' } },
  'acc.mobile': { TG: { fr: 'T-Money / Mixx', en: 'T-Money / Mixx' }, KE: { fr: 'M-Pesa', en: 'M-Pesa' }, NG: { fr: 'Portefeuille mobile (OPay, PalmPay…)', en: 'Mobile wallet (OPay, PalmPay…)' }, CD: { fr: 'M-Pesa / Mobile Money', en: 'M-Pesa / Mobile Money' }, MA: { fr: 'Portefeuille mobile', en: 'Mobile wallet' } },
  'acc.savings': { FR: { fr: 'Livret d’épargne', en: 'Savings account' }, BE: { fr: 'Compte d’épargne', en: 'Savings account' } },
};

export function localAccountName(key: string, country: string | null | undefined, lang: 'fr' | 'en'): string | null {
  return (country && LOCAL_ACCOUNT_NAMES[key]?.[country]?.[lang]) || null;
}
