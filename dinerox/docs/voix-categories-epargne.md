# 1.8 — Enregistreur vocal, catalogue de catégories, épargne, audit

Mission en quatre parties : (1) enregistreur vocal « comme WhatsApp », (2)
catalogue de catégories de départ configurable, (3) versements dans « Mon
épargne », (4) audit de toute l'application (`docs/audit-bugs.md`).

## Décisions du fondateur (validées avant de coder)

| # | Sujet | Décision |
|---|---|---|
| 1 | Enregistreur | Approche A : reconnaissance continue + relance automatique, morceaux raccordés |
| 2 | Enveloppe « Épargne » | Compte les versements vers les comptes d'épargne du mois (+ anciennes dépenses `cat_savings`) |
| 3 | Anciennes dépenses `cat_savings` / `cat_investment` | Exclues des dépenses (épargne, pas consommation) |
| 4 | Masquage par profil | Seulement si la situation familiale est renseignée ET 0 enfant ET 0 personne à charge |
| 5 | Limite de 3 comptes (gratuit) | Inchangée ; message clair + `UpgradeCard` |
| 6 | Pays du catalogue v2 | CI, SN, BJ, TG, BF, ML, NE, GW, GN |
| 7 | Catégorie renommée par l'utilisateur | Garde son nom, son emoji et sa couleur |

## Partie 1 — Enregistreur « comme WhatsApp »

**Comportement.** Toucher le micro → l'enregistrement démarre (vibration).
On parle aussi longtemps qu'on veut, pauses comprises. Toucher ■ → arrêt
(vibration), le texte part vers la carte de confirmation existante.

**Supprimé :** l'arrêt automatique sur silence (`continuous: false`,
`EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000`, `no-speech` traité
comme une fin). La consigne « arrêt automatique après un silence » du prompt v3
est annulée.

**Seules fins possibles :** le toucher ■ ; la corbeille ; la fermeture de la
feuille ; la mise en arrière-plan ou un appel (arrêt propre, ce qui a été dit
est GARDÉ) ; la limite de sécurité invisible de 5 minutes (message à 4:30).

**Technique (approche A).**
- `core/entry/recorder.ts` — machine d'états PURE
  `idle → recording → processing → confirm` (+ `cancelled`, `denied`) ;
  chronomètre, limite, double toucher (400 ms), toucher < 1 s = annulation
  silencieuse, attente du dernier morceau après ■ (1,5 s au plus).
- Le moteur du téléphone s'arrête de lui-même quand il n'entend plus de voix :
  `engineEnd` / `no-speech` → **relance immédiate** (`restartEngine`). Garde-fou :
  8 arrêts IMMÉDIATS (< 1 s) de suite = moteur absent → arrêt propre. Un
  silence, même de plusieurs minutes, n'est jamais compté.
- `stitchTranscript` / `appendSegment` raccordent les morceaux : cumulatif
  (iOS) remplacé, répétition ignorée, chevauchement gardé une seule fois.
- `services/speechInput.ts` : `continuous: true` sur iOS, web et Android 13+ ;
  aucune option de silence ; niveau sonore (`volumechange`) pour l'onde.
- `services/voiceRecorder.ts` : exécute les ordres de la machine (moteur,
  horloge, vibrations, `AppState`). La dictée de l'assistant utilise la même
  règle (`recordUntilStopped`).
- `features/entry/RecorderBar.tsx` : pastille rouge qui clignote, chronomètre,
  onde (animation neutre si le niveau sonore n'est pas fourni, ex. web),
  corbeille, bouton ■. Dans la feuille de saisie, pas d'écran plein.

**Limite connue.** Sur certains Android, le système émet un bip à chaque
relance du moteur. Le couper demanderait un module natif (nouvelle dépendance
native, non ajoutée sans accord).

**Audio.** Jamais enregistré ni envoyé à un serveur DineroX ; la reconnaissance
reste celle du téléphone (sur l'appareil quand il le permet).

**Testé.**
- `tests/recorder.test.ts` (23) : silences de 5, 10, 30 s et 4 min sans
  arrêt ; seul le toucher arrête ; dernier morceau gardé ; annulation, double
  toucher, < 1 s ; limite 4:30 / 5:00 ; arrière-plan et appel ; micro refusé ;
  moteur en panne ; raccord sans doublon.
- `tests/voice-recorder.test.ts` (7) : contrôleur réel sur un faux moteur
  Android (arrêt spontané 3 s après la parole, `no-speech`, `busy` au
  redémarrage), horloge simulée.
- `e2e/voice-recorder.js` (application réelle, export web, moteur simulé
  comme Android) : pause de 10 s → toujours en enregistrement, chronomètre qui
  monte, 4 démarrages du moteur, texte raccordé → 2 opérations ; corbeille ;
  toucher < 1 s ; double toucher ; arrière-plan ; dictée de l'assistant.

**À vérifier sur un vrai téléphone (prioritaire).** Un enregistrement avec une
pause de 10 secondes au milieu ; puis 30 secondes ; un appel entrant pendant
l'enregistrement ; le bip éventuel à chaque relance ; Android 12 (pas de mode
continu, la relance fait tout).

## Partie 2 — Catalogue de catégories

### Phase 1 — Le catalogue est une donnée

- `src/core/categoryCatalog.v2.json` : **fichier de catalogue versionné**
  (`catalogVersion: 2`) : 12 catégories, 82 sous-catégories. Pour chacune :
  `id` stable, libellés FR et EN, emoji (catégories), `parentId`,
  `sortOrder`, `bucket` (besoin / envie / obligation / dette), `envelope`
  (compartiment du budget automatique), `countries`, `profileRules`,
  `defaultEnabled`, `keywords`.
- `src/core/categoryCatalog.ts` (pur) : `sanitizeCatalog` (rien d'invalide
  n'est accepté), `catalogStarterDocs`, `maskedByProfile`,
  `effectiveCategoryId` / `effectiveTransactions` (alias).
- **Mise à jour à distance** : `config/categories/items/v2` (lecture pour tout
  utilisateur connecté, écriture administrateur ; règle existante
  `config/{doc}/items/{id}`, testée). `services/categoryCatalog.ts` le charge
  au démarrage, le met en cache ; hors connexion, le cache puis le catalogue
  embarqué s'appliquent. Les catégories installées par le catalogue ont un
  libellé `catalog:<id>` : une correction publiée s'affiche partout, sauf si
  l'utilisateur a renommé la catégorie (son nom prime).
- **Alias, aucune réécriture** : une opération est comptée sous le parent
  ACTUEL de sa sous-catégorie (`effectiveTransactions`, appliqué dans
  `useFinance` → rapports, budgets, analyses, export CSV, Historique). Une
  enveloppe qui citait l'ancien identifiant garde ses opérations
  (`resolveEnvelopeId` lit d'abord l'identifiant enregistré). Le champ de vue
  `legacyCategoryId` n'est jamais écrit (`saveTransaction` le retire).

### Phase 2 — Nouveaux et anciens utilisateurs

- **Nouvel utilisateur** (pays du catalogue) : `buildInitialStructure` /
  `starterStructure` installent `catalogStarterDocs(pays)` (dépenses) + les
  catégories de revenus habituelles. Autres pays : catégories actuelles du
  pays, sans « Épargne » ni « Investissement » (`categorySeedsFor`).
- **Utilisateur existant** : rien ne change automatiquement. La mise à niveau
  automatique d'avant (Bootstrap, clé `catalog2`) ne complète plus que les
  revenus dans les pays du catalogue. Carte discrète **« Nouvelles catégories
  disponibles »** (accueil, avec « Plus tard » ; écran Catégories) :
  `planCatalogUpdate` → aperçu (ajoutées, renommées, rattachées ailleurs),
  confirmation obligatoire, `applyCatalogUpdate`. Rien n'est supprimé ; une
  catégorie personnelle n'est pas touchée ; une catégorie renommée garde son
  nom, son emoji et sa couleur ; une catégorie supprimée n'est jamais recréée ;
  aucune opération n'est réécrite (alias).
- **Espace famille** : les catégories appartiennent à l'espace ; la carte et
  l'écran ne proposent d'écrire qu'aux rôles qui ont le droit (`can`).
- **Démo** (`buildDemoData`) : catalogue v2 (Côte d'Ivoire) ; la tontine du
  bureau est en « Finance sociale & obligations › Tontine ».

### Phase 3 — Pays et profil

- Catalogue v2 : CI, SN, BJ, TG, BF, ML, NE, GW, GN (décision 6). Autres pays :
  catégories actuelles. Règles `countries` : **Maquis** (CI, BF, TG, BJ). Charbon
  et Moto-taxi sont dans le catalogue de ces 9 pays (aucun catalogue inventé
  pour d'autres pays).
- Profil (décision 4) : « Enfants », « Santé des enfants », « Scolarité »
  masquées PAR DÉFAUT seulement si la situation familiale est renseignée ET
  0 enfant ET 0 personne à charge. Information inconnue → rien de masqué.
  Jamais supprimées : « Afficher toutes les catégories » dans les listes.
- Ancienne catégorie hors du catalogue (`cat_internet`, `cat_informal`,
  `cat_taxes`, `cat_insurance`…) : dans un espace mis à jour, proposée tant
  qu'elle sert (opérations ou récurrences) ; toujours visible dans l'écran
  Catégories et l'historique. Revenus : jamais concernés.

### Phase 4 — Tout est modifiable

`core/categoryOps.ts` (pur) + écran `categories` + `CategoryEditSheet` +
`CategoryPicker` :
- **Créer ma catégorie** / une sous-catégorie : nom, emoji (ou icône),
  couleur, parent, type de dépense (besoin, envie, obligation, dette), mots de
  la saisie vocale. Aussi depuis le formulaire, la carte de confirmation et
  les récurrences (« Nouvelle catégorie… »).
- **Modifier, réordonner** (glisser-déposer ≡, flèches pour l'accessibilité),
  **désactiver / réactiver**.
- **Supprimer** (`deleteMode`) : jamais utilisée → supprimée après
  confirmation ; utilisée → « Déplacer ses opérations vers… » (`planMerge` :
  opérations, récurrences, enveloppes, sous-catégories, mots ; aperçu du
  nombre ; confirmation) ou « Désactiver plutôt » ; système → masquée,
  « Rétablir par défaut » (`restoreDefaults`).
- **Listes de choix** (`pickCategories`) : recherche (nom, sous-catégorie,
  mot-clé ; accents ignorés), récentes en premier, désactivées absentes,
  masquées accessibles par « Afficher toutes les catégories ».
- **Bibliothèque** « Ajouter une catégorie du catalogue » (`libraryItems`) :
  catalogue + anciennes catégories (ex. « Impôts et cotisations »), jamais
  Épargne ni Investissement.

### Réserve et tontine : par identifiant

- Cotisation de tontine : `tontineContributionCategory` (parent ACTUEL de
  `sub_informal_tontine`) ; récurrence ou opération de tontine :
  `isTontineCategory` (ancienne `cat_informal` ou sous-catégorie Tontine).
- Réserve et moments forts : `cat_family` / `cat_social`, sauf Tontine,
  Cotisation et Association (`NOT_CEREMONY_SUBCATEGORIES`).

### Épargne ≠ consommation (décisions 2 et 3)

`core/savingsFlows.ts` : les anciennes « dépenses » `cat_savings` /
`cat_investment` restent intactes et visibles mais sont de l'épargne :
exclues des dépenses (`flowTotals`), des analyses (`expensesByCategory`,
`monthStats`), du rapport par catégorie (comptées dans « épargné »), du reste
par jour. L'enveloppe « Épargne » (et « Projets » pour un compte
d'investissement) compte les **versements vers les comptes d'épargne** du mois
(`savedByEnvelope`) ; le hors-enveloppe ne les compte pas.
Reste par jour : la mise de côté du mois = le plus grand de la mise de côté
prévue (objectifs, réserves) et de l'épargne versée (`savedThisMonth`).

### Phase 5 — Saisie vocale et écrite

`core/entry/keywords.ts` (pur, déterministe, sur l'appareil) branché dans le
parseur (`parse.ts`). Pour chaque segment, priorité :
1. mots **appris** des corrections (`Category.learnedWords`, le plus récent gagne) ;
2. mots saisis par l'utilisateur (« quand je dis… », `Category.keywords`) ;
3. **mots-clés du catalogue** (`keywords` du JSON), seulement pour les
   catégories installées par le catalogue 1.8 — un espace pas encore mis à jour
   garde exactement le comportement d'avant ;
4. vocabulaire local (`vocabulary.json`, inchangé).
À rang égal, le mot le plus long l'emporte. Une catégorie désactivée n'est
jamais proposée.

Exemples du catalogue : Yango / VTC / Uber → Yango / VTC ; woro-woro → Taxi
(taxi collectif) ; gbaka → Bus (minibus) ; pharmacie, médicaments →
Médicaments ; garba, alloco → Snacks ; crédit, unités → Crédit téléphonique ;
Canal+, Netflix → Abonnements streaming ; tontine, cotisation, funérailles,
mariage, baptême → Finance sociale & obligations.

**Apprentissage** : chaque ligne garde la catégorie proposée (`suggested`) ; si
l'utilisateur la remplace sur la carte de confirmation, le premier mot porteur
de sens de l'extrait (`learnableWord` : ni nombre, ni montant, ni liaison) est
mémorisé dans la catégorie choisie (`learnCategoryWord`) et retiré des
autres. Visible et effaçable dans la fiche de la catégorie (« Mots appris de
vos corrections »).

## Partie 3 — Mon épargne

### Deux notions distinctes

- **Mon épargne** = l'ACTION et l'ENDROIT : les comptes d'épargne. On y
  **verse**, on en **retire**, on en **ajuste le solde** (écran « Épargne »,
  boutons par compte, `app/savings/move.tsx`).
- **Objectif d'épargne** = le DÉFI (cible, date). Un versement PEUT
  l'alimenter : la part affectée est une contribution liée au mouvement
  (`transferId`), donc jamais comptée deux fois.

### Les mouvements (`core/savings.ts`, `useActions`)

| Mouvement | Écriture | Effet |
|---|---|---|
| Verser depuis un de mes comptes | transfert source → épargne | source ↓, épargne ↑, reste par jour ↓, dépenses inchangées |
| Verser de l'argent « déjà sur ce compte » (virement direct de l'employeur, solde jamais saisi) | **ajustement de solde** (`type: 'adjustment'`, `direction: 'in'`) | épargne ↑, ni revenu ni dépense, analyses et reste par jour inchangés |
| Ajuster le solde (solde réel saisi) | ajustement de l'écart (`in` ou `out`) | idem |
| Retirer vers un compte courant | transfert épargne → compte | jamais plus que le solde |
| Retirer en dépense directe | dépense (catégorie) sur le compte d'épargne | une consommation, comptée comme telle |
| Part d'un objectif | contribution liée (± ) | retrait d'objectif jamais au-delà de ce qui y est (`goal.withdrawTooMuch`) |

L'ajustement de solde est un nouveau type d'opération (règles Firestore :
`direction` obligatoire). Il est exclu partout où l'on additionne revenus et
dépenses (`flowTotals`, historique, analyses, rapports, intelligence) et
affiché « Ajustement de solde » (signé, ton neutre) ; sa fiche se consulte et
se supprime (pas de formulaire d'opération).

**Création d'un compte d'épargne** : « Combien y a-t-il déjà sur ce
compte ? » (solde d'ouverture) + « Montant à verser maintenant (facultatif) »
qui crée un VRAI versement (transfert depuis un compte, ou ajustement si
l'argent y est déjà), visible dans l'historique. Si le versement échoue, le
compte existe déjà : l'écran de versement s'ouvre prérempli (jamais de
doublon de compte).

**Phrase ou voix** : « J'ai épargné 20 000 », « J'ai mis 15 000 de côté sur
Ma banque », « Verse 10 000 dans mon épargne depuis Wave », « Verse 5 000
pour la Moto » → `parseSavingsDeposit` (pur) → écran de versement prérempli,
à confirmer. Jamais une dépense. Compte d'épargne retenu seulement s'il est
cité (ou s'il est le seul), objectif seulement s'il est cité par son nom ;
sinon l'utilisateur choisit (« Sur quel compte d'épargne ? », « Quel
objectif ? »). Une question (« Combien j'ai épargné ? »), un projet (« Je veux
épargner pour… »), une tontine ou un retrait ne sont pas des versements.
Même règle dans l'assistant.

### Phase 7 — Tableau des blocages (test du fondateur, APK 1.4.2)

Reproduits sur l'application réelle (`e2e/savings-repro.js`) avant correction,
puis vérifiés corrigés (`e2e/savings.js`, `tests/savings.test.ts`).

| # | Blocage constaté | Cause | Correction | Test |
|---|---|---|---|---|
| E1 | « Créer un compte d'épargne » → toucher le modèle « Compte bancaire » : le compte n'est plus un compte d'épargne, « Mon épargne » reste à 0 | le modèle remplaçait l'option `isSavings` par la sienne (`false`) | depuis « Créer un compte d'épargne », un modèle ne retire jamais l'option | e2e savings §1 |
| E2 | Aucun champ « montant à ajouter » : le montant saisi n'allait nulle part | champ absent ; seul « Solde actuel » existait | « Combien y a-t-il déjà ? » + « Montant à verser maintenant » → vrai versement | e2e savings §1 ; unit « scénario du fondateur » |
| E3 | Pas de façon simple de verser : il fallait passer par un transfert générique | aucun écran dédié | « Verser de l'argent » + Verser / Retirer / Ajuster / Historique par compte | e2e savings §2-5 |
| E4 | Argent déjà sur le compte (virement de l'employeur) impossible à enregistrer sans fausse dépense ou faux revenu | pas d'opération neutre | ajustement de solde (`adjustment`) | unit « ajustement » ; e2e §3 |
| E5 | Limite de la formule gratuite : message « Limite … () » incompréhensible | paramètre `limit` vide | « Votre formule gratuite permet 3 comptes et vous en avez déjà 3… » + UpgradeCard (limite inchangée, décision 5) | e2e savings §7 |
| E6 | « J'ai épargné 20 000 » → proposé en DÉPENSE | aucun sens « versement » dans le parseur | `parseSavingsDeposit` → écran de versement | unit « J'ai épargné » ; e2e §6 |
| E7 | Versement affecté à un objectif sans objectif choisi : enregistré SANS l'objectif, en silence (trouvé pendant les tests) | objectif présélectionné seulement s'il était lié au compte | seul objectif présélectionné ; plusieurs → choix obligatoire (« Quel objectif ? ») | e2e savings §4 |
| E8 | Retrait d'un objectif au-delà de ce qui y est | pas de contrôle à l'écran | `validateWithdraw` (`goal.withdrawTooMuch`, `savings.insufficient`) | unit « retrait » ; e2e §5 |
| E9 | Anciennes « dépenses » Épargne comptées comme consommation | catégorie `cat_savings` traitée comme une dépense | `savingsFlows` (décisions 2 et 3, phase 3) | unit « anciennes dépenses Épargne » |

Hors ligne : un versement fait sans connexion est enregistré tout de suite,
« Mon épargne » est à jour sur l'appareil, puis il est synchronisé au retour
de la connexion (vu d'un 2e appareil, e2e §8).
