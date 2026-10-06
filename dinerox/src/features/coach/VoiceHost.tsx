/**
 * Hôte vocal : présente le son, la vibration et la voix décidés par la
 * politique du coach. Coupe toute voix dès que l'application quitte le
 * premier plan. Aucun texte nouveau : il lit ce qui est affiché (sans montant
 * par défaut).
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from '@/store/app';
import { hasKey, useI18n } from '@/i18n';
import { useFormatParams } from '@/hooks/useInsightText';
import { coachPrefs } from '@/core/coach/prefs';
import { voiceMessage } from '@/core/coach/voice';
import { hasFeature } from '@/core/subscription';
import { playCoachSound } from '@/services/voice/sounds';
import { setPremiumVoiceEnabled, speak, stopVoice } from '@/services/voice';
import { setCoachPresenter } from './bus';

export function VoiceHost() {
  const { profile, plan, mode } = useApp();
  const { t, lang } = useI18n();
  const fmt = useFormatParams();
  const prefs = coachPrefs(profile?.preferences);
  const premium = prefs.premiumVoice && mode === 'firebase' && hasFeature(plan, 'voice_premium');
  useEffect(() => setPremiumVoiceEnabled(premium), [premium]);

  const latest = useRef({ prefs, t, fmt, lang });
  useEffect(() => {
    latest.current = { prefs, t, fmt, lang };
  });

  useEffect(() => {
    setCoachPresenter((p) => {
      const { prefs: pr, t: tr, fmt: format, lang: l } = latest.current;
      if (p.sound) void playCoachSound(p.sound, pr.soundVolume);
      if (p.voice) {
        const m = voiceMessage(p.voice, pr.speakAmounts, hasKey);
        if (hasKey(m.key)) void speak(tr(m.key, format(m.params)), { language: l === 'en' ? 'en' : 'fr' });
      }
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void stopVoice();
    });
    return () => {
      setCoachPresenter(null);
      sub.remove();
      void stopVoice();
    };
  }, []);
  return null;
}
