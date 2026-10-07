/** Saisie vocale (Lot A, phase 3) : fournisseur interchangeable, permission micro déclarée, dépendance présente. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
      const loc = JSON.parse(readFileSync(new URL(`locales/${l}.json`, root), 'utf8')) as Record<string, string>;
      expect(loc.NSMicrophoneUsageDescription.length).toBeGreaterThan(20);
      expect(loc.NSSpeechRecognitionUsageDescription.length).toBeGreaterThan(20);
    }
  });
});
