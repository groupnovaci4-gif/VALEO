/**
 * Enregistreur « comme WhatsApp » : seul le toucher arrête. Le moteur simulé
 * reproduit Android : il s'arrête TOUT SEUL après ~3 s de silence (`no-speech`
 * quand rien n'a été dit, `end` sinon), et livre un morceau final par phrase.
 */
import { describe, expect, it } from 'vitest';
import {
  RECORDER_FLUSH_MS,
  RECORDER_MAX_MS,
  RECORDER_WARN_MS,
  appendSegment,
  formatElapsed,
  initialRecorder,
  liveTranscript,
  recorderReducer,
  stitchTranscript,
  type RecorderEffect,
  type RecorderEvent,
  type RecorderState,
} from '../src/core/entry/recorder';

/** Pilote : applique les événements, garde la trace des ordres donnés au moteur. */
function drive() {
  let s = initialRecorder(0);
  const effects: RecorderEffect[] = [];
  const send = (e: RecorderEvent) => {
    const out = recorderReducer(s, e);
    s = out.state;
    effects.push(...out.effects);
    return out;
  };
  const count = (type: RecorderEffect['type']) => effects.filter((x) => x.type === type).length;
  return { send, get s(): RecorderState { return s; }, effects, count };
}

/**
 * Moteur Android simulé, seconde par seconde : `script` = phrases et silences.
 * Le moteur s'arrête de lui-même après 3 s de silence ; l'enregistreur doit le relancer.
 */
function simulate(d: ReturnType<typeof drive>, script: ({ say: string } | { silence: number })[], from = 0) {
  let t = from;
  let silent = 0;
  let spokeSinceStart = false;
  for (const step of script) {
    if ('say' in step) {
      const w = step.say.split(' ');
      w.forEach((_, i) => {
        t += 300;
        d.send({ type: 'result', text: w.slice(0, i + 1).join(' '), isFinal: false, at: t });
        d.send({ type: 'tick', at: t });
      });
      d.send({ type: 'result', text: step.say, isFinal: true, at: t });
      silent = 0;
      spokeSinceStart = true;
      continue;
    }
    for (let i = 0; i < step.silence; i++) {
      t += 1000;
      silent++;
      d.send({ type: 'tick', at: t });
      if (d.s.status !== 'recording') return t;
      if (silent >= 3) {
        // Arrêt spontané du moteur (comme Android) : `no-speech` si rien n'a été dit depuis la relance.
        d.send(spokeSinceStart ? { type: 'engineEnd', at: t } : { type: 'engineError', code: 'no-speech', at: t });
        silent = 0;
        spokeSinceStart = false;
      }
    }
  }
  return t;
}

describe('enregistreur : seul le toucher arrête', () => {
  for (const pause of [5, 10, 30]) {
    it(`un silence de ${pause} secondes ne coupe pas l'enregistrement`, () => {
      const d = drive();
      d.send({ type: 'tap', at: 0 });
      expect(d.s.status).toBe('recording');
      let t = simulate(d, [{ say: 'Taxi 2000' }, { silence: pause }, { say: 'et garba 500' }]);
      expect(d.s.status).toBe('recording');
      expect(d.count('restartEngine')).toBeGreaterThan(0);
      expect(d.count('stopEngine') + d.count('abortEngine')).toBe(0);
      // Toucher « stop » : le moteur livre son dernier morceau, puis la carte s'ouvre.
      t += 500;
      d.send({ type: 'tap', at: t });
      expect(d.effects.filter((e) => e.type === 'haptic').map((e) => (e as { kind: string }).kind)).toEqual(['start', 'stop']);
      d.send({ type: 'engineEnd', at: t + 200 });
      expect(d.s.status).toBe('processing');
      expect(d.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Taxi 2000 et garba 500' });
      d.send({ type: 'processed', ok: true, at: t + 300 });
      expect(d.s.status).toBe('confirm');
    });
  }

  it("un silence complet de 4 minutes (rien dit) ne coupe pas non plus : seul le toucher arrête", () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    simulate(d, [{ silence: 240 }]);
    expect(d.s.status).toBe('recording');
    expect(d.count('restartEngine')).toBe(80);
  });

  it('le dernier morceau dit juste avant le toucher est gardé (attente du moteur)', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'result', text: 'Taxi', isFinal: false, at: 1500 });
    d.send({ type: 'tap', at: 2000 });
    expect(d.s.status).toBe('processing');
    expect(d.count('deliver')).toBe(0);
    d.send({ type: 'result', text: 'Taxi 2000', isFinal: true, at: 2300 });
    d.send({ type: 'engineEnd', at: 2400 });
    expect(d.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Taxi 2000' });
  });

  it('moteur muet après le toucher : livraison au bout de 1,5 s quand même', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'result', text: 'Pain 500', isFinal: false, at: 1500 });
    d.send({ type: 'tap', at: 3000 });
    d.send({ type: 'tick', at: 3000 + RECORDER_FLUSH_MS - 1 });
    expect(d.count('deliver')).toBe(0);
    d.send({ type: 'tick', at: 3000 + RECORDER_FLUSH_MS });
    expect(d.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Pain 500' });
  });
});

describe('enregistreur : annulation, double toucher, < 1 s', () => {
  it('corbeille : annulé, rien n’est livré', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'result', text: 'Taxi 2000', isFinal: true, at: 2000 });
    d.send({ type: 'cancel', at: 3000 });
    expect(d.s.status).toBe('cancelled');
    expect(d.count('deliver')).toBe(0);
    expect(d.count('abortEngine')).toBe(1);
  });

  it('toucher de moins d’une seconde : annulation silencieuse (aucun message)', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'tap', at: 700 });
    expect(d.s.status).toBe('cancelled');
    expect(d.s.notice).toBeNull();
    expect(d.count('deliver')).toBe(0);
  });

  it('double toucher sur le micro : un seul enregistrement, qui continue', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'tap', at: 150 });
    expect(d.s.status).toBe('recording');
    expect(d.count('startEngine')).toBe(1);
  });

  it('on peut réenregistrer après une annulation ou un refus', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'cancel', at: 2000 });
    d.send({ type: 'tap', at: 3000 });
    expect(d.s.status).toBe('recording');
    expect(d.count('startEngine')).toBe(2);
  });
});

describe('enregistreur : limites, arrière-plan, micro refusé, panne', () => {
  it('limite de sécurité : message à 4:30, arrêt à 5:00 en gardant le texte', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'result', text: 'Loyer 50000', isFinal: true, at: 5000 });
    d.send({ type: 'tick', at: RECORDER_WARN_MS - 1000 });
    expect(d.count('warnLimit')).toBe(0);
    d.send({ type: 'tick', at: RECORDER_WARN_MS });
    d.send({ type: 'tick', at: RECORDER_WARN_MS + 1000 });
    expect(d.count('warnLimit')).toBe(1);
    d.send({ type: 'tick', at: RECORDER_MAX_MS });
    expect(d.count('stopEngine')).toBe(1);
    d.send({ type: 'engineEnd', at: RECORDER_MAX_MS + 100 });
    expect(d.s.end).toBe('limit');
    expect(d.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Loyer 50000' });
  });

  it("mise en arrière-plan (ou appel) pendant l'enregistrement : arrêt propre, ce qui a été dit est gardé", () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'result', text: 'Taxi 2000', isFinal: true, at: 2000 });
    d.send({ type: 'result', text: 'et pain', isFinal: false, at: 2600 });
    d.send({ type: 'background', at: 3000 });
    expect(d.s.end).toBe('background');
    expect(d.count('abortEngine')).toBe(1);
    expect(d.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Taxi 2000 et pain' });
    // Interruption par le système (appel) : même chose.
    const c = drive();
    c.send({ type: 'tap', at: 0 });
    c.send({ type: 'result', text: 'Garba 500', isFinal: true, at: 2000 });
    c.send({ type: 'engineError', code: 'audio-capture', at: 3000 });
    expect(c.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Garba 500' });
  });

  it('arrière-plan sans rien dit : retour au repos, « rien compris », pas de carte', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'background', at: 3000 });
    expect(d.s.status).toBe('idle');
    expect(d.count('deliver')).toBe(0);
  });

  it('micro refusé : état « denied » (la saisie écrite prend le relais)', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'engineError', code: 'not-allowed', at: 200 });
    expect(d.s.status).toBe('denied');
    expect(d.s.notice).toBe('denied');
  });

  it('moteur incapable de démarrer (arrêts immédiats répétés) : on abandonne proprement, sans boucle infinie', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    let t = 0;
    for (let i = 0; i < 20 && d.s.status === 'recording'; i++) d.send({ type: 'engineEnd', at: (t += 100) });
    expect(d.s.status).toBe('idle');
    expect(d.s.notice).toBe('unavailable');
    expect(d.count('restartEngine')).toBeLessThan(10);
  });

  it('réseau perdu en cours de route : on garde ce qui a été dit', () => {
    const d = drive();
    d.send({ type: 'tap', at: 0 });
    d.send({ type: 'result', text: 'Pharmacie 3500', isFinal: true, at: 3000 });
    d.send({ type: 'engineError', code: 'network', at: 4000 });
    expect(d.effects.find((e) => e.type === 'deliver')).toEqual({ type: 'deliver', text: 'Pharmacie 3500' });
  });
});

describe('raccord des morceaux sans doublon ni perte', () => {
  it('morceaux successifs (Android)', () => {
    expect(stitchTranscript(appendSegment(appendSegment([], 'Taxi 2000'), 'et garba 500'))).toBe('Taxi 2000 et garba 500');
  });
  it('morceau cumulatif (iOS) : remplacé, pas répété', () => {
    expect(appendSegment(['Taxi'], 'Taxi 2000')).toEqual(['Taxi 2000']);
  });
  it('morceau répété après une relance : ignoré', () => {
    expect(appendSegment(['Taxi 2000 et garba'], 'et garba')).toEqual(['Taxi 2000 et garba']);
  });
  it('chevauchement : la partie commune une seule fois (accents et majuscules ignorés)', () => {
    expect(stitchTranscript(appendSegment(['loyer 50000 électricité'], 'Electricite 12000'))).toBe('loyer 50000 électricité 12000');
  });
  it('morceau vide : rien ne change', () => {
    expect(appendSegment(['Taxi'], '   ')).toEqual(['Taxi']);
  });
  it('texte en direct = morceaux + morceau en cours', () => {
    const s = { ...initialRecorder(0), segments: ['Taxi 2000'], partial: 'et pain' };
    expect(liveTranscript(s)).toBe('Taxi 2000 et pain');
  });
  it('chronomètre', () => {
    expect([formatElapsed(0), formatElapsed(7_400), formatElapsed(RECORDER_WARN_MS)]).toEqual(['0:00', '0:07', '4:30']);
  });
});
