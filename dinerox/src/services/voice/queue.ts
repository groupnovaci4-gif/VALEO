/**
 * File d'attente vocale — aucune dépendance React Native (testée).
 *
 *  - jamais deux voix à la fois : les messages sont lus l'un après l'autre ;
 *  - repli en cascade : premium → voix de l'appareil → texte seul (la file se
 *    contente alors d'abandonner : le texte est déjà affiché à l'écran) ;
 *  - délai maximal par fournisseur (5 s par défaut) avant de passer au suivant ;
 *  - `stop()` coupe la lecture en cours et vide la file (passage en arrière-plan).
 */
export interface SpeakOptions {
  language: 'fr' | 'en';
}

export interface VoiceProvider {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  /** Résout quand la lecture est terminée ; rejette en cas d'échec. */
  speak(text: string, opts: SpeakOptions): Promise<void>;
  stop(): Promise<void>;
}

export type VoiceOutcome = { spoken: true; by: string } | { spoken: false; reason: 'empty' | 'unavailable' | 'stopped' };

export class TimeoutError extends Error {
  constructor() {
    super('voice/timeout');
  }
}

/** Délai maximal pour COMMENCER la lecture (préparation réseau, synthèse). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

export interface PreparedProvider extends VoiceProvider {
  /** Préparation (ex. téléchargement de l'audio premium) soumise au délai ; la lecture ne l'est pas. */
  prepare?(text: string, opts: SpeakOptions): Promise<void>;
}

export class VoiceQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private current: VoiceProvider | null = null;

  constructor(
    private readonly providers: () => PreparedProvider[],
    private readonly timeoutMs = 5000,
  ) {}

  /** Ajoute un message à la file ; résout avec le résultat de SA lecture. */
  enqueue(text: string, opts: SpeakOptions): Promise<VoiceOutcome> {
    const gen = this.generation;
    const run = async (): Promise<VoiceOutcome> => {
      if (gen !== this.generation) return { spoken: false, reason: 'stopped' };
      const clean = text.trim();
      if (!clean) return { spoken: false, reason: 'empty' };
      for (const p of this.providers()) {
        if (gen !== this.generation) return { spoken: false, reason: 'stopped' };
        try {
          if (!(await withTimeout(p.isAvailable(), this.timeoutMs))) continue;
          if (p.prepare) await withTimeout(p.prepare(clean, opts), this.timeoutMs);
          if (gen !== this.generation) return { spoken: false, reason: 'stopped' };
          this.current = p;
          await p.speak(clean, opts);
          this.current = null;
          return gen !== this.generation ? { spoken: false, reason: 'stopped' } : { spoken: true, by: p.id };
        } catch {
          this.current = null;
          // Erreur réseau, délai dépassé, quota : fournisseur suivant.
        }
      }
      return { spoken: false, reason: 'unavailable' };
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Coupe la lecture en cours et abandonne les messages en attente. */
  async stop(): Promise<void> {
    this.generation++;
    const p = this.current;
    this.current = null;
    if (p) await p.stop().catch(() => undefined);
  }
}

/** Empreinte stable (FNV-1a 32 bits, hex) : clé de cache audio = texte + voix + langue. */
export function cacheKey(text: string, voice: string, language: string): string {
  let h = 0x811c9dc5;
  const s = `${language}|${voice}|${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, '0')}_${s.length}`;
}
