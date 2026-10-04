# CLAUDE.md — DineroX

Application Expo (SDK 57) + Firebase. Projet indépendant de VALEO (dossier
voisin) : ne rien partager entre les deux. Code et commentaires en français.

## Commandes
- `npm run check` — typecheck + lint + tests (doit rester vert, lint à zéro).
- `npm run test:rules` — règles Firestore sur l'émulateur.
- `npm --prefix firebase/functions run typecheck` — Cloud Functions.
- Installer une dépendance native : `EXPO_OFFLINE=1 npx expo install <pkg>`.

## Règles à respecter
1. **Calculs dans `src/core` uniquement** (purs, testés). Les écrans n'ont pas de formule.
2. **Écritures via `useActions()`** (`src/store/actions.ts`) : validation, rôles,
   limites de formule, horodatage par le moteur. Jamais de Firestore direct
   depuis un écran, jamais d'horodatage manuel.
3. Ajouter une collection ⇒ `COLLECTIONS` (`core/types.ts`) **et**
   `knownCollection`/`validDoc` (`firebase/firestore.rules`) **et** un test de règles.
4. Permissions : `core/permissions.ts` est le miroir de `firestore.rules` — modifier les deux.
5. Montants : entiers en unités mineures ; formatage via `formatMoney` / `useMoney`.
   Jamais de conversion de devise implicite.
6. Textes : uniquement via `t('clé')` (`src/i18n/fr.ts` puis `en.ts`, mêmes paramètres).
   Nom de marque : `{app}` / `config/brand.ts`, jamais « DineroX » en dur.
7. IA : aucune opération financière sans confirmation explicite ; aucune donnée
   inventée ; données minimales vers le serveur (`core/ai/summary.ts`).
8. Abonnement et membres d'un espace : écrits **uniquement** par les Cloud Functions.
