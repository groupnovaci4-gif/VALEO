import { describe, expect, it, vi } from 'vitest';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import type { TxError } from '../src/core/transactions';
import type { SavingsError } from '../src/core/savings';
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }] }));

describe('i18n', () => {
  it('chaque clé française existe en anglais et inversement', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
  it('les paramètres sont identiques dans les deux langues', () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(params(en[k]), k).toBe(params(fr[k]));
    }
  });
  it('chaque code d’erreur affiché par `error.<code>` a son message (opérations, épargne)', () => {
    // Record exhaustif : un nouveau code oublié ici fait échouer la vérification de types.
    const tx: Record<TxError, true> = {
      'amount.invalid': true, 'date.invalid': true, 'account.missing': true, 'account.inactive': true, 'transfer.sameAccount': true,
      'transfer.missingTarget': true, 'transfer.currencyMismatch': true, 'currency.mismatch': true, 'goal.inactive': true,
      'goal.withdrawTooMuch': true, 'reserve.unavailable': true, 'reserve.category': true, 'category.merge': true,
      'category.missing': true, 'savings.notSavings': true, 'savings.goalPartTooBig': true, 'savings.insufficient': true,
    };
    const sav: Record<SavingsError, true> = {
      'amount.invalid': true, 'date.invalid': true, 'account.missing': true, 'account.inactive': true, 'savings.notSavings': true,
      'transfer.sameAccount': true, 'transfer.currencyMismatch': true, 'savings.goalPartTooBig': true, 'savings.insufficient': true,
      'goal.withdrawTooMuch': true, 'goal.inactive': true,
    };
    for (const code of new Set([...Object.keys(tx), ...Object.keys(sav)])) expect(fr, code).toHaveProperty([`error.${code}`]);
  });
  it('interpole les paramètres et le nom de marque', async () => {
    const { translate } = await import('../src/i18n/index');
    expect(translate('fr', 'home.hello', { name: 'Awa' })).toBe('Bonjour Awa 👋');
    expect(translate('fr', 'tab.assistant')).toBe('DineroX');
  });
});
