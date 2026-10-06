/**
 * Service vocal unique de l'application : une seule file (jamais deux voix),
 * repli premium → appareil → texte seul.
 */
import { VoiceQueue, type PreparedProvider, type SpeakOptions, type VoiceOutcome } from './queue';
import { deviceVoice } from './device';
import { premiumVoice } from './premium';

let premiumEnabled = false;
/** Voix premium autorisée (préférence + formule + compte en ligne). */
export function setPremiumVoiceEnabled(on: boolean) {
  premiumEnabled = on;
}

const premium = premiumVoice(() => premiumEnabled);
const providers = (): PreparedProvider[] => (premiumEnabled ? [premium, deviceVoice] : [deviceVoice]);
const queue = new VoiceQueue(providers, 5000);

export function speak(text: string, opts: SpeakOptions): Promise<VoiceOutcome> {
  return queue.enqueue(text, opts);
}

/** Coupe toute voix (file + synthèse de l'appareil), même si rien n'est en file. */
export async function stopVoice(): Promise<void> {
  await queue.stop();
  await deviceVoice.stop().catch(() => undefined);
}
