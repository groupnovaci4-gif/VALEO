import type { CurrencyCode } from '@/core/money';

/** Pays proposés (premier marché : Côte d'Ivoire, puis Afrique francophone). */
export const COUNTRIES = ['CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GN', 'CM', 'GA', 'CG', 'FR', 'OTHER'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

const CURRENCY_BY_COUNTRY: Partial<Record<string, CurrencyCode>> = {
  CI: 'XOF', SN: 'XOF', ML: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF', NE: 'XOF',
  CM: 'XAF', GA: 'XAF', CG: 'XAF', GN: 'GNF', FR: 'EUR',
};

export function currencyForCountry(c: string): CurrencyCode {
  return CURRENCY_BY_COUNTRY[c] ?? 'XOF';
}
