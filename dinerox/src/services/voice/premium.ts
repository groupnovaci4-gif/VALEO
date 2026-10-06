/**
 * Voix premium (désactivée par défaut) : Cloud Function `speak` → ElevenLabs.
 * L'audio est mis en cache sur l'appareil (clé = empreinte texte + voix + langue)
 * pour ne jamais payer deux fois la même phrase. Toute erreur → voix de l'appareil.
 */
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { Directory, File, Paths } from 'expo-file-system';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { firebase } from '../firebase';
import { cacheKey, type PreparedProvider, type SpeakOptions } from './queue';

const VOICE = 'default';
let player: AudioPlayer | null = null;
const prepared = new Map<string, string>();

function cacheFile(text: string, language: string): File {
  const dir = new Directory(Paths.cache, 'coach-voice');
  if (!dir.exists) dir.create({ idempotent: true });
  return new File(dir, `${cacheKey(text, VOICE, language)}.mp3`);
}

export function premiumVoice(enabled: () => boolean): PreparedProvider {
  return {
    id: 'premium',
    async isAvailable() {
      return Platform.OS !== 'web' && enabled();
    },
    async prepare(text: string, opts: SpeakOptions) {
      const file = cacheFile(text, opts.language);
      if (!file.exists) {
        const fn = httpsCallable<{ text: string; language: string }, { audio: string }>(firebase().functions, 'speak', { timeout: 5000 });
        const { data } = await fn({ text, language: opts.language });
        file.create();
        file.write(data.audio, { encoding: 'base64' });
      }
      prepared.set(text, file.uri);
    },
    async speak(text: string) {
      const uri = prepared.get(text);
      if (!uri) throw new Error('voice/not-prepared');
      prepared.delete(text);
      player?.remove();
      const p = createAudioPlayer(uri);
      player = p;
      await new Promise<void>((resolve) => {
        const guard = setTimeout(resolve, 30_000);
        const sub = p.addListener('playbackStatusUpdate', (s) => {
          if (s.didJustFinish) {
            clearTimeout(guard);
            sub.remove();
            resolve();
          }
        });
        p.play();
      });
      p.remove();
      if (player === p) player = null;
    },
    async stop() {
      player?.pause();
      player?.remove();
      player = null;
    },
  };
}
