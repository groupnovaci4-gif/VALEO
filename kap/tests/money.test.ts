import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmountInput, isValidAmount, roundTo, compactNumber } from '../src/core/money';

const N = ' ';

describe('formatMoney', () => {
  it('formate le FCFA sans décimales', () => {
    expect(formatMoney(450000, 'XOF')).toBe(`450${N}000${N}FCFA`);
    expect(formatMoney(0, 'XOF')).toBe(`0${N}FCFA`);
  });
  it('formate les négatifs et le signe', () => {
    expect(formatMoney(-5000, 'XOF')).toBe(`-5${N}000${N}FCFA`);
    expect(formatMoney(5000, 'XOF', { signed: true })).toBe(`+5${N}000${N}FCFA`);
  });
  it('formate les devises à centimes', () => {
    expect(formatMoney(123456, 'EUR')).toBe(`1${N}234,56${N}€`);
    expect(formatMoney(1050, 'USD')).toBe(`$10,50`);
  });
  it('format compact', () => {
    expect(compactNumber(1_250_000)).toBe(`1,25${N}M`);
    expect(compactNumber(450_000)).toBe(`450${N}k`);
  });
});

describe('parseAmountInput', () => {
  it('accepte les séparateurs usuels', () => {
    expect(parseAmountInput('450000')).toBe(450000);
    expect(parseAmountInput('450 000')).toBe(450000);
    expect(parseAmountInput('450.000')).toBe(450000);
    expect(parseAmountInput('5000 F')).toBe(5000);
  });
  it('gère les décimales des devises à centimes', () => {
    expect(parseAmountInput('12,50', 'EUR')).toBe(1250);
    expect(parseAmountInput('12.5', 'EUR')).toBe(1250);
    expect(parseAmountInput('1 250,75', 'EUR')).toBe(125075);
  });
  it('refuse les montants négatifs ou invalides', () => {
    expect(parseAmountInput('-5000')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('12,5')).toBeNull(); // XOF : pas de décimales
  });
});

describe('isValidAmount', () => {
  it('rejette 0, négatif, décimal', () => {
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(1.5)).toBe(false);
    expect(isValidAmount(NaN)).toBe(false);
    expect(isValidAmount(1)).toBe(true);
  });
  it('arrondit à un pas', () => {
    expect(roundTo(222_222, 1000)).toBe(222_000);
    expect(roundTo(1234, 5, 'EUR')).toBe(1000);
  });
});
