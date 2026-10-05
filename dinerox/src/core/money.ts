/**
 * Monnaie : registre des devises, formatage et saisie.
 *
 * Convention : TOUS les montants sont stockés en ENTIERS d'unités mineures
 * (centimes pour EUR/USD…, unité pour XOF qui n'a pas de décimales). Aucun
 * flottant n'est stocké : on évite les erreurs d'arrondi sur l'argent.
 *
 * DineroX ne convertit JAMAIS automatiquement entre devises : sans taux fiable,
 * les montants de devises différentes ne sont pas additionnés (voir
 * `sumByCurrency` dans balance.ts).
 */

export type CurrencyCode =
  | 'XOF' | 'XAF' | 'GNF' | 'GHS' | 'NGN' | 'MAD' | 'DZD' | 'TND' | 'KES' | 'CDF'
  | 'EUR' | 'CHF' | 'GBP' | 'SEK' | 'NOK' | 'DKK' | 'PLN' | 'CZK'
  | 'USD' | 'CAD';

export interface CurrencyInfo {
  code: CurrencyCode;
  /** Nombre de décimales de l'unité mineure. */
  decimals: number;
  /** Symbole affiché. */
  symbol: string;
  /** Symbole avant (true) ou après (false) le montant. */
  prefix: boolean;
  name: { fr: string; en: string };
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  XOF: { code: 'XOF', decimals: 0, symbol: 'FCFA', prefix: false, name: { fr: 'Franc CFA (UEMOA)', en: 'CFA franc (WAEMU)' } },
  XAF: { code: 'XAF', decimals: 0, symbol: 'FCFA', prefix: false, name: { fr: 'Franc CFA (CEMAC)', en: 'CFA franc (CEMAC)' } },
  EUR: { code: 'EUR', decimals: 2, symbol: '€', prefix: false, name: { fr: 'Euro', en: 'Euro' } },
  USD: { code: 'USD', decimals: 2, symbol: '$', prefix: true, name: { fr: 'Dollar américain', en: 'US dollar' } },
  CAD: { code: 'CAD', decimals: 2, symbol: '$ CA', prefix: false, name: { fr: 'Dollar canadien', en: 'Canadian dollar' } },
  GBP: { code: 'GBP', decimals: 2, symbol: '£', prefix: true, name: { fr: 'Livre sterling', en: 'Pound sterling' } },
  CHF: { code: 'CHF', decimals: 2, symbol: 'CHF', prefix: false, name: { fr: 'Franc suisse', en: 'Swiss franc' } },
  GNF: { code: 'GNF', decimals: 0, symbol: 'GNF', prefix: false, name: { fr: 'Franc guinéen', en: 'Guinean franc' } },
  MAD: { code: 'MAD', decimals: 2, symbol: 'DH', prefix: false, name: { fr: 'Dirham marocain', en: 'Moroccan dirham' } },
  GHS: { code: 'GHS', decimals: 2, symbol: 'GH₵', prefix: true, name: { fr: 'Cedi ghanéen', en: 'Ghanaian cedi' } },
  NGN: { code: 'NGN', decimals: 2, symbol: '₦', prefix: true, name: { fr: 'Naira nigérian', en: 'Nigerian naira' } },
  DZD: { code: 'DZD', decimals: 2, symbol: 'DA', prefix: false, name: { fr: 'Dinar algérien', en: 'Algerian dinar' } },
  TND: { code: 'TND', decimals: 3, symbol: 'DT', prefix: false, name: { fr: 'Dinar tunisien', en: 'Tunisian dinar' } },
  KES: { code: 'KES', decimals: 2, symbol: 'KSh', prefix: true, name: { fr: 'Shilling kényan', en: 'Kenyan shilling' } },
  CDF: { code: 'CDF', decimals: 2, symbol: 'FC', prefix: false, name: { fr: 'Franc congolais', en: 'Congolese franc' } },
  SEK: { code: 'SEK', decimals: 2, symbol: 'kr', prefix: false, name: { fr: 'Couronne suédoise', en: 'Swedish krona' } },
  NOK: { code: 'NOK', decimals: 2, symbol: 'kr', prefix: false, name: { fr: 'Couronne norvégienne', en: 'Norwegian krone' } },
  DKK: { code: 'DKK', decimals: 2, symbol: 'kr', prefix: false, name: { fr: 'Couronne danoise', en: 'Danish krone' } },
  PLN: { code: 'PLN', decimals: 2, symbol: 'zł', prefix: false, name: { fr: 'Złoty polonais', en: 'Polish złoty' } },
  CZK: { code: 'CZK', decimals: 2, symbol: 'Kč', prefix: false, name: { fr: 'Couronne tchèque', en: 'Czech koruna' } },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'XOF';

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES[code as CurrencyCode] ?? CURRENCIES[DEFAULT_CURRENCY];
}

export function isCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && code in CURRENCIES;
}

/** Espace insécable utilisé comme séparateur de milliers (style français). */
const NBSP = ' ';

/** Regroupe les chiffres par milliers : 1234567 → "1 234 567". */
export function groupDigits(n: number | bigint): string {
  const s = String(n < 0 ? -n : n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export interface FormatOptions {
  /** Affiche "+" devant les montants positifs. */
  signed?: boolean;
  /** Masque le symbole de devise. */
  hideSymbol?: boolean;
  /** Format compact : 1,2 M / 450 k. */
  compact?: boolean;
}

/** Formate un montant en unités mineures : 450000 XOF → "450 000 FCFA". */
export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY, opts: FormatOptions = {}): string {
  const info = currencyInfo(currency);
  const value = Math.round(minor);
  const negative = value < 0;
  const abs = Math.abs(value);
  let body: string;
  if (opts.compact) {
    body = compactNumber(abs / 10 ** info.decimals);
  } else if (info.decimals === 0) {
    body = groupDigits(abs);
  } else {
    const unit = 10 ** info.decimals;
    const int = Math.floor(abs / unit);
    const frac = String(abs % unit).padStart(info.decimals, '0');
    body = `${groupDigits(int)},${frac}`;
  }
  const sign = negative ? '-' : opts.signed && value > 0 ? '+' : '';
  if (opts.hideSymbol) return `${sign}${body}`;
  return info.prefix ? `${sign}${info.symbol}${body}` : `${sign}${body}${NBSP}${info.symbol}`;
}

/** 1 250 000 → "1,25 M" ; 450 000 → "450 k". */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number) => {
    const r = Math.round(v * 100) / 100;
    return String(r).replace('.', ',');
  };
  if (abs >= 1e9) return `${fmt(n / 1e9)}${NBSP}Md`;
  if (abs >= 1e6) return `${fmt(n / 1e6)}${NBSP}M`;
  if (abs >= 1e4) return `${fmt(Math.round(n / 1e3))}${NBSP}k`;
  return groupDigits(Math.round(n));
}

/**
 * Convertit une saisie utilisateur en unités mineures.
 * Accepte "450000", "450 000", "450.000", "12,50", "1 250,75".
 * Retourne null si la saisie n'est pas un montant valide.
 */
export function parseAmountInput(input: string, currency: string = DEFAULT_CURRENCY): number | null {
  const info = currencyInfo(currency);
  const cleaned = input.replace(/[\s  ]/g, '').replace(/(fcfa|cfa|f|€|\$|£|chf|xof)$/i, '');
  // Les montants saisis sont toujours positifs : le sens (dépense/revenu)
  // est porté par le type d'opération, jamais par le signe.
  if (!cleaned || cleaned.startsWith('-')) return null;
  let normalized = cleaned;
  if (info.decimals === 0) {
    // Pas de décimales : "450.000" et "450,000" sont des séparateurs de milliers.
    if (!/^\d+([.,]\d{3})*$/.test(normalized)) return null;
    normalized = normalized.replace(/[.,]/g, '');
    const v = Number(normalized);
    return Number.isFinite(v) ? v : null;
  }
  // Avec décimales : la dernière virgule/point suivie de 1-2 chiffres est décimale.
  const m = normalized.match(/^([\d.,]*?)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const intPart = (m[1] || '0').replace(/[.,]/g, '');
  if (!/^\d+$/.test(intPart)) return null;
  const frac = (m[2] ?? '').padEnd(info.decimals, '0');
  const v = Number(intPart) * 10 ** info.decimals + Number(frac || 0);
  return Number.isFinite(v) ? v : null;
}

/** Unités majeures (ex. 12.5 €) → mineures (1250). */
export function toMinor(major: number, currency: string = DEFAULT_CURRENCY): number {
  return Math.round(major * 10 ** currencyInfo(currency).decimals);
}

/** Unités mineures → majeures. */
export function toMajor(minor: number, currency: string = DEFAULT_CURRENCY): number {
  return minor / 10 ** currencyInfo(currency).decimals;
}

/**
 * Arrondit un montant mineur à un pas « humain » (ex. 5 000 FCFA) pour les
 * propositions de budget. Le pas est exprimé en unités majeures.
 */
export function roundTo(minor: number, stepMajor: number, currency: string = DEFAULT_CURRENCY): number {
  const step = toMinor(stepMajor, currency);
  if (step <= 0) return Math.round(minor);
  return Math.round(minor / step) * step;
}

/** Vrai si le montant est un entier strictement positif (règle d'entrée). */
export function isValidAmount(minor: unknown): minor is number {
  return typeof minor === 'number' && Number.isInteger(minor) && minor > 0 && minor < 1e15;
}
