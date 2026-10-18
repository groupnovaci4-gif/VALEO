/**
 * Photo d'ambiance (design) : registre UNIQUE. Décision du fondateur (2026-10-18) :
 * une seule photo dans l'application, en plein écran sur la zone verte de l'écran de
 * bienvenue. Fichier dans `assets/photos` (licence et source : `assets/photos/SOURCES.md`),
 * embarqué dans l'application (`components/ui/photoSources.ts`) : jamais téléchargé,
 * l'application marche hors ligne. Vérifié par `tests/photos.test.ts`.
 */
export const PHOTOS = {
  welcome: { file: 'bienvenue-plein.webp', screen: 'src/app/(auth)/welcome.tsx' },
} as const;

export type PhotoSlot = keyof typeof PHOTOS;
