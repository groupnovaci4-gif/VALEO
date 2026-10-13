/**
 * Typographies de la charte DineroX :
 *  - Plus Jakarta Sans : titres et grands montants ;
 *  - Inter : texte courant ;
 *  - JetBrains Mono : chiffres alignés (montants dans les listes, pourcentages).
 * Sur React Native, chaque graisse est une famille distincte : `fontFor`
 * choisit la bonne famille selon le rôle et la graisse demandée.
 */
// Import PAR GRAISSE : l'index des paquets @expo-google-fonts référence toutes les graisses
// (et leurs italiques), que Metro embarquerait alors dans l'application (48 fichiers, 9,4 Mo).
// Ici, seuls les 9 fichiers réellement utilisés sont embarqués — en local, jamais téléchargés.
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';

export const FONT_ASSETS = {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
};

export type FontRole = 'heading' | 'body' | 'numeric';

/** Famille de police pour un rôle et une graisse ('400'…'800'). */
export function fontFor(role: FontRole, weight: string | number | undefined): string {
  const w = Number(weight ?? 400) || (weight === 'bold' ? 700 : 400);
  if (role === 'heading') return w >= 800 ? 'PlusJakartaSans_800ExtraBold' : w >= 700 ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_600SemiBold';
  if (role === 'numeric') return w >= 600 ? 'JetBrainsMono_600SemiBold' : 'JetBrainsMono_500Medium';
  return w >= 700 ? 'Inter_700Bold' : w >= 600 ? 'Inter_600SemiBold' : w >= 500 ? 'Inter_500Medium' : 'Inter_400Regular';
}
