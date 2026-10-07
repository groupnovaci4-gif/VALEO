/** Phase 7 — saisie vocale préparée mais NON activée (aucune dépendance, micro bloqué). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noSpeechInput, setSpeechInputProvider, speechInput, SpeechInputUnavailable, type SpeechInputProvider } from '../src/services/speechInput';

const root = new URL('../', import.meta.url);

describe('saisie vocale', () => {
  it('par défaut : indisponible, et l’écoute échoue proprement', async () => {
    expect(speechInput()).toBe(noSpeechInput);
    expect(await speechInput().isAvailable()).toBe(false);
    await expect(speechInput().listen({ language: 'fr' })).rejects.toBeInstanceOf(SpeechInputUnavailable);
    await expect(speechInput().stop()).resolves.toBeUndefined();
  });

  it('un fournisseur se branche sans toucher aux écrans, et se retire', async () => {
    const fake: SpeechInputProvider = { id: 'fake', isAvailable: async () => true, listen: async () => 'J’ai dépensé 5 000 au marché', stop: async () => undefined };
    setSpeechInputProvider(fake);
    expect(await speechInput().isAvailable()).toBe(true);
    expect(await speechInput().listen({ language: 'fr' })).toContain('5 000');
    setSpeechInputProvider(null);
    expect(speechInput()).toBe(noSpeechInput);
  });

  it('aucune dépendance de reconnaissance vocale, permission micro bloquée', () => {
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => /speech-recognition|voice|whisper/i.test(d))).toEqual([]);
    const config = readFileSync(new URL('app.config.ts', root), 'utf8');
    expect(config).toContain("blockedPermissions: ['android.permission.RECORD_AUDIO']");
    expect(config).toMatch(/microphonePermission:\s*false/);
  });
});
