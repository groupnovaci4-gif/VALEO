/**
 * Voix de l'appareil (expo-speech) : gratuite, hors ligne, par défaut.
 * Meilleure voix disponible pour la langue (qualité « Enhanced » d'abord).
 */
import * as Speech from 'expo-speech';
import type { PreparedProvider, SpeakOptions } from './queue';

const LOCALE: Record<SpeakOptions['language'], string> = { fr: 'fr-FR', en: 'en-US' };
const chosen = new Map<string, Promise<string | undefined>>();

/**
 * Liste des voix, bornée à 1,5 s : sans voix installée, certaines plateformes
 * (web) n'y répondent jamais — la file vocale resterait bloquée. Au-delà : voix
 * par défaut du système.
 */
function voicesWithin(ms: number): Promise<Speech.Voice[]> {
  return Promise.race([Speech.getAvailableVoicesAsync(), new Promise<Speech.Voice[]>((r) => setTimeout(() => r([]), ms))]);
}

function bestVoice(language: SpeakOptions['language']): Promise<string | undefined> {
  let p = chosen.get(language);
  if (!p) {
    p = voicesWithin(1500)
      .then((voices) => {
        const locale = LOCALE[language].toLowerCase();
        const match = voices.filter((v) => v.language?.toLowerCase().replace('_', '-').startsWith(language));
        const score = (v: Speech.Voice) => (v.quality === Speech.VoiceQuality.Enhanced ? 2 : 0) + (v.language?.toLowerCase().replace('_', '-') === locale ? 1 : 0);
        return match.sort((a, b) => score(b) - score(a))[0]?.identifier;
      })
      .catch(() => undefined);
    chosen.set(language, p);
  }
  return p;
}

export const deviceVoice: PreparedProvider = {
  id: 'device',
  async isAvailable() {
    return true;
  },
  async speak(text, opts) {
    const voice = await bestVoice(opts.language);
    await new Promise<void>((resolve, reject) => {
      // Garde-fou : certaines plateformes ne signalent jamais la fin de lecture.
      const guard = setTimeout(resolve, 3000 + text.length * 120);
      const done = () => (clearTimeout(guard), resolve());
      Speech.speak(text, {
        language: LOCALE[opts.language],
        voice,
        rate: 0.98,
        onDone: done,
        onStopped: done,
        onError: (e) => (clearTimeout(guard), reject(e)),
      });
    });
  },
  async stop() {
    await Speech.stop();
  },
};
