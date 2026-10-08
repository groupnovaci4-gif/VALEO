/**
 * Enregistreur vocal « comme WhatsApp » — machine d'états PURE (aucune
 * minuterie, aucun module natif : le temps arrive dans les événements).
 *
 *   idle ──toucher──▶ recording ──toucher──▶ processing ──▶ confirm
 *                       │  ▲                     │
 *                       │  └─ le moteur s'arrête tout seul (silence,
 *                       │     fin de phrase, limite du système) :
 *                       │     RELANCE immédiate, le texte est gardé
 *                       ├──corbeille / < 1 s──▶ cancelled
 *                       └──micro refusé──▶ denied
 *
 * RÈGLE : seul le toucher de l'utilisateur arrête l'enregistrement. Un
 * silence, même de 30 secondes, ne l'arrête JAMAIS. Les seules autres fins :
 * la corbeille, la mise en arrière-plan / un appel (on garde ce qui a déjà
 * été dit) et une limite de sécurité invisible de 5 minutes (message à 4:30).
 *
 * Le moteur du téléphone découpe la parole en morceaux (`stitchTranscript`
 * les raccorde sans doublon ni perte) : pour l'utilisateur, c'est un seul
 * enregistrement continu.
 */

export type RecorderStatus = 'idle' | 'recording' | 'processing' | 'confirm' | 'cancelled' | 'denied';

/** Pourquoi l'enregistrement s'est terminé. */
export type RecorderEnd = 'stop' | 'limit' | 'background' | 'interrupted';

/** Message affiché sous l'enregistreur (jamais bloquant : la saisie écrite reste disponible). */
export type RecorderNotice = 'nothing' | 'unavailable' | 'denied' | null;

export interface RecorderState {
  status: RecorderStatus;
  /** Début de l'enregistrement (ms). */
  startedAt: number | null;
  /** Dernier changement d'état (ms) : anti double toucher. */
  changedAt: number;
  /** Morceaux FINALS déjà reconnus (dans l'ordre). */
  segments: string[];
  /** Morceau en cours (résultat intermédiaire, pas encore final). */
  partial: string;
  /** Message « il reste 30 secondes » déjà affiché. */
  warned: boolean;
  /** Durée écoulée (ms), mise à jour à chaque `tick`. */
  elapsed: number;
  /** Dernier (re)démarrage du moteur (ms). */
  engineAt: number;
  /** Arrêts IMMÉDIATS consécutifs du moteur (< 1 s après sa relance) : moteur absent ou bloqué.
   *  Un silence, lui, n'est jamais compté : le moteur a tenu plusieurs secondes avant de s'arrêter. */
  fastFails: number;
  /** Arrêt demandé : on attend le dernier morceau du moteur (au plus `RECORDER_FLUSH_MS`). */
  flushing: boolean;
  /** Texte final livré à l'analyse (processing / confirm). */
  transcript: string;
  end: RecorderEnd | null;
  notice: RecorderNotice;
  /** Code de la dernière erreur du service (mesure d'usage : jamais de contenu). */
  errorCode: string | null;
}

export type RecorderEvent =
  /** Toucher le micro (démarrer) ou le bouton de l'enregistrement en cours (arrêter). */
  | { type: 'tap'; at: number }
  /** Corbeille. */
  | { type: 'cancel'; at: number }
  /** Le micro est refusé (avant ou pendant l'enregistrement). */
  | { type: 'denied'; at: number }
  /** Résultat du moteur : `isFinal` = morceau terminé. */
  | { type: 'result'; text: string; isFinal: boolean; at: number }
  /** Le moteur s'est arrêté DE LUI-MÊME (silence, fin de phrase…). */
  | { type: 'engineEnd'; at: number }
  /** Erreur du moteur (code du service : `no-speech`, `network`, `not-allowed`…). */
  | { type: 'engineError'; code: string; at: number }
  /** Battement d'horloge (chronomètre, limite de sécurité). */
  | { type: 'tick'; at: number }
  /** Application mise en arrière-plan (ou téléphone qui sonne). */
  | { type: 'background'; at: number }
  /** Analyse du texte terminée : la carte de confirmation s'ouvre (ou rien n'a été compris). */
  | { type: 'processed'; ok: boolean; at: number }
  /** Retour au repos (nouvelle saisie). */
  | { type: 'reset'; at: number };

/** Ordres donnés au moteur et à l'interface (exécutés par la couche service). */
export type RecorderEffect =
  | { type: 'startEngine' }
  /** Relance immédiate et sans bruit visible après un arrêt spontané du moteur. */
  | { type: 'restartEngine' }
  /** Arrêt demandé par l'utilisateur : le moteur livre son dernier morceau. */
  | { type: 'stopEngine' }
  /** Arrêt sans attendre (annulation, arrière-plan) : rien n'est gardé du moteur. */
  | { type: 'abortEngine' }
  | { type: 'haptic'; kind: 'start' | 'stop' }
  | { type: 'warnLimit' }
  /** Texte à analyser (carte de confirmation). */
  | { type: 'deliver'; text: string };

/** Limite de sécurité invisible : 5 minutes. */
export const RECORDER_MAX_MS = 5 * 60_000;
/** Message « il reste 30 secondes » à 4 min 30. */
export const RECORDER_WARN_MS = 4 * 60_000 + 30_000;
/** Un enregistrement de moins d'une seconde est annulé sans bruit (toucher involontaire). */
export const RECORDER_MIN_MS = 1_000;
/** Deux touchers plus rapprochés que ceci ne font qu'un (double toucher). */
export const RECORDER_DEBOUNCE_MS = 400;
/** Arrêts immédiats consécutifs du moteur avant d'abandonner (moteur absent ou bloqué). */
export const RECORDER_MAX_FAST_FAILS = 8;
/** En dessous de cette durée, un arrêt du moteur est un échec, pas un silence. */
export const RECORDER_FAST_FAIL_MS = 1_000;
/** Attente maximale du dernier morceau après le toucher d'arrêt. */
export const RECORDER_FLUSH_MS = 1_500;

/** Erreurs du moteur qui ne sont qu'un arrêt spontané : on relance. */
const RESTARTABLE = new Set(['no-speech', 'speech-timeout', 'aborted', 'no-match', 'busy', 'client', 'recognizer-busy']);
/** Interruptions extérieures (appel, autre application qui prend le micro) : on garde ce qui a été dit. */
const INTERRUPTIONS = new Set(['audio-capture', 'interrupted']);

export function initialRecorder(at = 0): RecorderState {
  return { status: 'idle', startedAt: null, changedAt: at, segments: [], partial: '', warned: false, elapsed: 0, engineAt: at, fastFails: 0, flushing: false, transcript: '', end: null, notice: null, errorCode: null };
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Ajoute un morceau reconnu aux précédents SANS doublon ni perte :
 *  - morceau cumulatif (iOS : « taxi » puis « taxi 2000 ») → remplace le dernier ;
 *  - morceau répété (le moteur renvoie deux fois la même fin) → ignoré ;
 *  - chevauchement (« … taxi 2000 » puis « 2000 et garba ») → la partie commune n'est gardée qu'une fois ;
 *  - sinon → ajouté à la suite.
 */
export function appendSegment(segments: string[], text: string): string[] {
  const next = words(text);
  if (!next.length) return segments;
  if (!segments.length) return [next.join(' ')];
  const last = words(segments[segments.length - 1]);
  const nl = last.map(norm);
  const nn = next.map(norm);
  const startsWith = (a: string[], b: string[]) => b.length <= a.length && b.every((w, i) => a[i] === w);
  // Cumulatif : le nouveau morceau reprend tout le précédent et le prolonge.
  if (startsWith(nn, nl)) return [...segments.slice(0, -1), next.join(' ')];
  // Répétition : le nouveau morceau est déjà contenu à la fin du précédent.
  if (nn.length <= nl.length && nl.slice(nl.length - nn.length).every((w, i) => w === nn[i])) return segments;
  // Chevauchement : plus longue fin du précédent = début du nouveau.
  for (let k = Math.min(nl.length, nn.length); k > 0; k--) {
    if (nl.slice(nl.length - k).every((w, i) => w === nn[i])) return [...segments, next.slice(k).join(' ')];
  }
  return [...segments, next.join(' ')];
}

/** Texte complet : morceaux finals raccordés, plus le morceau en cours. */
export function stitchTranscript(segments: string[], partial = ''): string {
  return (partial ? appendSegment(segments, partial) : segments).join(' ').replace(/\s+/g, ' ').trim();
}

/** Texte à afficher pendant l'enregistrement. */
export function liveTranscript(s: RecorderState): string {
  return stitchTranscript(s.segments, s.partial);
}

type Out = { state: RecorderState; effects: RecorderEffect[] };
const same = (state: RecorderState): Out => ({ state, effects: [] });

/** Livre le texte reconnu (ou « rien compris ») : fin de l'enregistrement. */
function deliver(s: RecorderState, at: number, extra: RecorderEffect[] = []): Out {
  const text = liveTranscript(s);
  if (!text) return { state: { ...initialRecorder(at), notice: 'nothing', end: s.end }, effects: extra };
  return { state: { ...s, status: 'processing', flushing: false, changedAt: at, transcript: text, partial: '', segments: [text] }, effects: [...extra, { type: 'deliver', text }] };
}

/**
 * Fin de l'enregistrement en gardant ce qui a été dit.
 *  - toucher / limite : le moteur est arrêté proprement et livre son dernier morceau
 *    (attente `RECORDER_FLUSH_MS` au plus) ;
 *  - arrière-plan / appel : arrêt immédiat, livraison de ce qui a déjà été reconnu.
 */
function finish(s: RecorderState, at: number, end: RecorderEnd): Out {
  const haptic: RecorderEffect = { type: 'haptic', kind: 'stop' };
  if (end === 'stop' || end === 'limit') {
    return { state: { ...s, status: 'processing', flushing: true, end, changedAt: at }, effects: [{ type: 'stopEngine' }, haptic] };
  }
  return deliver({ ...s, end }, at, [{ type: 'abortEngine' }, haptic]);
}

export function recorderReducer(s: RecorderState, e: RecorderEvent): Out {
  switch (e.type) {
    case 'tap': {
      if (e.at - s.changedAt < RECORDER_DEBOUNCE_MS && s.status === 'recording') return same(s);
      if (s.status === 'idle' || s.status === 'cancelled' || s.status === 'denied') {
        return { state: { ...initialRecorder(e.at), status: 'recording', startedAt: e.at }, effects: [{ type: 'startEngine' }, { type: 'haptic', kind: 'start' }] };
      }
      if (s.status !== 'recording') return same(s);
      // Toucher involontaire (< 1 s) : annulation silencieuse.
      if (e.at - (s.startedAt ?? e.at) < RECORDER_MIN_MS) return { state: { ...initialRecorder(e.at), status: 'cancelled' }, effects: [{ type: 'abortEngine' }] };
      return finish(s, e.at, 'stop');
    }
    case 'cancel':
      if (s.status !== 'recording' && !s.flushing) return same(s);
      return { state: { ...initialRecorder(e.at), status: 'cancelled' }, effects: [{ type: 'abortEngine' }, { type: 'haptic', kind: 'stop' }] };
    case 'denied':
      return { state: { ...initialRecorder(e.at), status: 'denied', notice: 'denied' }, effects: s.status === 'recording' ? [{ type: 'abortEngine' }] : [] };
    case 'result': {
      if (s.status === 'recording' || s.flushing) {
        if (e.isFinal) return same({ ...s, segments: appendSegment(s.segments, e.text), partial: '', fastFails: 0 });
        return same({ ...s, partial: e.text, fastFails: e.text.trim() ? 0 : s.fastFails });
      }
      return same(s);
    }
    case 'engineEnd': {
      // Arrêt demandé : le dernier morceau est arrivé, on livre.
      if (s.flushing) return deliver(s, e.at);
      if (s.status !== 'recording') return same(s);
      // Le moteur s'est arrêté TOUT SEUL (silence, fin de phrase, limite du système) :
      // on garde le morceau en cours et on RELANCE. Un silence n'arrête jamais l'enregistrement.
      const segments = s.partial ? appendSegment(s.segments, s.partial) : s.segments;
      const fastFails = e.at - s.engineAt < RECORDER_FAST_FAIL_MS ? s.fastFails + 1 : 0;
      if (fastFails >= RECORDER_MAX_FAST_FAILS) {
        // Moteur incapable de tenir (service absent ou bloqué) : on livre ce qui a été dit.
        const out = deliver({ ...s, segments, partial: '', end: 'interrupted' }, e.at, [{ type: 'abortEngine' }, { type: 'haptic', kind: 'stop' }]);
        return out.state.status === 'idle' ? { ...out, state: { ...out.state, notice: 'unavailable' } } : out;
      }
      return { state: { ...s, segments, partial: '', fastFails, engineAt: e.at }, effects: [{ type: 'restartEngine' }] };
    }
    case 'engineError': {
      if (s.flushing) return deliver(s, e.at);
      if (s.status !== 'recording') return same(s);
      if (e.code === 'not-allowed' || e.code === 'service-not-allowed') return recorderReducer(s, { type: 'denied', at: e.at });
      if (RESTARTABLE.has(e.code)) return recorderReducer(s, { type: 'engineEnd', at: e.at });
      // Appel entrant, micro pris par une autre application, réseau perdu… : arrêt propre,
      // ce qui a déjà été dit est conservé.
      const out = finish(s, e.at, 'interrupted');
      if (out.state.status === 'idle' && !INTERRUPTIONS.has(e.code)) out.state.notice = 'unavailable';
      out.state.errorCode = e.code;
      return out;
    }
    case 'tick': {
      if (s.flushing) return e.at - s.changedAt >= RECORDER_FLUSH_MS ? deliver(s, e.at) : same(s);
      if (s.status !== 'recording') return same(s);
      const elapsed = Math.max(0, e.at - (s.startedAt ?? e.at));
      if (elapsed >= RECORDER_MAX_MS) return finish({ ...s, elapsed }, e.at, 'limit');
      if (!s.warned && elapsed >= RECORDER_WARN_MS) return { state: { ...s, elapsed, warned: true }, effects: [{ type: 'warnLimit' }] };
      return same({ ...s, elapsed });
    }
    case 'background':
      if (s.flushing) return deliver(s, e.at, [{ type: 'abortEngine' }]);
      if (s.status !== 'recording') return same(s);
      return finish(s, e.at, 'background');
    case 'processed':
      if (s.status !== 'processing' || s.flushing) return same(s);
      return same(e.ok ? { ...s, status: 'confirm', changedAt: e.at } : { ...initialRecorder(e.at), notice: 'nothing' });
    case 'reset':
      return same(initialRecorder(e.at));
  }
}

/** Chronomètre « 0:07 », « 4:30 ». */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
