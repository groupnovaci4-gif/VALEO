/**
 * Images des photos d'ambiance, EMBARQUÉES dans l'application (require local) :
 * jamais téléchargées, affichées même hors ligne. Une entrée par emplacement du
 * registre `config/photos.ts` (même fichier, vérifié par `tests/photos.test.ts`).
 */
import type { ImageSourcePropType } from 'react-native';
import type { PhotoSlot } from '@/config/photos';

export const PHOTO_SOURCES: Record<PhotoSlot, ImageSourcePropType> = {
  welcome: require('../../../assets/photos/bienvenue.webp'),
  homeAdvice: require('../../../assets/photos/accueil-conseil.webp'),
  budget: require('../../../assets/photos/budget.webp'),
  goals: require('../../../assets/photos/objectifs.webp'),
  savings: require('../../../assets/photos/epargne.webp'),
  reserve: require('../../../assets/photos/reserve-famille.webp'),
  tontines: require('../../../assets/photos/tontines.webp'),
};
