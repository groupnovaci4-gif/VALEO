/**
 * Voix premium (ElevenLabs) — logique PURE, sans dépendance Firebase (testée).
 * La clé ELEVENLABS_API_KEY n'existe que dans les secrets Functions : jamais
 * dans l'application ni dans Git. Le texte n'est jamais journalisé.
 */
export const SPEAK_MAX_CHARS = 300;
export const VOICE_DAILY_LIMIT = 60;
export const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

export type SpeakInput = { text: string; language: 'fr' | 'en' };

/** Valide la requête ; renvoie un code d'erreur stable sinon. */
export function validateSpeak(data: unknown): SpeakInput | { error: 'text/invalid' | 'text/too-long' } {
  const d = (data ?? {}) as { text?: unknown; language?: unknown };
  if (typeof d.text !== 'string' || !d.text.trim()) return { error: 'text/invalid' };
  const text = d.text.trim();
  if (text.length > SPEAK_MAX_CHARS) return { error: 'text/too-long' };
  return { text, language: d.language === 'en' ? 'en' : 'fr' };
}

/** Requête HTTP vers l'API de synthèse (MP3 compact, adapté au mobile). */
export function elevenLabsRequest(input: SpeakInput, voiceId: string, apiKey: string): { url: string; init: RequestInit } {
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
    init: {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: input.text, model_id: ELEVENLABS_MODEL, language_code: input.language }),
    },
  };
}

/** Compteur quotidien (document usage/{uid}, champs dédiés : n'efface pas les autres compteurs). */
export function nextVoiceUsage(current: { voiceDay?: unknown; voice?: unknown }, day: string): { allowed: boolean; patch: { voiceDay: string; voice: number } } {
  const count = current.voiceDay === day ? Number(current.voice ?? 0) : 0;
  return { allowed: count < VOICE_DAILY_LIMIT, patch: { voiceDay: day, voice: count + 1 } };
}
