/**
 * Image de la photo d'ambiance, EMBARQUÉE dans l'application (require local) : jamais
 * téléchargée, affichée même hors ligne. Une entrée par emplacement du registre
 * `config/photos.ts` (même fichier, vérifié par `tests/photos.test.ts`).
 */
import type { ImageSourcePropType } from 'react-native';
import type { PhotoSlot } from '@/config/photos';

export const PHOTO_SOURCES: Record<PhotoSlot, ImageSourcePropType> = {
  welcome: require('../../../assets/photos/bienvenue-plein.webp'),
};
