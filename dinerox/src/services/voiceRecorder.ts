/**
 * Contrôleur de l'enregistreur vocal : branche la machine d'états PURE
 * (`core/entry/recorder.ts`) sur le moteur du téléphone, l'horloge, les
 * vibrations et le passage en arrière-plan. Aucune décision ici : chaque
 * événement passe par `recorderReducer`, qui dit quoi faire.
 *
 * Seul le toucher de l'utilisateur arrête l'enregistrement : quand le moteur
 * s'arrête de lui-même (silence), il est relancé aussitôt.
 */
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { initialRecorder, liveTranscript, recorderReducer, type RecorderEffect, type RecorderNotice, type RecorderEvent, type RecorderState } from '@/core/entry/recorder';
import { markMicOpen, SpeechInputError, type ListenOptions, type SpeechInputProvider } from './speechInput';

/** Délai avant de relancer le moteur (Android refuse un redémarrage instantané : « recognizer busy »). */
const RESTART_DELAY_MS = 120;
const TICK_MS = 250;

export interface RecorderCallbacks {
  /** Nouvel état (texte en direct, chronomètre…). */
  onState?: (s: RecorderState) => void;
  /** Texte final à analyser. */
  onDeliver?: (text: string) => void;
  /** Message « il reste 30 secondes ». */
  onWarn?: () => void;
  /** Niveau sonore normalisé 0..1 (onde). */
  onVolume?: (level: number) => void;
  /** Fin sans texte (rien dit, moteur absent, micro refusé) : signalée une fois. */
  onNotice?: (n: Exclude<RecorderNotice, null>, errorCode: string | null) => void;
}

export class VoiceRecorder {
  private s: RecorderState = initialRecorder(Date.now());
  private tick: ReturnType<typeof setInterval> | null = null;
  private restart: ReturnType<typeof setTimeout> | null = null;
  private appSub: { remove: () => void } | null = null;
  private disposed = false;

  constructor(
    private readonly provider: SpeechInputProvider,
    private readonly opts: Omit<ListenOptions, 'onPartial'>,
    private readonly cb: RecorderCallbacks = {},
    private readonly now: () => number = Date.now,
  ) {}

  get state(): RecorderState {
    return this.s;
  }

  /** Toucher le micro ou le bouton d'arrêt. */
  tap(): void {
    this.send({ type: 'tap', at: this.now() });
  }

  /** Corbeille. */
  cancel(): void {
    this.send({ type: 'cancel', at: this.now() });
  }

  denied(): void {
    this.send({ type: 'denied', at: this.now() });
  }

  processed(ok: boolean): void {
    this.send({ type: 'processed', ok, at: this.now() });
  }

  reset(): void {
    this.send({ type: 'reset', at: this.now() });
  }

  /** Fermeture de l'écran : arrêt immédiat, rien n'est livré. */
  dispose(): void {
    if (this.disposed) return;
    if (this.s.status === 'recording' || this.s.flushing) this.send({ type: 'cancel', at: this.now() });
    this.disposed = true;
    this.stopClock();
  }

  private send(e: RecorderEvent): void {
    if (this.disposed) return;
    const out = recorderReducer(this.s, e);
    const was = this.s.status;
    const before = this.s;
    this.s = out.state;
    for (const fx of out.effects) this.run(fx);
    const active = this.s.status === 'recording' || this.s.flushing;
    if (active && !this.tick) this.startClock();
    if (!active && this.tick) this.stopClock();
    if (was !== this.s.status) markMicOpen(this.s.status === 'recording');
    if (this.s.notice && this.s !== before && (this.s.notice !== before.notice || this.s.changedAt !== before.changedAt)) this.cb.onNotice?.(this.s.notice, this.s.errorCode);
    this.cb.onState?.(this.s);
  }

  private engineHandlers() {
    return {
      onResult: (text: string, isFinal: boolean) => this.send({ type: 'result', text, isFinal, at: this.now() }),
      onEnd: () => this.send({ type: 'engineEnd', at: this.now() }),
      onError: (code: string) => this.send({ type: 'engineError', code, at: this.now() }),
      onVolume: (v: number) => this.cb.onVolume?.(Math.max(0, Math.min(1, v / 10))),
    };
  }

  private run(fx: RecorderEffect): void {
    switch (fx.type) {
      case 'startEngine':
        this.provider.startEngine(this.opts, this.engineHandlers());
        return;
      case 'restartEngine':
        if (this.restart) clearTimeout(this.restart);
        this.restart = setTimeout(() => {
          this.restart = null;
          if (!this.disposed && this.s.status === 'recording') this.provider.startEngine(this.opts, this.engineHandlers());
        }, RESTART_DELAY_MS);
        return;
      case 'stopEngine':
        if (this.restart) {
          // Arrêt pendant une relance : aucun moteur ne tourne, rien à attendre.
          clearTimeout(this.restart);
          this.restart = null;
          setTimeout(() => this.send({ type: 'engineEnd', at: this.now() }), 0);
          return;
        }
        this.provider.stopEngine();
        return;
      case 'abortEngine':
        if (this.restart) clearTimeout(this.restart);
        this.restart = null;
        this.provider.abortEngine();
        return;
      case 'haptic':
        void Haptics.impactAsync(fx.kind === 'start' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        return;
      case 'warnLimit':
        this.cb.onWarn?.();
        return;
      case 'deliver':
        this.cb.onDeliver?.(fx.text);
        return;
    }
  }

  private startClock(): void {
    this.tick = setInterval(() => this.send({ type: 'tick', at: this.now() }), TICK_MS);
    // Application mise en arrière-plan ou téléphone qui sonne : arrêt propre, le texte est gardé.
    this.appSub = AppState.addEventListener('change', (st: AppStateStatus) => {
      if (st === 'background') this.send({ type: 'background', at: this.now() });
    });
  }

  private stopClock(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.appSub?.remove();
    this.appSub = null;
  }
}

/** Enregistrement en cours lancé par `recordUntilStopped` (dictée de l'assistant). */
let active: VoiceRecorder | null = null;

/**
 * Enregistre jusqu'au toucher « stop » (`stopActiveRecording`) et résout avec
 * le texte complet (vide si rien n'a été dit). Aucun arrêt sur silence.
 */
export function recordUntilStopped(provider: SpeechInputProvider, opts: ListenOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let done = false;
    const rec = new VoiceRecorder(provider, opts, {
      onState: (s) => {
        if (s.status === 'recording') opts.onPartial?.(liveTranscript(s));
        if (done) return;
        if (s.status === 'denied') {
          done = true;
          active = null;
          reject(new SpeechInputError('not-allowed'));
        } else if (s.status === 'idle' || s.status === 'cancelled') {
          done = true;
          active = null;
          if (s.notice === 'unavailable') reject(new SpeechInputError('unavailable'));
          else resolve('');
        }
      },
      onDeliver: (text) => {
        if (done) return;
        done = true;
        active = null;
        rec.processed(true);
        resolve(text);
      },
    });
    active?.dispose();
    active = rec;
    rec.tap();
  });
}

/** Arrête l'enregistrement de `recordUntilStopped` (toucher « stop »). Faux si aucun n'est en cours. */
export function stopActiveRecording(): boolean {
  if (!active) return false;
  // Même règle que le micro principal : « stop » moins d'une seconde après le début = annulation.
  active.tap();
  return true;
}
