/**
 * Sur le web, `Alert.alert` de react-native-web ne fait rien : les
 * confirmations (suppression, déconnexion, « Code oublié ? ») restaient sans
 * effet. On les remplace par les boîtes natives du navigateur.
 * Un seul choix ⇒ confirm() ; plusieurs choix (menu) ⇒ prompt() numéroté,
 * pour qu'aucune action destructive ne soit choisie par défaut.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons ?? [];
    const actions = list.filter((b) => b.style !== 'cancel');
    if (list.length <= 1) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    if (actions.length > 1) {
      const menu = actions.map((b, i) => `${i + 1}. ${b.text ?? ''}`).join('\n');
      const answer = window.prompt(`${text}\n\n${menu}`, '');
      const picked = answer ? actions[Number(answer.trim()) - 1] : undefined;
      if (picked) picked.onPress?.();
      else list.find((b) => b.style === 'cancel')?.onPress?.();
      return;
    }
    const confirmBtn = actions[0];
    if (window.confirm(text)) confirmBtn?.onPress?.();
    else list.find((b) => b.style === 'cancel')?.onPress?.();
  };
}
