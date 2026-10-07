/**
 * Saisie vocale (dictée) — PRÉPARÉE, NON ACTIVÉE.
 *
 * L'assistant affiche un bouton micro désactivé : aucune dépendance de
 * reconnaissance vocale n'est installée, la permission micro est bloquée
 * (`blockedPermissions` dans app.config.ts) et le fournisseur par défaut
 * déclare l'indisponibilité. Activer la dictée = brancher un fournisseur
 * (voir docs/coach.md, « Saisie vocale ») sans toucher aux écrans.
 *
 * Règle conservée à l'activation : la transcription n'est qu'un TEXTE placé
 * dans la zone de message ; elle passe par le même analyseur que la saisie au
 * clavier et aucune opération n'est enregistrée sans confirmation explicite.
 */
export type SpeechLanguage = 'fr' | 'en';

export interface SpeechInputProvider {
  readonly id: string;
  /** Matériel, permission et service de reconnaissance disponibles. */
  isAvailable(): Promise<boolean>;
  /**
   * Écoute jusqu'à la fin de la phrase (ou `stop()`) et résout avec la
   * transcription finale ; `onPartial` reçoit les résultats intermédiaires.
   * Rejette si la permission est refusée ou la reconnaissance indisponible.
   */
  listen(opts: { language: SpeechLanguage; onPartial?: (text: string) => void }): Promise<string>;
  stop(): Promise<void>;
}

export class SpeechInputUnavailable extends Error {
  constructor() {
    super('speech-input/unavailable');
  }
}

/** Fournisseur par défaut : aucune reconnaissance (fonction non activée). */
export const noSpeechInput: SpeechInputProvider = {
  id: 'none',
  async isAvailable() {
    return false;
  },
  async listen() {
    throw new SpeechInputUnavailable();
  },
  async stop() {
    /* rien à arrêter */
  },
};

let provider: SpeechInputProvider = noSpeechInput;

export function speechInput(): SpeechInputProvider {
  return provider;
}

/** Point d'activation unique (au démarrage de l'application). */
export function setSpeechInputProvider(p: SpeechInputProvider | null): void {
  provider = p ?? noSpeechInput;
}
