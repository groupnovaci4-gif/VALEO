/** Préférences du coach : valeurs par défaut et migration douce des profils existants. */
import type { CoachPrefs } from '../types';

export const DEFAULT_COACH_PREFS: CoachPrefs = {
  enabled: true,
  voice: 'important',
  speakAmounts: false,
  soundVolume: 0.6,
  frequency: 'normal',
  criticalOnly: false,
  silent: false,
  premiumVoice: false,
};

/** Préférences complètes, même pour un profil antérieur à la 1.5 ou partiellement renseigné. */
export function coachPrefs(p: { coach?: Partial<CoachPrefs> } | null | undefined): CoachPrefs {
  const c = { ...DEFAULT_COACH_PREFS, ...(p?.coach ?? {}) };
  return { ...c, soundVolume: Math.min(1, Math.max(0, Number(c.soundVolume) || 0)) };
}
