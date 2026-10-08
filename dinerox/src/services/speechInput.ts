/**
 * Saisie vocale (dictée) : voix → TEXTE uniquement. Le texte passe ensuite par
 * le parseur local déterministe (core/entry/parse) puis par la carte de
 * confirmation : rien n'est enregistré sans l'accord de l'utilisateur.
 *
 * Fournisseur : `expo-speech-recognition` (reconnaissance du téléphone, sur
 * l'appareil quand c'est possible). L'audio n'est jamais stocké ni envoyé aux
 * serveurs DineroX. Module chargé à la demande : s'il manque (Expo Go, test),
 * la saisie vocale se déclare indisponible et la phrase écrite prend le relais.
 *
 * Enregistrement « comme WhatsApp » (1.8) : AUCUN arrêt sur silence. Le moteur
 * du téléphone, lui, s'arrête de lui-même quand il n'entend plus de voix : la
 * machine d'états `core/entry/recorder.ts` le relance aussitôt et raccorde les
 * morceaux. Seul le toucher de l'utilisateur arrête l'enregistrement
 * (`services/voiceRecorder.ts`).
 */
import { Platform } from 'react-native';
import { setMicOpen } from './voice/micGate';

export type SpeechLanguage = 'fr' | 'en';
export type SpeechPermission = 'granted' | 'denied' | 'undetermined';

export interface ListenOptions {
  language: SpeechLanguage;
  /** Texte reconnu jusqu'ici (morceaux raccordés + morceau en cours). */
  onPartial?: (text: string) => void;
  /** Exiger la reconnaissance sur l'appareil (si le téléphone le permet). */
  onDeviceOnly?: boolean;
  /** Mots attendus (vocabulaire local) : aide la reconnaissance quand le service le permet. */
  contextualStrings?: string[];
}

/** Événements d'UNE session du moteur (de son démarrage à son arrêt). */
export interface EngineHandlers {
  onResult: (text: string, isFinal: boolean) => void;
  /** Le moteur s'est arrêté (de lui-même ou sur demande). */
  onEnd: () => void;
  /** Erreur (code du service : `no-speech`, `network`, `not-allowed`…), suivie d'aucun `onEnd`. */
  onError: (code: string) => void;
  /** Niveau sonore de -2 à 10 (en dessous de 0 : inaudible), si le téléphone le fournit. */
  onVolume?: (level: number) => void;
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
   * Démarre une session du moteur. Les événements arrivent dans `handlers`
   * jusqu'au premier `onEnd` ou `onError` (après quoi plus rien n'arrive de
   * cette session). L'enregistreur relance une nouvelle session tant que
   * l'utilisateur n'a pas touché « stop ».
   */
  startEngine(opts: Omit<ListenOptions, 'onPartial'>, handlers: EngineHandlers): void;
  /** Arrêt propre : le moteur livre son dernier morceau puis `onEnd`. */
  stopEngine(): void;
  /** Arrêt immédiat, sans dernier morceau. */
  abortEngine(): void;
  /**
   * Écoute jusqu'au `stop()` de l'utilisateur (jamais sur un silence) et
   * résout avec la transcription complète (éventuellement vide). Rejette
   * avec `SpeechInputError`. Utilisée par la dictée de l'assistant.
   */
  listen(opts: ListenOptions): Promise<string>;
  stop(): Promise<void>;
}

export class SpeechInputUnavailable extends Error {
  constructor() {
    super('speech-input/unavailable');
  }
}

/** Erreur de reconnaissance (code du service : `not-allowed`, `network`…). */
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
  startEngine(_opts, handlers) {
    handlers.onError('unavailable');
  },
  stopEngine() {
    /* rien à arrêter */
  },
  abortEngine() {
    /* rien à arrêter */
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

/** Reconnaissance continue : iOS, web, et Android 13 et plus (en dessous, la relance prend le relais). */
function continuousSupported(): boolean {
  if (Platform.OS !== 'android') return true;
  return typeof Platform.Version === 'number' && Platform.Version >= 33;
}

/** Session en cours : ses abonnements, et le premier arrêt (fin ou erreur) déjà signalé. */
let session: { subs: { remove: () => void }[]; closed: boolean } | null = null;

function closeSession() {
  if (!session) return;
  session.closed = true;
  session.subs.forEach((s) => s.remove());
  session = null;
}

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
  startEngine({ language, onDeviceOnly, contextualStrings }, h) {
    const M = mod();
    if (!M) return h.onError('unavailable');
    closeSession();
    const own = { subs: [] as { remove: () => void }[], closed: false };
    session = own;
    // Le service signale souvent une erreur PUIS une fin : un seul des deux compte,
    // et plus rien n'arrive de cette session ensuite (sinon une fin tardive
    // déclencherait une relance de trop).
    let pendingError: string | null = null;
    let errorTimer: ReturnType<typeof setTimeout> | null = null;
    const close = (fn: () => void) => {
      if (own.closed) return;
      if (errorTimer) clearTimeout(errorTimer);
      own.closed = true;
      own.subs.forEach((s) => s.remove());
      if (session === own) session = null;
      fn();
    };
    own.subs.push(
      M.addListener('result', (e) => {
        if (!own.closed) h.onResult(e.results[0]?.transcript ?? '', !!e.isFinal);
      }),
      M.addListener('error', (e) => {
        if (own.closed) return;
        pendingError = e.error;
        // Pas de fin derrière l'erreur (certains services) : on la signale quand même.
        errorTimer = setTimeout(() => close(() => h.onError(pendingError ?? 'unknown')), 400);
      }),
      M.addListener('end', () => close(() => (pendingError ? h.onError(pendingError) : h.onEnd()))),
      M.addListener('volumechange', (e) => {
        if (!own.closed) h.onVolume?.(e.value);
      }),
    );
    try {
      M.start({
        lang: language === 'en' ? 'en-US' : 'fr-FR',
        interimResults: true,
        // Continu quand le téléphone le permet ; sinon la relance automatique le remplace.
        continuous: continuousSupported(),
        requiresOnDeviceRecognition: !!onDeviceOnly && M.supportsOnDeviceRecognition(),
        addsPunctuation: false,
        contextualStrings: contextualStrings?.slice(0, 100),
        // AUCUNE option de silence (EXTRA_SPEECH_INPUT_*_SILENCE_LENGTH_MILLIS) : seul le toucher arrête.
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
    } catch {
      close(() => h.onError('unavailable'));
    }
  },
  stopEngine() {
    try {
      mod()?.stop();
    } catch {
      /* déjà arrêté */
    }
  },
  abortEngine() {
    closeSession();
    try {
      mod()?.abort();
    } catch {
      /* déjà arrêté */
    }
  },
  listen(opts) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recordUntilStopped } = require('./voiceRecorder') as typeof import('./voiceRecorder');
    return recordUntilStopped(deviceSpeechInput, opts);
  },
  async stop() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { stopActiveRecording } = require('./voiceRecorder') as typeof import('./voiceRecorder');
    if (!stopActiveRecording()) deviceSpeechInput.stopEngine();
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

/** Micro ouvert (la voix du coach se tait) : signalé par l'enregistreur. */
export function markMicOpen(open: boolean): void {
  setMicOpen(open);
}
