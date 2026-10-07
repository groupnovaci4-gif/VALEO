# Tontines et cotisations (1.7)

DineroX est un **carnet de suivi** : l'application ne collecte, ne détient et
ne transfère jamais d'argent, et ne garantit pas les paiements des membres.
Aucune connexion (simulée ou réelle) à Wave, Orange Money, MTN, Moov ou une
banque. Les chiffres viennent du code ; rien n'est enregistré sans
confirmation.

## Plan du Lot T1 (écrit avant de coder)

### Modèle

Deux collections d'espace, ajoutées partout où le dépôt liste les collections
(`COLLECTIONS`, `emptySpaceData`, préfixes d'identifiants de `useActions`,
`knownCollection`/`validDoc` des règles + tests). La synchronisation,
l'outbox, l'export complet et la suppression de compte sont génériques sur
`COLLECTIONS` : rien d'autre à brancher.

- `tontines` : `type` (`rotating | collector | fixed_contribution`), `name`,
  `organizerName?`, `currency`, `amountPerShare`, `sharesHeld` (0,5 / 1 / 2…),
  `frequency` (`daily | weekly | biweekly | monthly | custom` + `customDays`),
  `startDate`, `membersCount` (tournante : nombre de **mains** au total =
  nombre de tours), `myTurns`, `potAmount?` (sinon calculé), `organizerFee?`,
  `latePenalty?` (informatifs), `cycleDays?`, `collectorCommission?`,
  `accountId?`, `status`, `linkedRecurringId?`.
- `tontineEntries` : `tontineId`, `kind` (`contribution | payout | fee |
  penalty`), `period` (numéro d'échéance), `amount`, `date`,
  `transactionId?`, `status` (`planned | done | late`).

`core/tontine.ts` (pur) : `buildSchedule` (dates, tour, « Vous » / « Tour n »,
cagnotte), statuts (`late` = échéance passée sans cotisation ; « Reporter »
écrit une entrée `planned` à la nouvelle date), position nette, rappels,
cotisations du mois pour le reste par jour, rapprochement d'une phrase avec
une tontine.

Règles de calcul (aucune règle locale inventée : frais, commission, pénalités
et ordre des tours sont saisis par l'utilisateur) :
- tournante : cotisation par échéance = `amountPerShare × sharesHeld` ;
  cagnotte = `potAmount` saisi, sinon `amountPerShare × membersCount` ; à
  chacun de mes tours je reçois une cagnotte entière par main, la demi-main
  reçoit la moitié de la cagnotte du tour partagé ;
- collecteur : une mise par échéance pendant `cycleDays` jours, rendue en fin
  de cycle moins la commission saisie ;
- cotisation fixe : échéances régulières, aucune redistribution.

### Écarts relevés (le dépôt fait foi)

1. `sub_informal_tontine` est une sous-catégorie de **dépense** (parent
   `cat_informal`, « Tontines et cotisations »), pas de revenu. Les
   cotisations l'utilisent. Pour la cagnotte reçue, aucune catégorie de revenu
   n'existe : ajout de `inc_tontine` (« Tontine reçue »), proposée par la mise à
   niveau du catalogue (clé de version relevée : ajout seul, jamais une
   catégorie supprimée par l'utilisateur). Repli sur « Autres revenus » si
   absente.
2. « Type de compte tontine » : c'est un **modèle de compte** (`acc.tontine`,
   type `other`, fournisseur `tontine`, épargne), pas un `AccountType`.
3. L'échéance `tontine` du calendrier vient des récurrences de catégorie
   `cat_informal` (dont la démo `demo_rec_tontine`) : conservée telle quelle ;
   les tontines complètes y ajoutent leurs cotisations et cagnottes.
4. Le parseur rangeait déjà « Tontine 10 000 » en `sub_informal_tontine`
   (vocabulaire) : la carte de confirmation y ajoute le rapprochement avec la
   tontine correspondante.
5. Conversion : la récurrence d'origine reste active sauf si l'utilisateur
   coche « Désactiver la récurrence d'origine ». Tant qu'elle reste active, la
   tontine ne compte pas une seconde fois ses cotisations dans le reste par
   jour (la récurrence les compte déjà) — sinon double comptage.
6. Nombre de membres : avec plusieurs mains ou des demi-mains, le nombre de
   tours dépend des **mains** ; le champ est présenté comme « nombre de mains
   (tours) au total, les vôtres comprises — souvent le nombre de membres ».

### Phases

| Phase | Contenu |
|---|---|
| 1 | Modèle, règles, `buildSchedule`, création en 4 écrans avec aperçu et rappel « carnet de suivi », conversion d'une récurrence, démo, formules (`tontine_multiple`, `tontine_group_create`, limite 1 tontine active en gratuit) |
| 2 | « Mes tontines », position nette, « J'ai cotisé » / « J'ai reçu la cagnotte » (opération réelle liée), retards, saisie vocale et écrite, rappels (`tontineDue`), reste par jour, patrimoine, calendrier, accueil |
| 3 | « Comprendre ma tontine », coût de la commission, événements du coach `tontine_due`, `tontine_late`, `tontine_payout_soon`, `tontine_all_on_time` |

## Rapport du Lot T1

### Ce qui est fait

| Phase | Contenu |
|---|---|
| 1 | Collections `tontines` / `tontineEntries` (règles + tests, synchro, export et suppression génériques) ; `buildSchedule` (tournante avec mains et demi-mains, collecteur avec commission saisie, cotisation fixe, fréquences jour / semaine / 2 semaines / mois / autre) ; création en 4 écrans avec aperçu et mention « carnet de suivi » ; « Mes tontines » ; conversion d'une récurrence (proposée, jamais imposée ; récurrence désactivée seulement si l'utilisateur coche la case) ; démo « Tontine du bureau » ; formules ; catégorie « Tontine reçue » ; CGU. |
| 2 | Position nette expliquée ; « J'ai cotisé » / « Je l'ai payée » / « J'ai reçu la cagnotte » (confirmés, opération réelle + entrée liée, annulés avec l'opération) ; retards et « Reporter » ; carte d'accueil (≤ 3 jours ou retard) ; calendrier ; rappels veille 18 h et jour même 8 h (`tontineDue`, actif par défaut) ; reste par jour ; patrimoine ; saisie vocale et écrite (tontine proposée sur la carte de confirmation). |
| 3 | « Comprendre ma tontine » (texte neutre ; commission du collecteur en % : « Commission : 1 000 F sur 31 000 F, soit 3,2 % ») ; événements du coach `tontine_due`, `tontine_late`, `tontine_payout_soon`, `tontine_all_on_time` via `planDelivery`. |

Aucune nouvelle dépendance native.

### Expressions locales à valider

Dans `src/core/entry/vocabulary.json` (`tontinePayout`), **inactives** :
« j'ai pris ma tontine », « prendre la tontine », « j'ai bouffé la tontine »,
« j'ai mangé la tontine », « c'est mon tour de bouffer », « j'ai ramassé la
tontine ». Pour en activer une : `"actif": true`. Les formulations standard
(« j'ai reçu la tontine / la cagnotte », « j'ai touché… », « c'est mon tour »)
sont reconnues sans validation.

### Ce qui a réellement été testé, et comment

- **Tests unitaires (Vitest), 457 au total**, dont : `buildSchedule`
  (tournante 10 × 10 000 mensuelle, 2 mains, demi-main, hebdomadaire,
  journalière, toutes les 2 semaines, personnalisée, 31 janvier → 28 février,
  cagnotte avec frais, collecteur 31 jours avec commission, cotisation fixe),
  position nette (avant mon tour, le jour de mon tour, après, fin de cycle = 0
  hors frais, collecteur), retard / report, reste par jour (cotisation
  déduite, cagnotte attendue non comptée, pas de double comptage avec la
  récurrence d'origine), rappels, accueil, calendrier, patrimoine,
  validation de saisie, conversion (récurrence intacte), rapprochement d'une
  phrase (nom, montant, échéance), expressions locales inactives, coach (4
  événements ; voix sans montant ni nom), résumé IA sans tontine ni surnom,
  formules (1 tontine gratuite, Plus / Famille, prix et droits existants
  inchangés), démonstration.
- **Règles Firestore sur l'émulateur (38)** : tontine et entrées valides,
  demi-main, validation des champs, isolation entre utilisateurs, enfant
  sans accès dans un espace familial.
- **Parcours de bout en bout** (Playwright, export web + émulateurs), 18
  suites dont `tontine.js` : démo (liste, échéancier « Vous » / « Tour n »),
  création d'un collecteur (3,2 %) et d'une tournante à demi-main, conversion
  sans désactivation (récurrence toujours active) puis, sur un vrai compte,
  avec désactivation confirmée (récurrence « Inactif »), limite gratuite,
  position nette, « J'ai cotisé » puis suppression de l'opération, phrase
  « J'ai cotisé ma tontine du bureau » et « J'ai reçu la tontine du
  bureau », position « après mon tour », calendrier, horloge avancée de 70
  jours (retard, « Je l'ai payée » / « Reporter », carte d'accueil, alerte du
  coach), « Comprendre ma tontine ». L'audit des formulaires passe (103/103).
- **Export Android** et compilation des Cloud Functions à chaque phase.

### Ce qui n'a PAS été testé

- Notifications réelles (veille / jour même) sur un téléphone : seules les
  dates calculées sont testées.
- Reconnaissance vocale réelle (la phrase écrite emprunte le même parseur ;
  la voix est simulée dans les tests).
- Voix réelle du coach, sons.
- Patrimoine à l'écran (formule Famille) : calcul testé, écran non parcouru.
- Build natif et mise à jour OTA.
- Tontine partagée (Lot T2) : non commencée, comme demandé.

### Tests à faire sur un téléphone

1. Créer une tontine tournante (10 mains, 10 000 / mois, mon tour au 6e) :
   aperçu, mention « carnet de suivi ».
2. « J'ai cotisé » → confirmation → l'opération apparaît dans l'Historique
   et le compte ; « Annuler » (5 s) la retire, la position nette revient.
3. Dire « Tontine 10 000 », « J'ai cotisé ma tontine du bureau », « J'ai
   reçu la tontine » : la carte propose la bonne tontine.
4. Rappels : la veille à 18 h et le jour même à 8 h ; les désactiver dans
   Paramètres › Notifications › « Cotisations de tontine ».
5. Laisser passer une échéance : « En retard », carte d'accueil, alerte du
   coach ; « Reporter » puis « Je l'ai payée ».
6. Collecteur 1 000 / jour, 31 jours, commission 1 000 : « 3,2 % ».
7. Convertir une récurrence « Tontine » existante, sans puis avec la
   désactivation.
8. Formule gratuite : deuxième tontine active → offre Plus.
9. Application en anglais.
10. (Lot T2, plus tard) un vrai test de groupe avec 3 téléphones.
