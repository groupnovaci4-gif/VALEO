# L'IA qui comprend toute l'application (décisions du fondateur, 2026-10-19)

À réaliser sur une branche à part (`ia-comprend-tout`), créée depuis `dinerox-main` **après** la
fusion de la 1.6.0. Toute mise en production (fonctions Cloud) se fait avec l'accord du
fondateur, commande par commande, avec la méthode habituelle.

## 0. Décisions

1. **Un seul modèle d'IA dans toute l'application : Claude Haiku 5.5 (`claude-haiku-5-5`).**
   L'assistant (`financeAssistant`) quitte Opus ; la saisie vocale (`parseVoiceEntry`) est déjà
   sur Haiku. Même clé d'API qu'aujourd'hui (secret `ANTHROPIC_API_KEY`) : aucune nouvelle clé.
2. **Le téléphone d'abord.** Une phrase est d'abord comprise et calculée SUR L'APPAREIL, sans
   réseau et sans coût. L'IA en ligne n'intervient que pour une phrase que l'appareil n'a pas
   comprise, et seulement pour la TRADUIRE en une demande précise.
3. **L'IA ne calcule jamais un chiffre.** Toute réponse chiffrée vient de `src/core` (purs,
   testés). Toute action passe par `useActions()` et ses contrôles (§6 de `argent-disponible.md`).
4. **Aucune écriture sans « Valider ».** Chaque action est présentée sur une carte de
   validation ; rien n'est enregistré tant que la personne n'a pas appuyé.
5. **L'audio n'est jamais envoyé.** La voix devient du texte sur le téléphone (règle 18).
6. **Formules et limites inchangées.** Aucune nouvelle limite, aucun changement de formule.
7. **En cas de doute, une question.** L'application ne devine jamais.

## 1. Le chemin d'une phrase

```
voix (texte sur l'appareil) ou phrase écrite
  → 1. compréhension locale : core/ai/intent.ts (pur) → intention complète ?
        oui → 3.
  → 2. sinon, si consentement IA + réseau + quota existant non épuisé :
        Haiku traduit la phrase en intention JSON (schéma fermé) → validée localement → 3.
        sinon : « Je n'ai pas compris » + 3 exemples de phrases + bouton « Saisir à la main »
  → 3. intention :
        question → réponse calculée localement (clé i18n + paramètres)
        action   → carte de validation → « Valider » → useActions() → toast « Annuler »
        ouvrir   → ouvre l'écran demandé (aucune écriture)
        interdit → message « Je ne peux pas faire ça ici » + lien vers l'écran concerné
```

Les deux portes d'entrée utilisent ce même moteur : la feuille de saisie (bouton central
« Saisir », voix ou clavier) et l'assistant « Parler à DineroX ».

## 2. Ce que l'IA comprend : TOUTE l'application, par une liste fermée

Précision du fondateur : l'IA comprend **tout le contenu de l'application**, pas seulement
l'argent, le budget, l'épargne, les objectifs et les tontines. Chaque rubrique de l'Accueil, du
Budget, des Objectifs et de Plus, et chaque libellé affiché, peuvent être nommés dans une phrase.
Chaque intention a un identifiant stable, des paramètres typés et un test. Rien hors de cette
liste n'est exécuté.

### 2.0 Le vocabulaire : tous les libellés de l'application

Le vocabulaire n'est pas une liste écrite à la main : il est construit **à partir des données de
l'application**, sur le téléphone, à chaque ouverture.

- **Catalogue des catégories** (`core/categoryCatalog.v2.json`, environ 95 entrées) : catégories,
  sous-catégories et mots locaux. Exemples : Maison (loyer, électricité CIE, eau SODECI…),
  Alimentation & boissons (marché, maquis, garba…), Transport (taxi, gbaka, wôrô-wôrô, carburant…),
  Famille, Santé, Éducation, Communication & numérique… « J'ai dépensé 30 000 en loyer » →
  dépense, catégorie Maison, sous-catégorie loyer. Les noms personnalisés de la personne
  comptent aussi.
- **Les données de la personne**, avec leurs vrais noms : enveloppes (Maison, Transport, Famille,
  Épargne, Libre…), objectifs (« ma voiture », « mon mariage », « mon fonds d'urgence »), réserves,
  moments forts, tontines, comptes (Orange Money, Wave, Espèces, banque…), dettes et crédits
  (« Koffi », « prêt banque »), opérations récurrentes et obligations (« loyer », « Maman »),
  biens du patrimoine.
- **Les rubriques de l'application** (tous les écrans, voir §2.3).
- Rapprochement tolérant : accents, majuscules, pluriels, fautes de frappe légères, « ma voiture »
  pour « Voiture ». Deux correspondances possibles → question (§4).
- Un test vérifie que **chaque rubrique de Plus et chaque entrée du catalogue** ont au moins une
  phrase dans le corpus (§7) : une rubrique ajoutée plus tard sans phrase fait échouer le test.

### 2.1 Questions (réponse calculée sur le téléphone)

| Domaine | Exemples | Calcul (déjà existant) |
|---|---|---|
| Argent | « Combien j'ai de disponible ? », « Combien sur Orange Money ? », « Combien j'ai mis de côté ? », « Total de mes comptes ? » | `positionOf`, soldes des comptes |
| Reste par jour | « Combien je peux dépenser par jour ? », « Il me reste combien jusqu'à la paie ? » | `dailyAllowanceV2` |
| Budget | « Il reste combien pour le transport ? », « Quelles enveloppes sont dépassées ? », « Reste à répartir ? » | `envelopeStatuses`, `unallocated` |
| Dépenses et revenus | sujets actuels de `parser.ts` (`spent_month`, `spent_category`, `top_category`, `compare_months`, `income_month`, `month_summary`…) | `answers.ts` |
| Épargne | « Combien j'ai épargné ce mois ? », « Combien sur mon épargne ? », « Les 10 % ? » | `periodReport`, `tenPercent` |
| Objectifs | « Où en est ma moto ? », « Combien par mois pour ma voiture ? », « Quand j'aurai mon fonds d'urgence ? » | `goalPlanFor` |
| Réserve | « Combien dans ma réserve famille ? » | réserve (`isReserve`) |
| **Tontines** | « Quand est-ce que je paie ma tontine ? », « C'est combien ma cotisation ? », « À quand mon tour ? », « Quand je vais ramasser ? », « Combien j'ai déjà versé ? », « Je suis en retard ? » | `scheduleState`, `nextContribution`, `nextPayout`, `netPosition` |
| Catégories | « Combien j'ai dépensé en loyer ce mois ? », « Et en transport ? », « Combien pour la famille depuis janvier ? » | `expensesByCategory`, sous-catégories |
| Dettes et crédits | « Combien je dois ? », « Combien on me doit ? », « Je dois combien à Koffi ? », « Prochaine échéance du prêt ? » | `debtTotals`, `debtStatus` |
| Famille et obligations | « Combien j'envoie à Maman par mois ? », « Total des soutiens cette année ? » | obligations, récurrences `cat_family` |
| Échéances et calendrier | « C'est quand le loyer ? », « Prochaine paie ? », « Qu'est-ce que je dois payer cette semaine ? » | récurrences, calendrier, `recurringToConfirm` |
| Moments forts | « Combien pour la rentrée scolaire ? », « C'est dans combien de temps, la Tabaski ? » | moments forts (`isSeason`) |
| Puis-je contribuer ? | « Si je donne 30 000 pour les funérailles, il me reste combien ? » | simulateur (existant) |
| Patrimoine | « Combien vaut mon patrimoine ? », « Quelle est ma valeur nette ? » | patrimoine (existant) |
| Comptes et historique | « Mes dernières dépenses ? », « Combien j'ai payé au maquis cette semaine ? », « Quelle est ma plus grosse dépense du mois ? » | historique, filtres existants |
| Analyse et rapports | « Quelle est ma marge ? », « Mes charges fixes ? », « Bilan du mois dernier ? » | analyse financière, `periodReport` |
| Indépendance financière | « Où j'en suis de mon indépendance ? » | simulation existante (présentée comme simulation, règle 11) |
| Score et récompenses | « Quel est mon score ? », « Qu'est-ce que j'ai gagné ? » | `behaviorScoreV2`, récompenses |
| Famille (espace partagé) | « Combien la famille a dépensé ce mois ? » | espace actif, droits du rôle (`can`) |

Plusieurs tontines, objectifs ou comptes correspondent ? → question (§4). Aucun ne correspond →
« Je ne trouve pas de tontine "bureau". Vos tontines : … » (jamais une réponse inventée).

### 2.2 Actions (carte de validation obligatoire)

| Action | Exemples | Écriture (existante) |
|---|---|---|
| Dépense, revenu, transfert | « J'ai dépensé 30 000 en loyer », « Taxi 2 000 et garba 500 », « Salaire reçu 450 000 sur la banque », « Envoie 10 000 de Wave vers Orange Money » | `useEntrySave` → `useActions` |
| **Mettre de côté** | « Retire 100 000 de l'argent disponible pour le mettre en épargne », « Mets 50 000 de côté », « Garde 20 000 sur mon épargne » | `depositToSavings` |
| Reprendre de l'épargne | « Sors 30 000 de mon épargne vers Wave » | `withdrawFromSavings` |
| Ajouter à un objectif | « Ajoute 25 000 à ma moto » | `contributeToGoal` |
| Créer un objectif | actuel (`kind: 'goal'`) | `createGoal` |
| **Cotisation de tontine payée** | « J'ai payé ma tontine », « J'ai cotisé 20 000 à la tontine du bureau » | `recordTontine` (cotisation) |
| **Cagnotte reçue** | « J'ai reçu la cagnotte », « J'ai ramassé ma tontine » | `recordTontine` (cagnotte) |
| Remboursement de dette | « J'ai remboursé 50 000 à Koffi » | `recordDebtPayment` |
| Échéance réglée ou reçue | « J'ai payé le loyer », « Le salaire est tombé » | `confirmRecurring` |
| Prendre sur la réserve | « Prends 40 000 sur la réserve famille pour les funérailles » | `takeFromReserve` |
| Montant d'une enveloppe | « Mets le transport à 50 000 ce mois-ci » | `saveEnvelope` |
| Nouvelle obligation ou récurrence | « Chaque mois j'envoie 50 000 à Maman », « Le loyer c'est 100 000 le 5 » | `saveRecurring` |
| Nouvelle dette | « Koffi m'a prêté 100 000 », « J'ai prêté 20 000 à Awa » | `saveDebt` |
| Ouvrir un écran | « Ouvre mes tontines », « Montre mon budget », « Va dans le patrimoine » | navigation seule |

### 2.3 Toutes les rubriques sont couvertes

Chaque écran de l'application a au moins une question, et une action quand il en a une :
Accueil (reste par jour, argent disponible, mois en cours, dernières opérations), Budget
(enveloppes, reste à répartir), Objectifs (objectifs, réserves, moments forts, répartition),
et chaque rubrique de Plus : Historique, Comptes, Épargne, Mes tontines, Famille et obligations,
Moments forts, Puis-je contribuer ?, Dettes et crédits, Patrimoine, Opérations récurrentes,
Parler à DineroX, Analyse financière, Calendrier financier, Indépendance financière, Mes
récompenses, Mon score, Famille, Rapports, Notifications, Catégories. Les rubriques sans calcul
(Notifications, Catégories, Formules, Paramètres) sont seulement ouvertes, jamais modifiées par
l'IA (§2.4). Une rubrique fermée par la formule ou par le rôle (enfant, membre) reste fermée :
l'IA ne contourne jamais `can()` ni `hasFeature()`.

### 2.4 Interdit (même si la phrase est comprise)

Supprimer quoi que ce soit ; modifier ou annuler une opération passée (sauf le toast
« Annuler » juste après la validation) ; formule, abonnement, paiement ; sécurité (mot de passe,
code PIN, e-mail, déconnexion, suppression du compte) ; membres de la famille et invitations ;
export ou partage des données ; réglages ; envoyer de l'argent réel (règle 20 : l'application ne
détient ni ne transfère jamais d'argent). Réponse : « Je ne peux pas faire ça ici » + lien vers
l'écran concerné.

## 3. La carte de validation

- Titre avec le verbe : « Mettre 100 000 FCFA de côté ».
- De → vers : « Depuis Orange Money → vers Mon épargne ». Date : aujourd'hui par défaut.
- Effet visible : « Argent disponible après : 605 500 FCFA ».
- Montant, compte, date et objectif modifiables sur la carte ; un champ incertain est surligné,
  jamais deviné (règle 18).
- Boutons : **« Valider »** (principal), « Modifier » (ouvre le formulaire prérempli), « Annuler ».
- Contrôles §6 avant d'écrire : montant supérieur à l'argent disponible ou au solde du compte →
  message existant et feuille de complément (`spendPlan` / `canDebit`), jamais d'écriture
  silencieuse. Cagnotte de tontine : comptée seulement une fois reçue (règle 20).
- Après « Valider » : le toast habituel « Enregistré — Annuler » (5 s).
- Plusieurs actions dans une phrase : une carte par action et « Tout valider » (comme la saisie).

## 4. Ambiguïtés : une question, jamais une supposition

- Il manque le compte, la tontine, l'objectif ou le montant → une question avec des boutons tirés
  des données de la personne : « Depuis quel compte ? [Orange Money] [Wave] [Espèces] ».
- Au plus deux questions ; ensuite, « Ouvrir le formulaire » prérempli.
- « L'argent disponible » n'est pas un compte : si un seul compte courant peut couvrir le montant,
  il est proposé ; sinon, la question « Depuis quel compte ? » est posée.
- Une expression locale ou un mot d'argot pas encore validés par le fondateur restent inactifs
  (règle 18).

## 5. Données et confidentialité

- **Sur le téléphone** : compréhension locale, calculs, réponses, cartes. Aucun réseau.
- **Vers l'IA (repli seulement, avec consentement)** : uniquement la phrase (300 caractères au
  plus) et la langue. **Aucune donnée de la personne** : ni soldes, ni comptes, ni noms de
  tontines ou d'objectifs. L'IA renvoie les mots tels quels (« bureau », « moto ») et c'est le
  téléphone qui les rapproche des données locales. Le texte système peut contenir les noms
  STANDARD du catalogue et des rubriques (identiques pour tout le monde), jamais les noms saisis
  par la personne.
- Le texte système (liste fermée des intentions, schéma de réponse) est fixe : il peut être mis
  en cache (moins cher).
- La fonction ne journalise jamais la phrase. Elle peut compter les jetons consommés par jour
  (nombres seulement), pour mesurer le coût réel.
- L'assistant « Parler à DineroX » garde son résumé agrégé actuel (`core/ai/summary.ts`) pour
  les questions ouvertes (« Pourquoi je n'arrive pas à épargner ? ») : l'IA reformule des
  chiffres déjà calculés, elle n'en invente aucun (règle 7).

## 6. Modèle, coût et quotas

- `financeAssistant` : `claude-haiku-5-5`, réflexion désactivée (`thinking: {type: 'disabled'}`)
  avec un effort `low`, `max_tokens` adapté à 120 mots (environ 1 000). Retirer `fallbacks` et
  l'en-tête bêta `server-side-fallback` (non pris en charge par Haiku). Un refus
  (`stop_reason: 'refusal'`) ou une erreur → réponse locale, jamais d'écran d'erreur brut.
- Repli de compréhension : Haiku, sortie structurée (schéma JSON fermé), réflexion désactivée,
  comme `parseVoiceEntry`.
- **Quotas inchangés.** Une phrase comprise sur le téléphone ne consomme aucun quota. Le repli
  IA consomme le quota qui existe déjà pour sa porte d'entrée : `AI_VOICE_PARSE_PER_DAY` pour la
  feuille de saisie, `AI_DAILY_LIMIT` pour l'assistant. Quota épuisé → compréhension locale seule,
  jamais de blocage de la saisie.
- Coût attendu (tarifs officiels, ≈ 600 F CFA pour 1 dollar) : moins de 1 F par phrase envoyée à
  Haiku ; 0 F pour une phrase comprise sur le téléphone. Hypothèse du tableur
  (`rentabilite-formules.xlsx`) : 60 F par personne et par mois, à confirmer avec les compteurs
  de jetons.

## 7. Tests (rouges d'abord)

- **Corpus de plus de 200 phrases** (`tests/fixtures/ia-phrases.json`), français et anglais, avec
  des tournures ivoiriennes (« j'ai cotisé », « mon tour de ramasser », « garde 50 000 », « enlève
  100 000 sur mon Orange Money », « c'est quand je vais toucher », « je dois combien à Koffi »),
  des fautes de frappe et des montants écrits en lettres. Chaque phrase porte l'intention
  attendue, ou `ia` si elle doit partir au repli. Objectif : au moins 80 % comprises sur le
  téléphone.
- **Couverture** : au moins une phrase par rubrique (§2.3), par entrée du catalogue des catégories
  et par type de donnée de la personne (enveloppe, objectif, réserve, moment fort, tontine, compte,
  dette, récurrence, bien). Le test lit la liste des rubriques et le catalogue eux-mêmes.
- Aucune écriture sans « Valider » ; chaque intention interdite est refusée ; une ambiguïté
  produit une question ; un montant supérieur au disponible ouvre le complément.
- Le repli n'envoie que la phrase et la langue (test sur le corps de la requête) ; la réponse de
  l'IA est validée et nettoyée (intention hors liste → « Je n'ai pas compris »).
- Requêtes au modèle : `claude-haiku-5-5` partout, aucun `fallbacks`, aucune `temperature`.
- e2e : une question de tontine, une mise de côté validée puis annulée, une phrase ambiguë,
  une intention interdite ; captures pour le fondateur.
