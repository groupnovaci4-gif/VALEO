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
9. **Pays ≠ devise.** Le contexte pays vit dans `core/countries.ts` (registre :
   devise proposée, sources d'argent, revenus, charges, objectifs) et
   `core/catalog.ts` (sous-catégories par zone/pays, mots locaux). Ajouter un
   pays = une entrée dans le registre (+ libellés locaux éventuels), aucun écran
   à modifier ; `tests/countries.test.ts` vérifie chaque profil. Tout ce qui
   vient du pays est une SUGGESTION modifiable, jamais une obligation.
10. **Aucun blocage de saisie.** Seuls pays et devise sont obligatoires (et
    préremplis). Aucun compte n'est requis : `useActions().ensureCashAccount`
    crée « Espèces » si besoin. Une sous-catégorie précise la catégorie
    (`Transaction.subcategoryId`) sans la remplacer : budgets et rapports
    restent par catégorie principale.
11. **Provenance des chiffres** (`core/intelligence.ts`) : `user` (opérations),
    `declared` (profil financier), `estimate` (estimation DINEROX). Aucune
    statistique externe sans source identifiable (`external` + `reference`).
    Les simulations (indépendance financière) sont présentées comme telles.
12. **Saisie au clavier** : écrans via `Screen` (react-native-keyboard-controller,
    Android edge-to-edge). Validation des formulaires d'identité dans
    `core/validation.ts`. Une action qui peut échouer passe par `useRunAction()`
    (message d'erreur, jamais d'exception non gérée). Sur le web, `Alert.alert`
    est remplacé par `services/webAlert.ts` (confirmations réelles).
