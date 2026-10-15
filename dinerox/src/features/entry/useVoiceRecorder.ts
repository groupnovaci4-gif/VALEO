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
  // Options vivantes : l'enregistreur est créé une fois, mais la langue et l'endroit de la
  // reconnaissance (I1 : sur l'appareil ou service du téléphone) se décident au démarrage.
  const live = useRef<Omit<ListenOptions, 'onPartial'>>({ ...opts });
  useEffect(() => {
    Object.assign(live.current, opts);
  });
  const ref = useRef<VoiceRecorder | null>(null);
  const get = () => {
    if (!ref.current) {
      ref.current = new VoiceRecorder(speechInput(), live.current, {
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
    /** `start` : options du démarrage (I1 : `onDeviceOnly` selon la décision prise juste avant). */
    tap: (start?: Pick<ListenOptions, 'onDeviceOnly'>) => {
      if (start) Object.assign(live.current, start);
      get().tap();
    },
    cancel: () => get().cancel(),
    denied: () => get().denied(),
    processed: (ok: boolean) => get().processed(ok),
    reset: () => get().reset(),
  };
}
