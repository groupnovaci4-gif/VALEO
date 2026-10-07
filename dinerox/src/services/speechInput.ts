/**
 * Saisie vocale (dictée) : voix → TEXTE uniquement. Le texte passe ensuite par
 * le parseur local déterministe (core/entry/parse) puis par la carte de
 * confirmation : rien n'est enregistré sans l'accord de l'utilisateur.
 *
 * Fournisseur : `expo-speech-recognition` (reconnaissance du téléphone, sur
 * l'appareil quand c'est possible). L'audio n'est jamais stocké ni envoyé aux
 * serveurs DineroX. Module chargé à la demande : s'il manque (Expo Go, test),
 * la saisie vocale se déclare indisponible et la phrase écrite prend le relais.
 */
export type SpeechLanguage = 'fr' | 'en';
export type SpeechPermission = 'granted' | 'denied' | 'undetermined';

export interface ListenOptions {
  language: SpeechLanguage;
  onPartial?: (text: string) => void;
  /** Exiger la reconnaissance sur l'appareil (si le téléphone le permet). */
  onDeviceOnly?: boolean;
  /** Mots attendus (vocabulaire local) : aide la reconnaissance quand le service le permet. */
  contextualStrings?: string[];
}

export interface SpeechInputProvider {
  readonly id: string;
  /** Matériel et service de reconnaissance disponibles. */
  isAvailable(): Promise<boolean>;
  /** La reconnaissance peut-elle se faire sans réseau, sur le téléphone ? */
  supportsOnDevice(): boolean;
  permission(): Promise<SpeechPermission>;
  requestPermission(): Promise<SpeechPermission>;
  /**
   * Écoute jusqu'à la fin de la phrase (silence) ou `stop()` et résout avec la
   * transcription finale (éventuellement vide) ; `onPartial` reçoit les
   * résultats intermédiaires. Rejette avec `SpeechInputError`.
   */
  listen(opts: ListenOptions): Promise<string>;
  stop(): Promise<void>;
}

export class SpeechInputUnavailable extends Error {
  constructor() {
    super('speech-input/unavailable');
  }
}

/** Erreur de reconnaissance (code du service : `not-allowed`, `no-speech`, `network`…). */
export class SpeechInputError extends Error {
  constructor(public readonly code: string) {
    super(`speech-input/${code}`);
  }
}

/** Fournisseur nul : aucune reconnaissance. */
export const noSpeechInput: SpeechInputProvider = {
  id: 'none',
  async isAvailable() {
    return false;
  },
  supportsOnDevice() {
    return false;
  },
  async permission() {
    return 'denied';
  },
  async requestPermission() {
    return 'denied';
  },
  async listen() {
    throw new SpeechInputUnavailable();
  },
  async stop() {
    /* rien à arrêter */
  },
};

type Module = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
let loaded: Module | null | undefined;
function mod(): Module | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = (require('expo-speech-recognition') as typeof import('expo-speech-recognition')).ExpoSpeechRecognitionModule ?? null;
  } catch {
    loaded = null;
  }
  return loaded;
}

const toPermission = (r: { granted: boolean; status?: string; canAskAgain?: boolean }): SpeechPermission => (r.granted ? 'granted' : r.status === 'undetermined' ? 'undetermined' : 'denied');

export const deviceSpeechInput: SpeechInputProvider = {
  id: 'device',
  async isAvailable() {
    const M = mod();
    try {
      return !!M && M.isRecognitionAvailable();
    } catch {
      return false;
    }
  },
  supportsOnDevice() {
    try {
      return !!mod()?.supportsOnDeviceRecognition();
    } catch {
      return false;
    }
  },
  async permission() {
    const M = mod();
    if (!M) return 'denied';
    return toPermission(await M.getPermissionsAsync());
  },
  async requestPermission() {
    const M = mod();
    if (!M) return 'denied';
    return toPermission(await M.requestPermissionsAsync());
  },
  listen({ language, onPartial, onDeviceOnly, contextualStrings }) {
    const M = mod();
    if (!M) return Promise.reject(new SpeechInputUnavailable());
    return new Promise<string>((resolve, reject) => {
      let final = '';
      let latest = '';
      let settled = false;
      const subs: { remove: () => void }[] = [];
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        subs.forEach((s) => s.remove());
        fn();
      };
      subs.push(
        M.addListener('result', (e) => {
          const text = e.results[0]?.transcript ?? '';
          latest = text || latest;
          if (e.isFinal) final = text;
          else onPartial?.(text);
        }),
        M.addListener('error', (e) => {
          // Silence sans parole : pas une erreur, juste aucune phrase.
          if (e.error === 'no-speech' || e.error === 'aborted') done(() => resolve(final || latest));
          else done(() => reject(new SpeechInputError(e.error)));
        }),
        M.addListener('end', () => done(() => resolve(final || latest))),
      );
      try {
        M.start({
          lang: language === 'en' ? 'en-US' : 'fr-FR',
          interimResults: true,
          continuous: false,
          requiresOnDeviceRecognition: !!onDeviceOnly && M.supportsOnDeviceRecognition(),
          addsPunctuation: false,
          contextualStrings: contextualStrings?.slice(0, 100),
          // Arrêt automatique après un silence (~2 s).
          androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000, EXTRA_LANGUAGE_MODEL: 'web_search' },
        });
      } catch {
        done(() => reject(new SpeechInputUnavailable()));
      }
    });
  },
  async stop() {
    try {
      mod()?.stop();
    } catch {
      /* déjà arrêté */
    }
  },
};

let provider: SpeechInputProvider | null = null;

export function speechInput(): SpeechInputProvider {
  return provider ?? deviceSpeechInput;
}

/** Remplace le fournisseur (tests) ; null = fournisseur du téléphone. */
export function setSpeechInputProvider(p: SpeechInputProvider | null): void {
  provider = p;
}
