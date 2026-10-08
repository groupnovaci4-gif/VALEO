import { describe, expect, it } from 'vitest';
import { COUNTRY_PROFILES, OTHER_COUNTRY, countryProfile, currencyForCountry, localAccountName, resolveCountryProfiles } from '../src/core/countries';
import { CURRENCIES, formatMoney, isCurrency } from '../src/core/money';
import { ACCOUNT_TEMPLATES, INCOME_CATEGORIES, starterStructure } from '../src/core/defaults';
import { SUBCATEGORIES, findSubcategory, subcategoriesFor, subcategoryLabel } from '../src/core/catalog';
import { DEFAULT_GOAL_CATEGORIES } from '../src/core/goalCategories';

const templates = new Set(ACCOUNT_TEMPLATES.map((a) => a.key));
const goalTemplates = new Set(DEFAULT_GOAL_CATEGORIES.flatMap((c) => c.templates.map((t) => t.id)));
const incomes = new Set(INCOME_CATEGORIES.map((c) => c.id));

describe('registre des pays', () => {
  it.each([...COUNTRY_PROFILES, OTHER_COUNTRY].map((p) => [p.code, p] as const))('%s : profil cohérent (devise, moyens, charges, objectifs connus)', (_, p) => {
    expect(isCurrency(p.currency)).toBe(true);
    for (const k of p.paymentMethods) expect(templates.has(k), k).toBe(true);
    for (const id of p.commonCharges) expect(findSubcategory(id), id).toBeTruthy();
    for (const id of p.featuredGoals) expect(goalTemplates.has(id), id).toBe(true);
    for (const id of p.incomeSources) expect(incomes.has(id), id).toBe(true);
  });
  it('codes uniques', () => {
    const codes = COUNTRY_PROFILES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('pays ≠ devise : quatre pays différents, une même devise', () => {
    expect(['CI', 'SN', 'BJ', 'TG'].map(currencyForCountry)).toEqual(['XOF', 'XOF', 'XOF', 'XOF']);
    expect(countryProfile('SN').paymentMethods).toContain('acc.wave');
    expect(countryProfile('BJ').paymentMethods).not.toContain('acc.wave');
    expect(countryProfile('CI').paymentMethods).toContain('acc.orange');
  });
  it('devises européennes et africaines', () => {
    expect(currencyForCountry('FR')).toBe('EUR');
    expect(currencyForCountry('CH')).toBe('CHF');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('NG')).toBe('NGN');
    expect(currencyForCountry('GH')).toBe('GHS');
    expect(currencyForCountry('MA')).toBe('MAD');
    for (const c of ['XOF', 'XAF', 'GHS', 'NGN', 'MAD', 'DZD', 'TND', 'EUR', 'CHF', 'GBP', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK']) expect(c in CURRENCIES).toBe(true);
  });
  it('formatage par devise (décimales propres à chaque devise)', () => {
    expect(formatMoney(150000, 'XOF').replace(/\s/g, ' ')).toBe('150 000 FCFA');
    expect(formatMoney(150050, 'CHF').replace(/\s/g, ' ')).toContain('1 500,50');
    expect(formatMoney(1234567, 'TND').replace(/\s/g, ' ')).toContain('1 234,567');
  });
  it('pays inconnu : profil neutre', () => {
    expect(countryProfile('ZZ').code).toBe('OTHER');
  });
  it("surcharge à distance (admin) : modification, ajout, retrait d'un pays", () => {
    const r = resolveCountryProfiles([{ code: 'CI', currency: 'XOF', featuredGoals: ['buy_land'] }, { code: 'RW', name: { fr: 'Rwanda', en: 'Rwanda' }, currency: 'USD', zone: 'africa', paymentMethods: ['acc.cash'] }, { code: 'MC', active: false }]);
    expect(r.find((p) => p.code === 'CI')!.featuredGoals).toEqual(['buy_land']);
    expect(r.find((p) => p.code === 'RW')).toBeTruthy();
    expect(r.find((p) => p.code === 'MC')).toBeUndefined();
  });
  it('noms locaux : susu au Ghana, njangi au Cameroun', () => {
    expect(localAccountName('acc.tontine', 'GH', 'en')).toBe('Susu');
    expect(localAccountName('acc.tontine', 'CM', 'fr')).toContain('Njangi');
    expect(localAccountName('acc.tontine', 'CI', 'fr')).toBeNull();
  });
});

describe('catalogue localisé', () => {
  it('identifiants uniques', () => {
    expect(new Set(SUBCATEGORIES.map((s) => s.id)).size).toBe(SUBCATEGORIES.length);
  });
  it('Afrique : tontine, aide aux parents, funérailles ; pas de taxe foncière', () => {
    const ids = subcategoriesFor('CI', 'africa').map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['sub_informal_tontine', 'sub_family_parents', 'sub_social_funerals', 'sub_transport_shared', 'sub_food_maquis']));
    expect(ids).not.toContain('sub_taxes_local');
    expect(ids).not.toContain('sub_food_dibiterie');
  });
  it('Europe : mutuelle, assurance habitation, impôts ; pas de tontine ni de charbon', () => {
    const ids = subcategoriesFor('FR', 'europe').map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['sub_health_mutual', 'sub_insurance_home', 'sub_taxes_income', 'sub_transport_pass']));
    expect(ids).not.toContain('sub_informal_tontine');
    expect(ids).not.toContain('sub_housing_charcoal');
  });
  it('mots du pays : woro-woro (CI), clando (SN), zémidjan (BJ), LAMal (CH), Council Tax (GB)', () => {
    const l = (id: string, c: string) => subcategoryLabel(findSubcategory(id)!, 'fr', c);
    expect(l('sub_transport_shared', 'CI')).toContain('Woro-woro');
    expect(l('sub_transport_shared', 'SN')).toContain('Clando');
    expect(l('sub_transport_mototaxi', 'BJ')).toBe('Zémidjan');
    expect(l('sub_health_mutual', 'CH')).toContain('LAMal');
    expect(l('sub_taxes_local', 'GB')).toBe('Council Tax');
    expect(l('sub_transport_shared', 'BJ')).toBe('Taxi collectif');
  });
});

describe('environnement de départ par pays', () => {
  const meta = { now: 1, uid: 'u1', lang: 'fr' as const, label: (k: string) => k, date: '2026-10-05' };
  it('Côte d’Ivoire : sous-catégories africaines, catégories tontines et obligations sociales', () => {
    const s = starterStructure({ firstName: 'Awa', currency: 'XOF', country: 'CI', zone: 'africa', accounts: ['acc.cash', 'acc.orange', 'acc.mtn', 'acc.bank'] }, meta);
    const cats = s.categories!.map((c) => c.id);
    // 1.8 : catalogue de départ v2 — la Tontine est dans « Finance sociale & obligations » (cat_social).
    expect(cats).toEqual(expect.arrayContaining(['cat_social', 'sub_informal_tontine', 'sub_food_maquis', 'inc_tontine']));
    expect(cats).not.toContain('cat_informal');
    expect(cats).not.toContain('cat_savings');
    expect(cats).not.toContain('cat_investment');
    expect(s.categories!.find((c) => c.id === 'sub_informal_tontine')!.parentId).toBe('cat_social');
    expect(s.accounts!.map((a) => a.name)).toEqual(['acc.cash', 'acc.orange', 'acc.mtn', 'acc.bank']);
  });
  it('France : pas de tontine, impôts et assurances présents', () => {
    const s = starterStructure({ firstName: 'Léa', currency: 'EUR', country: 'FR', zone: 'europe', accounts: ['acc.current', 'acc.card'] }, meta);
    const cats = s.categories!.map((c) => c.id);
    expect(cats).not.toContain('cat_informal');
    expect(cats).toEqual(expect.arrayContaining(['cat_taxes', 'cat_insurance', 'sub_health_mutual']));
    expect(s.accounts!.every((a) => a.currency === 'EUR')).toBe(true);
  });
  it('soldes déclarés et charges déclarées : repris, sans montant inventé', () => {
    const s = starterStructure(
      { firstName: 'Awa', currency: 'XOF', country: 'CI', zone: 'africa', accounts: ['acc.cash', 'acc.wave'], openingBalances: { 'acc.wave': 45000 }, fixedCharges: { sub_housing_rent: 80000 } },
      meta,
    );
    expect(s.accounts!.find((a) => a.name === 'acc.wave')!.openingBalance).toBe(45000);
    expect(s.accounts!.find((a) => a.name === 'acc.cash')!.openingBalance).toBe(0);
    expect(s.envelopes!.find((e) => e.categoryIds.includes('cat_housing'))!.monthlyBudget).toBe(80000);
  });
});
