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
    consommation). « Mon épargne » : verser / retirer / ajuster via
    `depositToSavings` / `withdrawFromSavings` / `adjustSavingsBalance`
    (contrôles purs `core/savings.ts`). Un AJUSTEMENT de solde
    (`type: 'adjustment'`, `direction`) n'est ni revenu ni dépense : toute
    nouvelle somme de revenus/dépenses doit l'exclure. « J'ai épargné… » =
    versement (`parseSavingsDeposit`), jamais une dépense.
22. **Mini-conversation vocale (1.9, `docs/conversation-vocale.md`).** Compréhension
    LOCALE d'abord (`core/entry/parse.ts` : listes, mots de remplissage, auto-
    corrections, mot ambigu → UNE question, score de confiance) ; l'IA
    (`parseVoiceEntry`, Functions) seulement si `needsAi`, en ligne et avec
    `aiConsent` — entrée minimale (transcription écrite, catégories actives, NOMS
    des comptes, date), jamais l'audio, ni soldes ni historique, rien de journalisé.
    Toute sortie de l'IA passe par `core/entry/aiGuard.ts` : schéma (sinon parseur
    local), montant RÉELLEMENT prononcé (sinon « à vérifier »), catégorie existante,
    active et du bon sens (sinon question « Autres ou créer X ? »). Les ambiguïtés
    sont des DONNÉES (`vocabulary.json` › `ambiguous`) ; un mot appris tranche sans
    redemander.
    Conversation (`core/entry/conversation.ts`) : PHRASES-MODÈLES uniquement (clé
    i18n + paramètres calculés), jamais de texte rédigé par l'IA ; au plus 2
    questions par note ; rien n'est enregistré sans « oui » / « Tout valider » ;
    enregistrement groupé (tout ou rien, un seul « Annuler ») ; bilan : UNE phrase
    pour les enveloppes. Voix : seulement si l'utilisateur a parlé, coupée par un
    toucher ou par le micro ; montants selon `EntryPrefs.speakAmounts` (distinct de
    `CoachPrefs.speakAmounts`). L'échange n'est ni stocké ni synchronisé.
    Une conversation = UNE saisie vocale (même compteur). Quotas `parseVoiceEntry`
    par jour : free 3, plus 20, family 20 par membre (`plans.ts` ↔ `subscription.ts`),
    seul un appel réussi compte ; plafond anti-abus de 50 tentatives/jour échecs
    compris. Réflexion du modèle désactivée. Consentement VERSIONNÉ
    (`core/aiConsent.ts`, version 2 = transcription) : un accord antérieur à la 1.9
    ne suffit pas, le nouveau texte est accepté une fois avant tout envoi.
    Chaque scénario : `docs/conversation-vocale-tests.md` + `e2e/voice-conversation.js`.
23. **Parrainage et liens (croissance, étape 1, `docs/parrainage.md`).** Le
    serveur fait foi : codes, statuts des filleuls, compteurs, récompenses et
    droit « Plus offert » (`users/{uid}.grants`, lu par `effectivePlan`) sont
    écrits UNIQUEMENT par les Cloud Functions (`referralApi.ts`) ; les règles
    refusent toute écriture client (`referredBy`, `referralProgress`, `grants`,
    `referral/*`, `referrals/*`, `referralCodes`, `referralDevices`). Règle :
    1 mois de Plus au PARRAIN par tranche de 5 filleuls validés (semaine
    régulière), le filleul ne reçoit rien ; constantes `REFERRAL` (serveur) ↔
    `src/core/referral.ts` (parité testée). Aucune donnée financière dans le
    parrainage (compteurs seulement). Identifiant d'appareil : jamais en clair
    (HMAC, secret `REFERRAL_DEVICE_PEPPER`). Toute fonction déclarée hors de
    index.ts importe `./options` en premier (région europe-west1). Liens :
    `brand.linkHost` / `linkHosts` ; jamais Firebase Dynamic Links ni service
    tiers payant. Objets créés automatiquement par l'application : préfixe
    de `AUTO_CREATED_ID_PREFIXES` (ils ne comptent jamais). Le filleul lit
    toujours `ref.transparency` avant de valider un code. Tests : `npm run
    test:functions` (vraies fonctions sur émulateurs) et `e2e/referral.js`.
24. **Déploiement (fondateur, 2026-10-14, `docs/deploiement.md`).** Production
    `dinerox-app` : UNIQUEMENT depuis `dinerox-main` (propre, poussée), par
    `npm run deploy -- --only … --project dinerox-app`, jamais `firebase deploy`
    directement. Fonctions PAR NOM (`functions:nom`), jamais `functions` seul,
    jamais `--force` ; une proposition de suppression de fonction = NON. Le
    garde-fou `scripts/deploy-guard.mjs` (predeploy) l'impose. Accord du
    fondateur à chaque commande, simulation d'abord. Le secret
    `REFERRAL_DEVICE_PEPPER` ne change jamais.
25. **Partage (croissance, étape 2, `docs/partage.md`).** Un seul bouton
    `ShareWhatsAppButton` / `shareTextViaWhatsApp` : WhatsApp (ou Business)
    avec un message prérempli modifiable, sinon la feuille de partage ; rien
    n'est jamais envoyé automatiquement. Aucun montant, nom ni prénom dans un
    message ou une image (`containsAmount`, testé sur chaque modèle). Liens avec
    `src`. Événement `share_clicked` : `{context, channel}` seulement.
    Visibilité de WhatsApp : déclarations précises (`plugins/withWhatsAppQueries.js`,
    `LSApplicationQueriesSchemes`), jamais QUERY_ALL_PACKAGES.
26. **Tontine partagée (croissance, étape 3, `docs/tontines.md` › Lot T2).**
    Toute écriture passe par la fonction `tontineGroup` (règles : lecture
    réservée aux membres, aucune écriture client ; historique en ajout seul).
    Tournante seulement ; personne n'est membre sans l'avoir demandé et sans
    validation de l'organisateur ; aucun numéro de téléphone ; surnoms de
    l'organisateur sur son téléphone seulement ; statuts visibles selon la
    personne (`slotStatusFor`, parité application ↔ serveur testée) ; aucun
    argent ne transite ; l'opération réelle d'une cotisation utilise la même
    catégorie que le carnet, sur le compte CHOISI par la personne (jamais de
    compte créé automatiquement). Cette interdiction vaut pour la tontine
    partagée SEULEMENT (fondateur, 2026-10-14) : le compte « Espèces » de
    départ à l'inscription (`starterStructure`) et `ensureCashAccount` (carnet
    T1, saisie classique, règle 10) sont des comportements VOULUS, à ne pas changer. Un groupe n'est jamais une tontine personnelle
    (aucune limite de formule consommée).
27. **Avis sur le store (croissance, étape 4, `core/storeReview.ts`).** Fenêtre
    officielle (Google Play, Apple plus tard) pour les demandes AUTOMATIQUES
    seulement : rien avant (aucune question qui filtre les gens contents), rien
    après, aucune récompense. Deux moments : « Objectif atteint » fermé, cagnotte
    de tontine reçue (`markReviewMoment`) ; demande au retour à l'Accueil, écran
    libre (`screenBusy`). Règles pures `reviewDecision` (14 jours, 7 jours de
    saisie, 120 jours, 3 au total, arrêt après le menu, jamais première session,
    après un échec, ni pour un enfant) : ne pas les contourner. La ligne
    « Donner mon avis » ouvre DIRECTEMENT la page du store, cachée sans
    `config/app/items/store`. Ne jamais déclarer `playStoreUrl` / `appStoreUrl`
    dans `app.config.ts` (expo-store-review ouvrirait le store sans prévenir).
28. **Origine des installations (croissance, étape 5, `core/installOrigin.ts`).**
    Aucun outil de pistage tiers, aucun identifiant publicitaire : seulement
    `src` / `cmp` / `cnt` des liens DineroX (`/i/{code}`, `/a`, `/t/{code}`) et
    le referrer Google Play. L'origine reste sur l'appareil jusqu'à
    l'inscription, puis `recordSignupOrigin` l'ajoute UNE fois à des compteurs
    ANONYMES par jour (`originStats/{jour}`, serveur seul). Le profil ne garde
    que `originCounted: true` (règles : jamais écrit par le client), JAMAIS la
    source ; jamais le code d'invitation ni de tontine. Second compte sur un
    téléphone : « Origine inconnue ». Écran admin : `adminOriginStats` regroupe
    côté serveur ; un groupe de moins de 5 ne sort jamais du serveur (ni nom,
    ni nombre exact). Compté même sans consentement analytique (décision du
    fondateur : rien n'est rattaché à une personne).
29. **L'ARGENT MIS DE CÔTÉ — cercle fermé (règle métier du fondateur, 2026-10-14,
    `core/savingsCircle.ts`, `core/savingsFlows.ts`).**
    1. Comptes d'épargne (Épargne, Investissement, compte Tontine), objectifs,
       tontines (carnet et partagée) et réserve famille forment un cercle fermé :
       cet argent n'est JAMAIS disponible pour les dépenses (revenu 100 000,
       épargne 60 000 → disponible 40 000).
    2. Dans le cercle, l'argent circule librement (ce n'est pas une dépense) :
       une cotisation de tontine se paie depuis un compte courant, un compte
       d'épargne ou un objectif (l'objectif baisse d'autant, contribution
       négative liée). Une cotisation est de l'ÉPARGNE, jamais une dépense.
    3. Une dépense n'est JAMAIS prise sur un compte d'épargne ni sur un objectif,
       même par choix : retirer d'abord vers un compte courant (le retrait
       apparaît dans l'historique). Aucun compte d'épargne par défaut ni dans la
       liste d'une dépense ; le « dernier compte utilisé » est un compte courant ;
       « Espèces » est créé s'il n'existe aucun compte courant. Garde-fou central :
       `saveTransaction` reporte sur un compte courant toute nouvelle dépense sur
       l'épargne (une ancienne reste telle quelle, modifiable).
    4. Exception inchangée : la réserve famille paie directement ce pour quoi elle
       existe (`applyReserveUse`), sans nouvelle limite.
    UN SEUL critère, `isCircleMovement` : ancienne « dépense » Épargne, ou
    cotisation (`isTontineContribution`) = opération LIÉE à une tontine
    (`tontineId`, carnet ou tontine partagée, tous pays ; ancienne cotisation du
    carnet reconnue par son échéance, vue `withTontineLinks`) ou sous-catégorie
    « Tontine » / « Épargne communautaire » — jamais « Cotisation »,
    « Association », « Prêt à un proche », ni une catégorie sans sous-catégorie ; utilisé par TOUS les calculs : dépenses du mois,
    rapports (ligne « Mis de côté › Tontine »), export, budget, reste par jour,
    score, coach, conseils, résumé de l'assistant, analyse. Reste par jour : une
    cotisation payée depuis le disponible le fait baisser de son montant ENTIER
    (`tontinePaid`, jamais fondue dans la mise de côté prévue) ; depuis l'épargne
    ou un objectif, il ne change pas ; l'épargne de départ d'un compte d'épargne
    créé ce mois-ci est déduite une fois. « Pas assez d'argent » : message après
    une dépense seulement si le disponible devient NÉGATIF, carte de l'accueil à
    zéro ou moins, jamais si la personne n'a jamais renseigné son argent
    (`moneyTracked`), aucune notification ; une dépense est TOUJOURS enregistrée.
