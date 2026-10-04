import { describe, expect, it, vi } from 'vitest';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
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
  it('interpole les paramètres et le nom de marque', async () => {
    const { translate } = await import('../src/i18n/index');
    expect(translate('fr', 'home.hello', { name: 'Awa' })).toBe('Bonjour Awa 👋');
    expect(translate('fr', 'tab.assistant')).toBe('KAP');
  });
});
