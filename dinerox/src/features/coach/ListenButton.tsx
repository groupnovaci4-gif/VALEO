/**
 * Bouton « Écouter » : lit à voix haute le texte affiché (demande explicite de
 * l'utilisateur : le texte est lu tel qu'il est à l'écran). Une seule voix à
 * la fois (file commune) ; un second appui arrête la lecture.
 */
import React, { useState } from 'react';
import { useI18n } from '@/i18n';
import { Button, IconButton, useToast } from '@/components/ui';
import { useTheme } from '@/theme';
import { speak, stopVoice } from '@/services/voice';
import { speakable } from '@/core/coach/voice';

/**
 * `text` : le texte affiché, ou ses lignes (assemblées en phrases, émojis retirés).
 * `onEnd` : appelé quand la lecture est allée JUSQU'AU BOUT (refonte finale E1 : le message est
 * alors lu) — jamais si la personne l'arrête ou si la voix est indisponible.
 * `iconOnly` : haut-parleur seul (liste des notifications du Budget), même nom accessible.
 */
export function ListenButton({ text, size = 18, onEnd, iconOnly }: { text: string | readonly string[]; size?: number; onEnd?: () => void; iconOnly?: boolean }) {
  const { t, lang } = useI18n();
  const { v2 } = useTheme();
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  const spoken = speakable(text, lang === 'en' ? 'en' : 'fr');
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
        if (r.spoken) onEnd?.();
      })
      .finally(() => setPlaying(false));
  };
  const icon = playing ? 'stop-circle-outline' : 'volume-high-outline';
  const label = playing ? t('coach.listen.stop') : t('coach.listen');
  if (iconOnly) return <IconButton icon={icon} label={label} onPress={onPress} size={size} />;
  // v2 : jamais une icône seule — « Écouter » est écrit (même nom accessible).
  if (v2) return <Button small variant="tertiary" icon={icon} label={label} onPress={onPress} />;
  return <IconButton icon={icon} label={label} onPress={onPress} size={size} />;
}
