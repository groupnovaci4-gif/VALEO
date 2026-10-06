/**
 * Sons courts et vibrations du coach. Toujours accompagnés d'un équivalent
 * visuel (toast, carte) : le son n'est jamais la seule information.
 */
import { Platform } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { CoachSound } from '@/core/coach/policy';

const FILES: Record<CoachSound, number> = {
  warning: require('../../../assets/sounds/warning.wav'),
  alarm: require('../../../assets/sounds/alarm.wav'),
  success: require('../../../assets/sounds/success.wav'),
};

const HAPTIC: Record<CoachSound, Haptics.NotificationFeedbackType> = {
  warning: Haptics.NotificationFeedbackType.Warning,
  alarm: Haptics.NotificationFeedbackType.Error,
  success: Haptics.NotificationFeedbackType.Success,
};

/** Web : le navigateur refuse tout son avant une interaction de l'utilisateur (erreur non rattrapable dans expo-audio). */
function webAudioAllowed(): boolean {
  const nav = globalThis.navigator as (Navigator & { userActivation?: { hasBeenActive: boolean } }) | undefined;
  return !!nav?.userActivation?.hasBeenActive;
}

export async function playCoachSound(sound: CoachSound, volume: number): Promise<void> {
  if (Platform.OS !== 'web') await Haptics.notificationAsync(HAPTIC[sound]).catch(() => undefined);
  if (volume <= 0 || (Platform.OS === 'web' && !webAudioAllowed())) return;
  try {
    const p = createAudioPlayer(FILES[sound]);
    p.volume = Math.min(1, Math.max(0, volume));
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        sub.remove();
        p.remove();
      }
    });
    p.play();
  } catch {
    // Son indisponible : l'alerte reste visible à l'écran.
  }
}
