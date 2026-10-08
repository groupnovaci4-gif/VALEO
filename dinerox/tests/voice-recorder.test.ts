/**
 * Contrôleur de l'enregistreur sur un faux moteur qui se comporte comme
 * Android : il s'arrête TOUT SEUL ~3 s après la dernière parole (ou envoie
 * `no-speech`), une erreur est suivie d'une fin, et un redémarrage trop rapide
 * renvoie `busy`. Horloge simulée : le temps réel n'intervient pas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({ listener: null as null | ((s: string) => void) }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 30 },
  AppState: {
    addEventListener: (_: string, l: (s: string) => void) => {
      app.listener = l;
      return { remove: () => (app.listener = null) };
    },
  },
}));
vi.mock('expo-haptics', () => ({ impactAsync: vi.fn(async () => undefined), ImpactFeedbackStyle: { Medium: 'm', Light: 'l' } }));

import * as Haptics from 'expo-haptics';
import { VoiceRecorder, recordUntilStopped, stopActiveRecording } from '../src/services/voiceRecorder';
import type { EngineHandlers, SpeechInputProvider } from '../src/services/speechInput';
import { isMicOpen } from '../src/services/voice/micGate';

/** Faux moteur Android. `say(text)` : l'utilisateur parle (résultats partiels puis final). */
function androidEngine() {
  let h: EngineHandlers | null = null;
  let silence: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -1e9;
  const log = { starts: 0, stops: 0, aborts: 0 };
  let spoke = false;
  const armSilence = () => {
    if (silence) clearTimeout(silence);
    // Comme Android : arrêt spontané 3 s après la dernière parole.
    silence = setTimeout(() => {
      const cur = h;
      h = null;
      if (!cur) return;
      if (spoke) cur.onEnd();
      else cur.onError('no-speech');
    }, 3000);
  };
  const provider: SpeechInputProvider = {
    id: 'android-fake',
    isAvailable: async () => true,
    supportsOnDevice: () => true,
    permission: async () => 'granted',
    requestPermission: async () => 'granted',
    startEngine(_o, handlers) {
      log.starts++;
      // Redémarrage collé à l'arrêt précédent : le service est encore occupé.
      if (Date.now() - lastStart < 50) return handlers.onError('busy');
      lastStart = Date.now();
      h = handlers;
      spoke = false;
      armSilence();
    },
    stopEngine() {
      log.stops++;
      if (silence) clearTimeout(silence);
      const cur = h;
      h = null;
      setTimeout(() => cur?.onEnd(), 100);
    },
    abortEngine() {
      log.aborts++;
      if (silence) clearTimeout(silence);
      h = null;
    },
    listen: async () => '',
    stop: async () => undefined,
  };
  const say = (text: string) => {
    const w = text.split(' ');
    w.forEach((_, i) => h?.onResult(w.slice(0, i + 1).join(' '), false));
    h?.onResult(text, true);
    spoke = true;
    armSilence();
  };
  return { provider, say, log };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const engine = androidEngine();
  const delivered: string[] = [];
  const warns: number[] = [];
  const rec = new VoiceRecorder(engine.provider, { language: 'fr' }, { onDeliver: (t) => delivered.push(t), onWarn: () => warns.push(Date.now()) });
  return { engine, rec, delivered, warns };
}

describe('enregistreur (contrôleur) : comportement réel simulé', () => {
  for (const pause of [5, 10, 30]) {
    it(`pause de ${pause} s au milieu : l'enregistrement continue, puis un seul texte complet`, async () => {
      const { engine, rec, delivered } = setup();
      rec.tap();
      expect(rec.state.status).toBe('recording');
      expect(isMicOpen()).toBe(true);
      await vi.advanceTimersByTimeAsync(800);
      engine.say('Taxi 2000');
      await vi.advanceTimersByTimeAsync(pause * 1000);
      expect(rec.state.status).toBe('recording');
      engine.say('et garba 500');
      await vi.advanceTimersByTimeAsync(1500);
      expect(engine.log.starts).toBeGreaterThan(1);
      rec.tap();
      await vi.advanceTimersByTimeAsync(300);
      expect(delivered).toEqual(['Taxi 2000 et garba 500']);
      expect(engine.log.stops).toBe(1);
      expect(isMicOpen()).toBe(false);
      expect(vi.mocked(Haptics.impactAsync)).toHaveBeenCalled();
    });
  }

  it('le chronomètre monte ; message à 4:30 ; arrêt de sécurité à 5:00 avec le texte gardé', async () => {
    const { engine, rec, delivered, warns } = setup();
    rec.tap();
    await vi.advanceTimersByTimeAsync(2000);
    engine.say('Loyer 50000');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rec.state.elapsed).toBeGreaterThanOrEqual(11_500);
    await vi.advanceTimersByTimeAsync(4.5 * 60_000 - 12_000);
    expect(warns.length).toBe(1);
    expect(delivered).toEqual([]);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(delivered).toEqual(['Loyer 50000']);
    expect(rec.state.end).toBe('limit');
  });

  it('mise en arrière-plan : arrêt propre, ce qui a été dit est gardé', async () => {
    const { engine, rec, delivered } = setup();
    rec.tap();
    await vi.advanceTimersByTimeAsync(1000);
    engine.say('Pharmacie 3500');
    app.listener?.('background');
    expect(delivered).toEqual(['Pharmacie 3500']);
    expect(engine.log.aborts).toBe(1);
  });

  it('corbeille : rien n’est livré ; fermeture de l’écran : le moteur est coupé', async () => {
    const { engine, rec, delivered } = setup();
    rec.tap();
    await vi.advanceTimersByTimeAsync(2000);
    engine.say('Taxi 2000');
    rec.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(delivered).toEqual([]);
    expect(rec.state.status).toBe('cancelled');
    rec.tap();
    await vi.advanceTimersByTimeAsync(1500);
    rec.dispose();
    expect(engine.log.aborts).toBe(2);
  });

  it('dictée de l’assistant : même règle (une pause ne coupe pas, « stop » termine)', async () => {
    const engine = androidEngine();
    const p = recordUntilStopped(engine.provider, { language: 'fr' });
    await vi.advanceTimersByTimeAsync(1000);
    engine.say('combien il me reste');
    await vi.advanceTimersByTimeAsync(12_000);
    engine.say('pour la nourriture');
    await vi.advanceTimersByTimeAsync(500);
    expect(stopActiveRecording()).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toBe('combien il me reste pour la nourriture');
  });
});
