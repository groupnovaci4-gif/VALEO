/**
 * I1 — Où part le son de la dictée, pour un écran : état du téléphone (lu une fois),
 * décision pure (`core/entry/voicePrivacy`) et enregistrement de la réponse dans le profil.
 */
import { useEffect, useState } from 'react';
import { entryPrefs } from '@/core/entry/prefs';
import { consentPatch, voiceRoute, type OnDeviceStatus, type VoiceConsent, type VoiceRoute } from '@/core/entry/voicePrivacy';
import type { EntryPrefs } from '@/core/types';
import { speechInput, type SpeechLanguage } from '@/services/speechInput';
import { useApp } from '@/store/app';

export function useVoiceRoute(language: SpeechLanguage) {
  const { profile, updateProfile } = useApp();
  const prefs = entryPrefs(profile?.preferences);
  const [onDevice, setOnDevice] = useState<OnDeviceStatus | null>(null);
  useEffect(() => {
    let alive = true;
    speechInput()
      .onDeviceStatus(language)
      .then((s) => alive && setOnDevice(s))
      .catch(() => alive && setOnDevice('unsupported'));
    return () => {
      alive = false;
    };
  }, [language]);

  /** Préférences après une réponse, sans attendre la synchronisation du profil. */
  const save = (patch: Partial<EntryPrefs>): EntryPrefs => {
    const next = { ...prefs, ...patch };
    if (profile) void updateProfile({ preferences: { ...profile.preferences, entry: next } });
    return next;
  };

  return {
    /** null tant que l'état du téléphone n'est pas connu. */
    route: onDevice ? voiceRoute({ onDevice, prefs }) : null,
    /** Décision relue à la source (au moment d'ouvrir le micro). */
    resolve: async (): Promise<VoiceRoute> => {
      const s = await speechInput()
        .onDeviceStatus(language)
        .catch(() => 'unsupported' as const);
      setOnDevice(s);
      return voiceRoute({ onDevice: s, prefs });
    },
    /** Réponse à la demande (« Oui, dicter » / « Utiliser le service du téléphone », ou « Non, je tape »). */
    answer: (consent: VoiceConsent): VoiceRoute => {
      const next = save(consentPatch(consent));
      return voiceRoute({ onDevice: onDevice ?? 'unsupported', prefs: next });
    },
  };
}
