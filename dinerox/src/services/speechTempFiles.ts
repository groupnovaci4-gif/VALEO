/**
 * Efface du cache les fichiers `temp_<uuid>.pcm` vides laissés par la reconnaissance vocale
 * (Android 13+, voir core/entry/speechTempFiles.ts). Appelé à la fin de chaque dictée et une
 * fois au démarrage. Jamais bloquant, jamais de message : une erreur est seulement comptée.
 */
import { Platform } from 'react-native';
import { isSpeechTempFile } from '@/core/entry/speechTempFiles';

export function purgeSpeechTempFiles(): { deleted: number; failed: number } {
  const result = { deleted: 0, failed: 0 };
  if (Platform.OS !== 'android') return result;
  try {
    // Chargé à la demande (comme la reconnaissance) : rien à faire hors Android.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    for (const entry of Paths.cache.list()) {
      if (!(entry instanceof File) || !isSpeechTempFile(entry.name)) continue;
      try {
        entry.delete();
        result.deleted += 1;
      } catch {
        result.failed += 1;
      }
    }
  } catch {
    result.failed += 1;
  }
  return result;
}
