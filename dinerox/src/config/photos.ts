/**
 * Photos d'ambiance (design) : registre UNIQUE, une photo par écran au plus.
 * Fichiers dans `assets/photos` (licence et sources : `assets/photos/SOURCES.md`),
 * embarqués dans l'application (`components/ui/photoSources.ts`) : jamais téléchargés,
 * l'application marche hors ligne. Vérifié par `tests/photos.test.ts`.
 */
export const PHOTOS = {
  welcome: { file: 'bienvenue.webp', screen: 'src/app/(auth)/welcome.tsx' },
  homeAdvice: { file: 'accueil-conseil.webp', screen: 'src/features/coach/AdviceOfDay.tsx' },
  budget: { file: 'budget.webp', screen: 'src/app/(tabs)/budget.tsx' },
  goals: { file: 'objectifs.webp', screen: 'src/app/(tabs)/goals.tsx' },
  savings: { file: 'epargne.webp', screen: 'src/app/savings/index.tsx' },
  reserve: { file: 'reserve-famille.webp', screen: 'src/app/reserve/[id].tsx' },
  tontines: { file: 'tontines.webp', screen: 'src/app/tontines/index.tsx' },
} as const;

export type PhotoSlot = keyof typeof PHOTOS;
