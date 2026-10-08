/** Saisie vocale (Lot A, phase 3) : fournisseur interchangeable, permission micro déclarée, dépendance présente. */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android', Version: 34 }, AppState: { addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock('expo-haptics', () => ({ impactAsync: async () => undefined, ImpactFeedbackStyle: { Medium: 'm', Light: 'l' } }));
import { noSpeechInput, setSpeechInputProvider, speechInput, SpeechInputUnavailable, type SpeechInputProvider } from '../src/services/speechInput';

const root = new URL('../', import.meta.url);

describe('saisie vocale', () => {
  it('fournisseur nul : indisponible, et l’écoute échoue proprement', async () => {
    expect(await noSpeechInput.isAvailable()).toBe(false);
    expect(await noSpeechInput.permission()).toBe('denied');
    await expect(noSpeechInput.listen({ language: 'fr' })).rejects.toBeInstanceOf(SpeechInputUnavailable);
    await expect(noSpeechInput.stop()).resolves.toBeUndefined();
  });

  it('un fournisseur se branche sans toucher aux écrans, et se retire', async () => {
    const fake: SpeechInputProvider = {
      id: 'fake',
      isAvailable: async () => true,
      supportsOnDevice: () => true,
      permission: async () => 'granted',
      requestPermission: async () => 'granted',
      startEngine: () => undefined,
      stopEngine: () => undefined,
      abortEngine: () => undefined,
      listen: async ({ onPartial }) => (onPartial?.('Taxi'), 'Taxi 2 000'),
      stop: async () => undefined,
    };
    setSpeechInputProvider(fake);
    expect(speechInput().id).toBe('fake');
    const partials: string[] = [];
    expect(await speechInput().listen({ language: 'fr', onPartial: (p) => partials.push(p) })).toBe('Taxi 2 000');
    expect(partials).toEqual(['Taxi']);
    setSpeechInputProvider(null);
    expect(speechInput().id).toBe('device');
  });

  it('reconnaissance du téléphone installée ; micro déclaré (plus bloqué) avec ses textes FR/EN', () => {
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['expo-speech-recognition']).toMatch(/^\^?57\./);
    const config = readFileSync(new URL('app.config.ts', root), 'utf8');
    expect(config).not.toMatch(/blockedPermissions:\s*\[[^\]]*RECORD_AUDIO/);
    expect(config).toContain("'expo-speech-recognition'");
    for (const l of ['fr', 'en']) {
      // Textes iOS rangés sous `ios` : à la racine, Expo les copierait aussi en ressources
      // Android sans valeur par défaut, et le lint de la compilation release échouerait
      // (ExtraTranslation, build EAS du 7 octobre 2026).
      const loc = JSON.parse(readFileSync(new URL(`locales/${l}.json`, root), 'utf8')) as { ios?: Record<string, string> };
      expect(Object.keys(loc)).toEqual(['ios']);
      expect(loc.ios?.NSMicrophoneUsageDescription.length).toBeGreaterThan(20);
      expect(loc.ios?.NSSpeechRecognitionUsageDescription.length).toBeGreaterThan(20);
    }
  });
});
