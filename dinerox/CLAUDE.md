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
17. **Coach (1.5, `docs/coach.md`).** Seuils, montants, pourcentages, alertes,
    récompenses et score sont calculés dans `src/core/coach/` (purs, testés) ;
    l'IA ne fait que reformuler un texte déjà calculé, sur demande et avec
    consentement. Toute nouvelle écriture financière passe par `useActions()`,
    qui prévient le coach (`notifyCoachWrite`). Ne jamais contourner
    `planDelivery` (dédoublonnage, délais, quotas de voix). La voix PROACTIVE ne
    prononce aucun montant sans `speakAmounts` ; le bouton « Écouter » (demande
    explicite) lit le texte affiché, montants compris, et se place À CÔTÉ d'une zone cliquable, jamais dedans. Le coach ne suit
    que les opérations saisies dans l'application (jamais « en temps réel »
    Orange Money, Wave ou banque). Clé ElevenLabs : secret Functions
    uniquement. Dictée (saisie vocale) : voir la règle 18.
18. **Saisie (1.5, `docs/lot-a.md`).** Une seule feuille de saisie
    (`features/entry`, ouverte par `useEntry().open()` ou le lien
    `/entry?mode=voice|keyboard`) et un seul chemin d'enregistrement
    (`useEntrySave` → `useActions`). Voix et phrase écrite → texte → parseur
    PUR `core/entry/parse.ts` → carte de confirmation : jamais
    d'enregistrement sans « Tout valider », un champ incertain est surligné,
    jamais deviné. Le vocabulaire local vit dans `core/entry/vocabulary.json`
    (données) ; une unité argotique reste inactive tant que le fondateur ne
    l'a pas validée. La voix du coach se tait quand le micro s'ouvre
    (`services/voice/micGate.ts` : ni voix ni son micro ouvert).
    **Enregistreur (1.8)** : comme une note vocale WhatsApp. SEUL le toucher
    arrête (aussi : corbeille, arrière-plan/appel en gardant le texte, limite
    invisible de 5 min avec message à 4:30). Jamais d'arrêt sur silence : aucune
    option `*_SILENCE_LENGTH_MILLIS`, et quand le moteur du téléphone s'arrête
    de lui-même il est relancé (`core/entry/recorder.ts`, machine d'états pure ;
    `services/voiceRecorder.ts` l'exécute ; morceaux raccordés par
    `stitchTranscript`). L'audio n'est jamais envoyé à un serveur DineroX.
    Événements d'usage : propriétés de `core/analyticsProps.ts` uniquement
    (jamais de montant, texte, bénéficiaire ni catégorie). Limite vocale
    gratuite : `FREE_VOICE_ENTRIES_PER_DAY`. « Reste par jour » :
    `core/dailyAllowance.ts`, jamais recalculé dans un écran.
19. **Réserve famille et cérémonies (1.6, `docs/reserve.md`).** Une réserve est un
    objectif `kind: 'reserve'` (absent = objectif classique) ; une utilisation est
    une contribution négative liée à la dépense (`linkedTransactionId`), jamais
    au-delà du solde (complément montré, jamais bloqué), supprimée avec
    l'opération. Le budget du mois (enveloppes, alertes, score) lit
    `budgetTransactions` ; le reste par jour ne baisse pas pour la part prise sur
    une réserve. Un enfant n'utilise jamais une réserve (`canUseReserve` + règles).
    Moments forts : objectifs à date de catégorie `seasons`, AUCUNE date codée en
    dur (catalogue `config/seasons/items`, corrigeable). Soutiens réguliers :
    récurrences `cat_family`. Bénéficiaires, défunts et noms saisis ne vont
    jamais dans un texte du coach, une notification, la voix ni le résumé IA.
    Ton : des chiffres et des options, jamais de jugement sur ce qu'on donne.
20. **Tontines (1.7, `docs/tontines.md`).** Carnet de SUIVI : l'application ne
    collecte, ne détient ni ne transfère jamais d'argent (mention obligatoire à
    la création et dans les CGU), aucune connexion à un opérateur. Calculs dans
    `core/tontine.ts` (`buildSchedule`, statuts, position nette, reste par jour,
    rappels) ; frais, commission, pénalités et ordre des tours sont SAISIS, jamais
    inventés. Une cotisation ou une cagnotte confirmée = une opération réelle +
    une entrée liée (`recordTontine`) ; supprimer l'opération supprime l'entrée.
    Une cagnotte attendue n'est jamais comptée avant d'être reçue. Une récurrence
    convertie reste active tant que l'utilisateur ne la désactive pas (pas de
    double comptage : `countedByRecurring`). Expressions locales de la saisie :
    inactives tant que le fondateur ne les a pas validées.
21. **Catégories (1.8, `docs/voix-categories-epargne.md`).** Le catalogue de
    départ est une DONNÉE (`core/categoryCatalog.v2.json`, publiable dans
    `config/categories/items/v2`) ; identifiants stables, jamais renommés.
    Un changement de parent ne réécrit JAMAIS l'historique : les calculs lisent
    `effectiveTransactions` (via `useFinance`), une enveloppe qui cite l'ancien
    identifiant garde ses opérations. Un utilisateur existant ne voit rien
    changer sans la carte « Nouvelles catégories disponibles » (confirmation,
    rien de supprimé, noms personnalisés gardés). Catégorie système : jamais
    supprimée (masquée, « Rétablir par défaut ») ; catégorie utilisée :
    fusion ou désactivation. Retrouver une catégorie PAR IDENTIFIANT, jamais
    par libellé (tontine : `tontineContributionCategory`, réserve :
    `reserveEligible`). Pas de catégorie « Épargne » : épargner n'est pas
    dépenser (`core/savingsFlows.ts` ; anciennes opérations intactes, hors
    consommation).
