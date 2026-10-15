/**
 * Fichiers temporaires de la reconnaissance vocale — module PUR (testé :
 * tests/speech-temp-files.test.ts).
 *
 * Sur Android 13 et plus, en mode continu, `expo-speech-recognition` (57.1.0) crée à chaque
 * démarrage du moteur un fichier `temp_<uuid>.pcm` dans le cache de l'application
 * (ExpoAudioRecorder.createTempPcmFile). Sans enregistrement demandé, aucun son n'y est écrit
 * (fichier vide), mais il n'est jamais supprimé. On les efface (décision du fondateur,
 * option B) — et SEULEMENT eux : jamais la voix du coach (mp3), les exports ni autre chose.
 */
const SPEECH_TEMP_FILE = /^temp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pcm$/i;

export function isSpeechTempFile(name: string): boolean {
  return SPEECH_TEMP_FILE.test(name);
}
