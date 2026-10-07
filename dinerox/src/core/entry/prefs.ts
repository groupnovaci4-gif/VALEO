/** Préférences de saisie — migration douce (profils antérieurs à la 1.5). PUR. */
import type { EntryPrefs } from '../types';

export const DEFAULT_ENTRY_PREFS: EntryPrefs = { defaultMethod: 'voice', voiceLanguage: null, onDeviceOnly: false, showExamples: true };

export function entryPrefs(p: { entry?: Partial<EntryPrefs> } | null | undefined): EntryPrefs {
  return { ...DEFAULT_ENTRY_PREFS, ...(p?.entry ?? {}) };
}
