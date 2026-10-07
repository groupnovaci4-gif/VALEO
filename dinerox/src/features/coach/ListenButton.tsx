/**
 * Bouton « Écouter » : lit à voix haute le texte affiché (demande explicite de
 * l'utilisateur : le texte est lu tel qu'il est à l'écran). Une seule voix à
 * la fois (file commune) ; un second appui arrête la lecture.
 */
import React, { useState } from 'react';
import { useI18n } from '@/i18n';
import { IconButton, useToast } from '@/components/ui';
import { speak, stopVoice } from '@/services/voice';
import { speakable } from '@/core/coach/voice';

/** `text` : le texte affiché, ou ses lignes (assemblées en phrases, émojis retirés). */
export function ListenButton({ text, size = 18 }: { text: string | readonly string[]; size?: number }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  const spoken = speakable(text);
  if (!spoken) return null;
  const onPress = () => {
    if (playing) {
      setPlaying(false);
      void stopVoice();
      return;
    }
    setPlaying(true);
    void speak(spoken, { language: lang === 'en' ? 'en' : 'fr' })
      .then((r) => {
        if (!r.spoken && r.reason === 'unavailable') toast.show(t('coach.settings.testFailed'), 'info');
      })
      .finally(() => setPlaying(false));
  };
  return <IconButton icon={playing ? 'stop-circle-outline' : 'volume-high-outline'} label={playing ? t('coach.listen.stop') : t('coach.listen')} onPress={onPress} size={size} />;
}
