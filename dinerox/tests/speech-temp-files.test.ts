/**
 * Fichiers temporaires vides de la reconnaissance vocale (Android 13+, mode continu) :
 * `expo-speech-recognition` crée `temp_<uuid>.pcm` dans le cache à chaque démarrage du
 * moteur et ne le supprime jamais. Le filtre ne vise QUE ces fichiers (décision du fondateur, option B).
 */
import { describe, expect, it } from 'vitest';
import { isSpeechTempFile } from '../src/core/entry/speechTempFiles';

describe('nettoyage des temp_*.pcm de la reconnaissance vocale', () => {
  it('vise les fichiers temp_<uuid>.pcm créés par la bibliothèque', () => {
    expect(isSpeechTempFile('temp_3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b.pcm')).toBe(true);
    expect(isSpeechTempFile('temp_3F2B8C1E-9A4D-4E7F-8B21-0C5D6E7F8A9B.pcm')).toBe(true);
  });
  it('ne touche à rien d’autre : voix du coach (mp3), exports, autres fichiers temporaires, dossiers', () => {
    for (const name of [
      'a1b2c3d4e5f6.mp3',
      'coach-voice',
      'dinerox-export-2026-10-15.csv',
      'temp_3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b.wav',
      'temp_3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b.pcm.bak',
      'xtemp_3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b.pcm',
      'temp_.pcm',
      'temp_photo.pcm',
      'recording.pcm',
      '../temp_3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b.pcm',
      '',
    ]) expect(isSpeechTempFile(name), name).toBe(false);
  });
});
