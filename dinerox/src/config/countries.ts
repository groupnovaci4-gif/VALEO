/**
 * Pays proposés : le registre complet (devise, moyens de paiement, charges,
 * objectifs…) est dans `core/countries.ts`. Ce fichier garde l'API historique.
 */
import { COUNTRY_PROFILES } from '@/core/countries';

export { currencyForCountry, countryProfile, zoneOf } from '@/core/countries';
export const COUNTRIES = [...COUNTRY_PROFILES.map((p) => p.code), 'OTHER'];
export type CountryCode = string;
