# CLAUDE.md — DineroX

Application Expo (SDK 57) + Firebase. Projet indépendant de VALEO (dossier
voisin) : ne rien partager entre les deux. Code et commentaires en français.

## Commandes
- `npm run check` — typecheck + lint + tests (doit rester vert, lint à zéro).
- `npm run e2e` — parcours de bout en bout sur l'export web + émulateurs
  (tous les formulaires, multi-comptes) : voir `e2e/README.md`.
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
13. **Arbre natif stable (Android, Fabric).** Ne jamais faire varier selon un état
    (focus, pression, erreur) une propriété qui crée un « stacking context »
    (`shadowColor`, `opacity`, `transform`, `zIndex`, `pointerEvents`, `overflow`…)
    sur un conteneur qui englobe un `TextInput` : Fabric déplacerait le champ et
    Android lui retirerait le focus (champs qui clignotent, saisie impossible —
    bug de la v1.4.0). Fixer `collapsable={false}` et ne varier que des couleurs
    ou des opacités d'ombre (`components/ui/fieldStyle.ts`, testé).
14. **Plusieurs comptes sur un appareil.** Tout ce qui est local est rangé par uid
    (`storageKey(uid, …)`, code PIN `security.ts`) ; la session en mémoire est
    effacée à chaque changement de compte (`resetSession`) ; une modification de
    profil en attente porte son propriétaire (`pendingOf`). La déconnexion
    annule les rappels locaux et retire le jeton push de l'appareil.
15. **Formulaires.** Un seul composant de saisie : `Field` / `AmountField`
    (seule exception : la zone de message de l'assistant, au style fixe). Un champ ne doit jamais apparaître
    puis disparaître selon une donnée qui arrive en différé (profil, synchro) :
    figer la décision au premier chargement et ne jamais retirer un champ
    commencé (cf. prénom de l'onboarding). Les écrans dont l'état initial dépend
    des données passent par `withSpaceReady`. Les feuilles avec champs sont des
    `Sheet` (modale + gestion du clavier) ; un menu qui ouvre un autre écran est
    une `Sheet inline` (même fenêtre : le champ de l'écran suivant peut ouvrir le
    clavier). Chaque nouvel écran de saisie est ajouté à `e2e/forms-audit.js`.
16. **Session Firebase** : dans `onAuthStateChanged`, toutes les lectures
    asynchrones d'abord, puis l'état de session posé en une fois ; jamais de
    `setState` après un `await` qui pourrait écraser une donnée plus fraîche.
