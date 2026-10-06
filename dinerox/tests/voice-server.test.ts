/** Phase 3 — Cloud Function `speak` : validations serveur (logique pure). */
import { describe, expect, it } from 'vitest';
import { SPEAK_MAX_CHARS, VOICE_DAILY_LIMIT, elevenLabsRequest, nextVoiceUsage, validateSpeak } from '../firebase/functions/src/voice';

describe('speak : validations serveur', () => {
  it('texte obligatoire, 300 caractères maximum, langue fr/en', () => {
    expect(validateSpeak({})).toEqual({ error: 'text/invalid' });
    expect(validateSpeak({ text: '   ' })).toEqual({ error: 'text/invalid' });
    expect(validateSpeak({ text: 'x'.repeat(SPEAK_MAX_CHARS + 1) })).toEqual({ error: 'text/too-long' });
    expect(validateSpeak({ text: ' Bonjour ', language: 'xx' })).toEqual({ text: 'Bonjour', language: 'fr' });
    expect(validateSpeak({ text: 'Hi', language: 'en' })).toEqual({ text: 'Hi', language: 'en' });
  });
  it('limite quotidienne, remise à zéro le lendemain, compteur dédié', () => {
    expect(nextVoiceUsage({}, '2026-10-10')).toEqual({ allowed: true, patch: { voiceDay: '2026-10-10', voice: 1 } });
    expect(nextVoiceUsage({ voiceDay: '2026-10-10', voice: VOICE_DAILY_LIMIT }, '2026-10-10').allowed).toBe(false);
    expect(nextVoiceUsage({ voiceDay: '2026-10-09', voice: VOICE_DAILY_LIMIT }, '2026-10-10')).toEqual({ allowed: true, patch: { voiceDay: '2026-10-10', voice: 1 } });
    // Le patch ne touche jamais au compteur de l'assistant (day / ai).
    expect(Object.keys(nextVoiceUsage({}, '2026-10-10').patch).sort()).toEqual(['voice', 'voiceDay']);
  });
  it('requête ElevenLabs : clé en en-tête uniquement, jamais dans l’URL', () => {
    const r = elevenLabsRequest({ text: 'Bonjour', language: 'fr' }, 'voix/1', 'SECRET');
    expect(r.url).not.toContain('SECRET');
    expect(r.url).toContain('voix%2F1');
    expect((r.init.headers as Record<string, string>)['xi-api-key']).toBe('SECRET');
    expect(JSON.parse(String(r.init.body))).toMatchObject({ text: 'Bonjour', language_code: 'fr' });
  });
});
