/**
 * MIROIRS des registres de l'application (vérifiés par tests/backoffice-parity.test.ts) :
 * devises (src/core/money.ts › CURRENCIES), pays (src/core/countries.ts ›
 * COUNTRY_PROFILES), format des noms et de l'e-mail (src/core/validation.ts).
 */
export const CURRENCY_CODES = ['XOF', 'XAF', 'EUR', 'USD', 'CAD', 'GBP', 'CHF', 'GNF', 'MAD', 'GHS', 'NGN', 'DZD', 'TND', 'KES', 'CDF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'];

export const COUNTRY_CODES = ['CI', 'SN', 'BJ', 'TG', 'BF', 'ML', 'NE', 'GW', 'GN', 'GH', 'NG', 'CM', 'GA', 'CG', 'TD', 'CD', 'MA', 'DZ', 'TN', 'KE', 'FR', 'BE', 'CH', 'LU', 'MC', 'GB', 'IE', 'DE', 'NL', 'ES', 'IT', 'PT', 'SE', 'NO', 'DK', 'PL', 'CZ', 'OTHER'];

export const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' ’.-]*(?: [\p{L}\p{M}' ’.-]+)*$/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Nom valide (même règle que l'app) ; facultatif si `optional`. */
export function cleanName(raw: unknown, optional = false, max = 80): string | null | undefined {
  if (typeof raw !== 'string') return optional ? '' : null;
  const v = raw.trim().replace(/\s+/g, ' ');
  if (!v) return optional ? '' : null;
  if (v.length > max || !NAME_RE.test(v)) return null;
  return v;
}

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}
