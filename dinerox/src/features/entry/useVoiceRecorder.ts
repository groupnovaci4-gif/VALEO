/**
 * Enregistreur vocal pour un écran : état en direct (texte, chronomètre),
 * niveau sonore pour l'onde, et nettoyage à la fermeture.
 * La logique vit dans `core/entry/recorder.ts` (pure, testée).
 */
import { useEffect, useRef, useState } from 'react';
import { initialRecorder, type RecorderNotice, type RecorderState } from '@/core/entry/recorder';
import { speechInput, type ListenOptions } from '@/services/speechInput';
import { VoiceRecorder } from '@/services/voiceRecorder';

const WAVE_BARS = 28;

export function useVoiceRecorder(opts: Omit<ListenOptions, 'onPartial'>, handlers: { onDeliver: (text: string) => void; onWarn?: () => void; onNotice?: (n: Exclude<RecorderNotice, null>, errorCode: string | null) => void }) {
  const [state, setState] = useState<RecorderState>(() => initialRecorder(Date.now()));
  // Historique du niveau sonore (0..1) : l'onde défile de droite à gauche.
  const [levels, setLevels] = useState<number[]>([]);
  const [hasVolume, setHasVolume] = useState(false);
  const cb = useRef(handlers);
  useEffect(() => {
    cb.current = handlers;
  });
  const ref = useRef<VoiceRecorder | null>(null);
  const get = () => {
    if (!ref.current) {
      ref.current = new VoiceRecorder(speechInput(), opts, {
        onState: (s) => {
          setState(s);
          if (s.status !== 'recording') setLevels([]);
        },
        onDeliver: (t) => cb.current.onDeliver(t),
        onWarn: () => cb.current.onWarn?.(),
        onNotice: (n, code) => cb.current.onNotice?.(n, code),
        onVolume: (v) => {
          setHasVolume(true);
          setLevels((cur) => [...cur.slice(-(WAVE_BARS - 1)), v]);
        },
      });
    }
    return ref.current;
  };
  useEffect(
    () => () => {
      ref.current?.dispose();
      ref.current = null;
    },
    [],
  );
  return {
    state,
    levels,
    hasVolume,
    bars: WAVE_BARS,
    tap: () => get().tap(),
    cancel: () => get().cancel(),
    denied: () => get().denied(),
    processed: (ok: boolean) => get().processed(ok),
    reset: () => get().reset(),
  };
}
